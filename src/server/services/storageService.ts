import { getEnv } from "@/config/env";
import { PRUNE_INTERVAL_MS } from "@/domain/retention";
import { storageUsage, type StorageUsage } from "@/domain/storage";
import { db } from "@/lib/db";

// Сколько места занимает база и когда была автоочистка — для «Управления» → «База данных».

const MB = 1024 * 1024;

export interface StorageReport {
  /** Вся база PostgreSQL: именно её Supabase сравнивает с лимитом тарифа (с чужими таблицами и служебными). */
  databaseBytes: number;
  limitBytes: number;
  usage: StorageUsage;
  /** Только таблицы приложения — то, на что влияет автоочистка. */
  appBytes: number;
  /** Размер каждой таблицы приложения с индексами, по имени таблицы. */
  tableBytes: Record<string, number>;
  lastPrune: { at: Date; summary: string | null } | null;
  /** Когда worker почистит в следующий раз (не раньше). null — ещё ни разу, почистит при ближайшем запуске. */
  nextPruneAt: Date | null;
}

export async function getStorageReport(): Promise<StorageReport> {
  const [database, tables, lastPrune] = await Promise.all([
    db.$queryRaw<{ bytes: bigint }[]>`SELECT pg_database_size(current_database()) AS bytes`,
    // Схема приложения — первая в search_path (current_schema), чужие схемы того же Supabase не считаются.
    db.$queryRaw<{ name: string; bytes: bigint }[]>`
      SELECT relname AS name, pg_total_relation_size(relid) AS bytes
      FROM pg_catalog.pg_statio_user_tables WHERE schemaname = current_schema()`,
    db.auditLog.findFirst({ where: { action: "DATA_PRUNED" }, orderBy: { at: "desc" }, select: { at: true, target: true } }),
  ]);

  const databaseBytes = Number(database[0]?.bytes ?? 0);
  const limitBytes = getEnv().DATABASE_SIZE_LIMIT_MB * MB;
  const tableBytes = Object.fromEntries(tables.map((table) => [table.name, Number(table.bytes)]));
  return {
    databaseBytes,
    limitBytes,
    usage: storageUsage(databaseBytes, limitBytes),
    appBytes: Object.values(tableBytes).reduce((sum, bytes) => sum + bytes, 0),
    tableBytes,
    lastPrune: lastPrune ? { at: lastPrune.at, summary: lastPrune.target } : null,
    nextPruneAt: lastPrune ? new Date(lastPrune.at.getTime() + PRUNE_INTERVAL_MS) : null,
  };
}

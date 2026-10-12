import { isPruneDue, retentionCutoffs } from "@/domain/retention";
import { LOCK_KEYS, tryAcquireLock } from "@/lib/advisoryLock";
import { db } from "@/lib/db";

// Автоочистка устаревших данных. Сроки — в src/domain/retention.ts.

export interface PruneSummary {
  listings: number;
  runs: number;
  auditLogs: number;
  pendingUsers: number;
  loginFailures: number;
  heartbeats: number;
}

/**
 * Удаляет устаревшие данные. Под блокировкой обновлений: иначе сбор мог бы вернуть в выдачу объявление,
 * которое в этот момент удаляется. Блокировка занята — null, чистка пройдёт в следующий раз.
 */
export async function pruneStaleData(now = new Date()): Promise<PruneSummary | null> {
  const lock = await tryAcquireLock(LOCK_KEYS.collection);
  if (!lock) return null;
  try {
    const cutoff = retentionCutoffs(now);
    // Оценка, аналоги и история цен удаляются вместе с объявлением (onDelete: Cascade),
    // ссылки дубликатов на него обнуляются (SetNull). Активные объявления не трогаются никогда.
    const listings = await db.listing.deleteMany({
      where: { status: "INACTIVE", deactivatedAt: { lt: cutoff.inactiveListing } },
    });
    // RUNNING/QUEUED не трогаем: у них нет finishedAt.
    const runs = await db.collectionRun.deleteMany({ where: { finishedAt: { lt: cutoff.finishedRun } } });
    const auditLogs = await db.auditLog.deleteMany({ where: { at: { lt: cutoff.auditLog } } });
    const pendingUsers = await db.user.deleteMany({
      where: { status: "PENDING", role: "USER", createdAt: { lt: cutoff.pendingUser } },
    });
    const loginFailures = await db.loginFailure.deleteMany({ where: { at: { lt: cutoff.loginFailure } } });
    const heartbeats = await db.workerHeartbeat.deleteMany({ where: { lastBeatAt: { lt: cutoff.workerHeartbeat } } });

    const summary: PruneSummary = {
      listings: listings.count,
      runs: runs.count,
      auditLogs: auditLogs.count,
      pendingUsers: pendingUsers.count,
      loginFailures: loginFailures.count,
      heartbeats: heartbeats.count,
    };
    // Запись в журнале — и отчёт для админа, и отметка времени, по которой pruneIfDue считает сутки
    // (поэтому at: now, а не время базы).
    await db.auditLog.create({ data: { at: now, actorLogin: "system", action: "DATA_PRUNED", target: formatPruneSummary(summary) } });
    return summary;
  } finally {
    await lock.release();
  }
}

/** Чистка раз в сутки: время прошлой берётся из журнала, поэтому переживает перезапуски worker'а. */
export async function pruneIfDue(now = new Date()): Promise<PruneSummary | null> {
  const last = await db.auditLog.findFirst({ where: { action: "DATA_PRUNED" }, orderBy: { at: "desc" }, select: { at: true } });
  if (!isPruneDue(last?.at ?? null, now)) return null;
  return pruneStaleData(now);
}

export function formatPruneSummary(summary: PruneSummary): string {
  return (
    `объявлений ${summary.listings}, запусков ${summary.runs}, записей журнала ${summary.auditLogs}, ` +
    `заявок ${summary.pendingUsers}, попыток входа ${summary.loginFailures}, сигналов worker'а ${summary.heartbeats}`
  );
}

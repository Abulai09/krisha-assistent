import { rm } from "node:fs/promises";
import { getEnv, scheduledSourceKeys } from "@/config/env";
import { db } from "@/lib/db";
import { errorMessage } from "@/lib/utils/async";
import { logger } from "@/lib/utils/logger";
import { ensureDataSource, runCollection, type CollectionSummary } from "@/server/services/collectionService";
import { nextQueuedRun } from "@/server/services/runQueueService";
import { getSchedulableSource, listSchedulableSources } from "@/server/sources/registry";

/** Регистрирует все известные источники в БД и записывает их честный текущий статус. */
export async function syncSourceStatuses() {
  for (const source of listSchedulableSources()) {
    const record = await ensureDataSource(source);
    try {
      const status = await source.checkStatus();
      if (status.availability === "NOT_CONNECTED") {
        await db.dataSource.update({ where: { id: record.id }, data: { status: "NOT_CONNECTED", statusMessage: status.message } });
      } else if (record.status === "NOT_CONNECTED") {
        await db.dataSource.update({ where: { id: record.id }, data: { status: "CONNECTED", statusMessage: status.message } });
      }
    } catch (error) {
      await db.dataSource.update({
        where: { id: record.id },
        data: { status: "ERROR", statusMessage: errorMessage(error), lastErrorAt: new Date(), lastError: errorMessage(error) },
      });
    }
  }
}

/** Выполняет один запуск из очереди, если он есть. */
export async function processQueuedRun(): Promise<CollectionSummary | null> {
  const queued = await nextQueuedRun();
  if (!queued) return null;
  const summary = await runCollection({ source: queued.source, trigger: "MANUAL", queuedRunId: queued.runId });
  if (queued.inputFile && summary.status !== "LOCKED") {
    await rm(queued.inputFile, { force: true }).catch((error) =>
      logger.warn("Не удалось удалить обработанный файл импорта", { error: errorMessage(error) }),
    );
  }
  return summary;
}

/** Плановое обновление источников, у которых подошло время. Время берётся из БД — переживает перезапуск worker'а. */
export async function runDueScheduledCollections(now = new Date()): Promise<CollectionSummary[]> {
  const intervalMs = getEnv().WORKER_INTERVAL_MINUTES * 60_000;
  const summaries: CollectionSummary[] = [];

  for (const key of scheduledSourceKeys()) {
    const source = getSchedulableSource(key);
    if (!source) {
      logger.warn("В SCHEDULED_SOURCES указан неизвестный источник", { key });
      continue;
    }
    const lastRun = await db.collectionRun.findFirst({
      where: { source: { key }, trigger: "SCHEDULED" },
      orderBy: { requestedAt: "desc" },
      select: { requestedAt: true },
    });
    if (lastRun && now.getTime() - lastRun.requestedAt.getTime() < intervalMs) continue;
    summaries.push(await runCollection({ source, trigger: "SCHEDULED", now }));
  }
  return summaries;
}

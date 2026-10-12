import { getEnv, scheduledSourceKeys } from "@/config/env";
import { db } from "@/lib/db";

// Свежесть данных: обновляются ли источники по расписанию и нет ли «зависших» запусков.
// Сайт при поломке worker'а продолжает работать, но показывает старые данные — без этой проверки
// о поломке никто не узнает.

/** Запуск дольше этого — не выполняется, а завис (обычный запуск krisha-web — около 10 минут). */
const STUCK_AFTER_MS = 60 * 60 * 1000;
/** Устаревшими считаем данные, не обновлявшиеся дольше трёх интервалов worker'а. */
const STALE_INTERVALS = 3;

export type DataHealth = {
  ok: boolean;
  staleSources: { key: string; lastSuccessAt: Date | null }[];
  stuckRuns: number;
  maxAgeHours: number;
};

export async function getDataHealth(now = new Date()): Promise<DataHealth> {
  const keys = scheduledSourceKeys();
  const maxAgeMs = STALE_INTERVALS * getEnv().WORKER_INTERVAL_MINUTES * 60_000;
  const [sources, stuckRuns] = await Promise.all([
    db.dataSource.findMany({ where: { key: { in: keys } }, select: { key: true, lastSuccessAt: true } }),
    db.collectionRun.count({ where: { status: "RUNNING", startedAt: { lt: new Date(now.getTime() - STUCK_AFTER_MS) } } }),
  ]);
  const lastSuccess = new Map(sources.map((source) => [source.key, source.lastSuccessAt]));
  const staleSources = keys
    .map((key) => ({ key, lastSuccessAt: lastSuccess.get(key) ?? null }))
    .filter(({ lastSuccessAt }) => !lastSuccessAt || now.getTime() - lastSuccessAt.getTime() > maxAgeMs);
  return { ok: staleSources.length === 0 && stuckRuns === 0, staleSources, stuckRuns, maxAgeHours: maxAgeMs / 3_600_000 };
}

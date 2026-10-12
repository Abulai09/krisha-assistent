// Сколько хранить данные, которые больше не нужны сайту. Без чистки база растёт без предела: снятые объявления
// только помечаются INACTIVE, а с ними остаются оценка, аналоги и история цен (~5 КБ на объявление).

const DAY_MS = 24 * 60 * 60 * 1000;

export const RETENTION_DAYS = {
  /** Снятое с продажи объявление — вместе с оценкой и историей цен. Вернётся в выдачу — придёт как новое. */
  inactiveListing: 90,
  /** Завершённый запуск обновления (журнал в «Управлении»). */
  finishedRun: 90,
  /** Журнал действий администратора — дольше всего: нужен, чтобы разобраться в инциденте задним числом. */
  auditLog: 365,
  /** Заявка на регистрацию, которую так и не одобрили. */
  pendingUser: 30,
  /** Неудачные попытки входа: для ограничения подбора нужны только последние 15 минут. */
  loginFailure: 1,
  /** Сигнал от worker'а, который давно не отвечает (процесс завершён). */
  workerHeartbeat: 1,
} as const;

/** Как часто запускать чистку: данные устаревают днями, чаще — лишние запросы к базе. */
export const PRUNE_INTERVAL_MS = DAY_MS;

export type RetentionCutoffs = Record<keyof typeof RETENTION_DAYS, Date>;

/** Границы: всё, что старше соответствующей даты, удаляется. */
export function retentionCutoffs(now: Date): RetentionCutoffs {
  return Object.fromEntries(
    Object.entries(RETENTION_DAYS).map(([key, days]) => [key, new Date(now.getTime() - days * DAY_MS)]),
  ) as RetentionCutoffs;
}

/** Пора ли чистить: прошло не меньше интервала с прошлой чистки (или её ещё не было). */
export function isPruneDue(lastPrunedAt: Date | null, now: Date): boolean {
  return lastPrunedAt === null || now.getTime() - lastPrunedAt.getTime() >= PRUNE_INTERVAL_MS;
}

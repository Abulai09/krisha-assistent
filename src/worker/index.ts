import { getEnv, scheduledSourceKeys } from "@/config/env";
import { db } from "@/lib/db";
import { errorMessage, sleep } from "@/lib/utils/async";
import { logger } from "@/lib/utils/logger";
import { failInterruptedRuns } from "@/server/services/collectionService";
import { beat } from "@/server/services/heartbeatService";
import { processQueuedRun, runDuePruning, runDueScheduledCollections, syncSourceStatuses } from "./tasks";

// Постоянно работающий фоновый процесс: плановые обновления + ручные запуски из очереди.
// Запуск: npm run worker. Остановка: Ctrl+C (текущая задача завершится корректно).

const TICK_MS = 15_000;

let stopping = false;
let currentTask: string | null = null;
const startedAt = new Date();

function requestStop(signal: string) {
  if (stopping) {
    logger.warn("Повторный сигнал — немедленная остановка", { signal });
    process.exit(1);
  }
  stopping = true;
  logger.info("Остановка worker'а после завершения текущей задачи", { signal, currentTask });
}

process.on("SIGINT", () => requestStop("SIGINT"));
process.on("SIGTERM", () => requestStop("SIGTERM"));

async function runTask(name: string, task: () => Promise<unknown>) {
  currentTask = name;
  await beat(startedAt, currentTask).catch(() => undefined);
  try {
    await task();
  } catch (error) {
    // Ошибка одной задачи не должна останавливать worker — она уже записана в CollectionRun.
    logger.error("Задача завершилась ошибкой", { task: name, error: errorMessage(error) });
  } finally {
    currentTask = null;
    await beat(startedAt, null).catch(() => undefined);
  }
}

async function main() {
  const env = getEnv();
  logger.info("Worker запущен", {
    pid: process.pid,
    intervalMinutes: env.WORKER_INTERVAL_MINUTES,
    scheduledSources: scheduledSourceKeys(),
  });

  const interrupted = await failInterruptedRuns();
  if (interrupted > 0) logger.warn("Отмечены прерванные запуски", { count: interrupted });
  await syncSourceStatuses();

  while (!stopping) {
    try {
      await beat(startedAt, null);
      await runTask("Ручной запуск из очереди", processQueuedRun);
      if (!stopping) await runTask("Плановое обновление", runDueScheduledCollections);
      if (!stopping) await runTask("Автоочистка", runDuePruning);
    } catch (error) {
      // Например, временная недоступность БД — пробуем снова на следующем шаге.
      logger.error("Ошибка цикла worker'а", { error: errorMessage(error) });
    }
    for (let waited = 0; waited < TICK_MS && !stopping; waited += 1_000) await sleep(1_000);
  }

  await db.$disconnect();
  logger.info("Worker остановлен");
}

main().catch(async (error) => {
  logger.error("Worker аварийно завершился", { error: errorMessage(error) });
  await db.$disconnect().catch(() => undefined);
  process.exit(1);
});

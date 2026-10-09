import { getEnv } from "@/config/env";
import { db } from "@/lib/db";
import { FileImportSource, FILE_IMPORT_SOURCE } from "@/server/sources/fileImportSource";
import { getSchedulableSource } from "@/server/sources/registry";
import type { ListingSource } from "@/server/sources/types";
import { ensureDataSource } from "./collectionService";

// Очередь ручных запусков. Админка только ставит задачу в очередь,
// а выполняет её worker — тяжёлая работа не идёт внутри HTTP-запроса.

export class RunQueueError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RunQueueError";
  }
}

async function assertCanEnqueue(now: Date) {
  const active = await db.collectionRun.findFirst({ where: { status: { in: ["QUEUED", "RUNNING"] } } });
  if (active) throw new RunQueueError("Обновление уже в очереди или выполняется. Дождитесь завершения.");

  const cooldownMs = getEnv().MANUAL_RUN_COOLDOWN_MINUTES * 60_000;
  const recent = await db.collectionRun.findFirst({
    where: { trigger: "MANUAL", requestedAt: { gt: new Date(now.getTime() - cooldownMs) } },
    orderBy: { requestedAt: "desc" },
  });
  if (recent) {
    const waitMinutes = Math.ceil((recent.requestedAt.getTime() + cooldownMs - now.getTime()) / 60_000);
    throw new RunQueueError(`Ручной запуск возможен не чаще раза в ${getEnv().MANUAL_RUN_COOLDOWN_MINUTES} мин. Подождите ещё ${waitMinutes} мин.`);
  }
}

export async function enqueueManualRun(sourceKey: string, now = new Date()) {
  const source = getSchedulableSource(sourceKey);
  if (!source) throw new RunQueueError("Неизвестный источник данных");
  await assertCanEnqueue(now);
  const dataSource = await ensureDataSource(source);
  return db.collectionRun.create({ data: { sourceId: dataSource.id, trigger: "MANUAL", status: "QUEUED", requestedAt: now } });
}

export async function enqueueFileImport(inputFile: string, now = new Date()) {
  await assertCanEnqueue(now);
  const dataSource = await ensureDataSource(new FileImportSource(inputFile));
  return db.collectionRun.create({
    data: { sourceId: dataSource.id, trigger: "MANUAL", status: "QUEUED", requestedAt: now, inputFile },
  });
}

export interface QueuedRun {
  runId: string;
  source: ListingSource;
  inputFile: string | null;
}

/** Следующий запуск из очереди (самый ранний). */
export async function nextQueuedRun(): Promise<QueuedRun | null> {
  const run = await db.collectionRun.findFirst({
    where: { status: "QUEUED" },
    orderBy: { requestedAt: "asc" },
    include: { source: { select: { key: true } } },
  });
  if (!run) return null;

  if (run.source.key === FILE_IMPORT_SOURCE.key) {
    if (!run.inputFile) {
      await failQueuedRun(run.id, "Не найден файл импорта");
      return nextQueuedRun();
    }
    return { runId: run.id, source: new FileImportSource(run.inputFile), inputFile: run.inputFile };
  }

  const source = getSchedulableSource(run.source.key);
  if (!source) {
    await failQueuedRun(run.id, `Источник «${run.source.key}» больше не поддерживается`);
    return nextQueuedRun();
  }
  return { runId: run.id, source, inputFile: null };
}

async function failQueuedRun(runId: string, message: string) {
  await db.collectionRun.update({
    where: { id: runId },
    data: { status: "FAILED", finishedAt: new Date(), errorMessage: message },
  });
}

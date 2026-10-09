import { normalizeListing, type NormalizedListing } from "@/domain/listing/normalize";
import { validateRawListing, type ListingValidationError } from "@/domain/listing/rawListingSchema";
import type { Prisma, RunTrigger } from "@/generated/prisma/client";
import { LOCK_KEYS, tryAcquireLock } from "@/lib/advisoryLock";
import { db } from "@/lib/db";
import { errorMessage, mapWithConcurrency, withRetry, withTimeout } from "@/lib/utils/async";
import { logger } from "@/lib/utils/logger";
import { InvalidImportFileError, SourceNotConnectedError, type ListingSource } from "@/server/sources/types";
import { refreshDuplicates } from "./duplicateService";
import { deactivateMissingListings, ingestListing, type IngestOutcome } from "./ingestService";
import { revalueAllListings } from "./valuationService";

const FETCH_TIMEOUT_MS = 120_000;
const FETCH_ATTEMPTS = 3;
const FETCH_RETRY_BASE_MS = 2_000;
const INGEST_CONCURRENCY = 4;
const MAX_ERROR_SAMPLES = 50;

export interface CollectionSummary {
  runId: string | null;
  status: "SUCCESS" | "PARTIAL" | "FAILED" | "LOCKED";
  fetched: number;
  created: number;
  updated: number;
  unchanged: number;
  invalid: number;
  deactivated: number;
  valued: number;
  error?: string;
}

export interface RunCollectionOptions {
  source: ListingSource;
  trigger: RunTrigger;
  /** Существующий запуск из очереди (ручной запуск/импорт из админки). */
  queuedRunId?: string;
  now?: Date;
  /** Базовая задержка между повторами запроса к источнику (в тестах — 0). */
  retryBaseDelayMs?: number;
}

/** Создаёт или обновляет запись источника в БД по описанию из кода. */
export async function ensureDataSource(source: ListingSource) {
  const descriptor = {
    name: source.name,
    kind: source.kind,
    isSynthetic: source.isSynthetic,
    providesFullSnapshot: source.providesFullSnapshot,
  };
  return db.dataSource.upsert({
    where: { key: source.key },
    create: { key: source.key, ...descriptor },
    update: descriptor,
  });
}

/**
 * Полный цикл обновления одного источника:
 * получение → проверка → нормализация → сохранение → деактивация → дубликаты → пересчёт оценок.
 * Одновременно выполняется только один цикл (advisory lock в PostgreSQL).
 */
export async function runCollection(options: RunCollectionOptions): Promise<CollectionSummary> {
  const now = options.now ?? new Date();
  const summary: CollectionSummary = {
    runId: options.queuedRunId ?? null,
    status: "SUCCESS",
    fetched: 0,
    created: 0,
    updated: 0,
    unchanged: 0,
    invalid: 0,
    deactivated: 0,
    valued: 0,
  };

  const lock = await tryAcquireLock(LOCK_KEYS.collection);
  if (!lock) {
    logger.warn("Обновление уже выполняется другим процессом", { source: options.source.key });
    return { ...summary, status: "LOCKED" };
  }

  try {
    return await executeRun(options, now, summary);
  } finally {
    await lock.release();
  }
}

async function executeRun(options: RunCollectionOptions, now: Date, summary: CollectionSummary): Promise<CollectionSummary> {
  const { source } = options;
  const dataSource = await ensureDataSource(source);
  const run = options.queuedRunId
    ? await db.collectionRun.update({
        where: { id: options.queuedRunId },
        data: { status: "RUNNING", startedAt: now },
      })
    : await db.collectionRun.create({
        data: { sourceId: dataSource.id, trigger: options.trigger, status: "RUNNING", startedAt: now },
      });
  summary.runId = run.id;
  logger.info("Обновление начато", { runId: run.id, source: source.key, trigger: options.trigger });

  const errorSamples: ListingValidationError[] = [];
  try {
    const status = await source.checkStatus();
    if (status.availability === "NOT_CONNECTED") throw new SourceNotConnectedError(status.message);

    const rawListings = await withRetry(
      () => withTimeout(source.fetchListings({ now }), FETCH_TIMEOUT_MS, `Источник «${source.name}»`),
      {
        attempts: FETCH_ATTEMPTS,
        baseDelayMs: options.retryBaseDelayMs ?? FETCH_RETRY_BASE_MS,
        isRetryable: (error) => !(error instanceof SourceNotConnectedError || error instanceof InvalidImportFileError),
        onRetry: (error, attempt, delayMs) =>
          logger.warn("Повтор запроса к источнику", { source: source.key, attempt, delayMs, error: errorMessage(error) }),
      },
    );
    summary.fetched = rawListings.length;

    const valid = new Map<string, NormalizedListing>();
    for (const raw of rawListings) {
      const result = validateRawListing(raw);
      if (result.ok) {
        // Повтор одного externalId в одной выгрузке — берём последнюю версию.
        valid.set(result.listing.externalId, normalizeListing(result.listing, source.key));
      } else {
        summary.invalid++;
        if (errorSamples.length < MAX_ERROR_SAMPLES) errorSamples.push(result.error);
      }
    }

    if (source.providesFullSnapshot && valid.size === 0) {
      throw new Error("Источник вернул пустой список — деактивация объявлений пропущена, чтобы не потерять данные");
    }

    const outcomes = await mapWithConcurrency([...valid.values()], INGEST_CONCURRENCY, (listing) =>
      ingestListing(dataSource.id, listing, run.id, now),
    );
    countOutcomes(outcomes, summary);

    if (source.providesFullSnapshot) {
      summary.deactivated = await deactivateMissingListings(dataSource.id, now, now);
    }

    await refreshDuplicates();
    summary.valued = await revalueAllListings(now);
    summary.status = summary.invalid > 0 ? "PARTIAL" : "SUCCESS";

    await db.$transaction([
      db.collectionRun.update({ where: { id: run.id }, data: runData(summary, errorSamples, new Date()) }),
      db.dataSource.update({
        where: { id: dataSource.id },
        data: { status: "CONNECTED", statusMessage: status.message, lastSuccessAt: new Date() },
      }),
    ]);
    logger.info("Обновление завершено", { ...summary });
    return summary;
  } catch (error) {
    const message = errorMessage(error);
    summary.status = "FAILED";
    summary.error = message;
    await db.$transaction([
      db.collectionRun.update({
        where: { id: run.id },
        data: { ...runData(summary, errorSamples, new Date()), errorMessage: message },
      }),
      db.dataSource.update({
        where: { id: dataSource.id },
        data: {
          status: error instanceof SourceNotConnectedError ? "NOT_CONNECTED" : "ERROR",
          statusMessage: message,
          lastErrorAt: new Date(),
          lastError: message,
        },
      }),
    ]);
    logger.error("Обновление завершилось ошибкой", { runId: run.id, source: source.key, error: message });
    return summary;
  }
}

/** Пересчёт оценок без получения новых данных (например, после изменения алгоритма). */
export async function runRevaluation(now = new Date()): Promise<number | null> {
  const lock = await tryAcquireLock(LOCK_KEYS.collection);
  if (!lock) return null;
  try {
    await refreshDuplicates();
    return await revalueAllListings(now);
  } finally {
    await lock.release();
  }
}

/**
 * Запуски в статусе RUNNING, оставшиеся после аварийной остановки worker'а.
 * Вызывается, только когда блокировка свободна, то есть ни один запуск реально не идёт.
 */
export async function failInterruptedRuns(): Promise<number> {
  const lock = await tryAcquireLock(LOCK_KEYS.collection);
  if (!lock) return 0;
  try {
    const result = await db.collectionRun.updateMany({
      where: { status: "RUNNING" },
      data: { status: "FAILED", finishedAt: new Date(), errorMessage: "Прервано: процесс был остановлен во время обновления" },
    });
    return result.count;
  } finally {
    await lock.release();
  }
}

function countOutcomes(outcomes: IngestOutcome[], summary: CollectionSummary) {
  for (const outcome of outcomes) summary[outcome]++;
}

function runData(summary: CollectionSummary, errorSamples: ListingValidationError[], finishedAt: Date) {
  return {
    status: summary.status === "LOCKED" ? "FAILED" : summary.status,
    finishedAt,
    fetchedCount: summary.fetched,
    createdCount: summary.created,
    updatedCount: summary.updated,
    unchangedCount: summary.unchanged,
    invalidCount: summary.invalid,
    deactivatedCount: summary.deactivated,
    valuedCount: summary.valued,
    errorSamples: errorSamples.length > 0 ? (errorSamples as unknown as Prisma.InputJsonValue) : undefined,
  } as const;
}

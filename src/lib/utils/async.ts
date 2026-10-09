// Небольшие утилиты надёжности для фоновых задач: тайм-аут, повтор с задержкой, ограничение параллелизма.

export class TimeoutError extends Error {
  constructor(label: string, ms: number) {
    super(`${label}: превышено время ожидания (${Math.round(ms / 1000)} с)`);
    this.name = "TimeoutError";
  }
}

export async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(label, ms)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export interface RetryOptions {
  attempts: number;
  baseDelayMs: number;
  /** Повторять только временные ошибки; постоянные (например, «источник не подключён») — сразу пробрасывать. */
  isRetryable?: (error: unknown) => boolean;
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
  sleep?: (ms: number) => Promise<void>;
}

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Экспоненциальная задержка: base, 2×base, 4×base… */
export async function withRetry<T>(operation: () => Promise<T>, options: RetryOptions): Promise<T> {
  const wait = options.sleep ?? sleep;
  let lastError: unknown;
  for (let attempt = 1; attempt <= options.attempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const retryable = options.isRetryable?.(error) ?? true;
      if (!retryable || attempt === options.attempts) break;
      const delayMs = options.baseDelayMs * 2 ** (attempt - 1);
      options.onRetry?.(error, attempt, delayMs);
      await wait(delayMs);
    }
  }
  throw lastError;
}

/** Выполняет задачи над элементами, не больше `limit` одновременно. Порядок результатов сохраняется. */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function runWorker() {
    while (next < items.length) {
      const index = next++;
      results[index] = await task(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runWorker));
  return results;
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

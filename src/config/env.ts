import { z } from "zod";

// Единственное место, где читается process.env. Остальной код получает уже проверенные значения.

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL не задан"),
  /**
   * Соединений с БД на процесс. Supabase Session pooler держит всего 15 на весь проект (worker + все функции
   * Vercel), поэтому по умолчанию: на Vercel — 2, иначе 5 (worker: 4 параллельных записи + блокировка — отдельно).
   */
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(20).optional(),
  /**
   * Режим Supabase pooler: session (5432, нужен worker'у) или transaction (6543, для Vercel).
   * По умолчанию: на Vercel — transaction, иначе — session. На не-Supabase адреса не влияет.
   */
  DATABASE_POOL_MODE: z.enum(["session", "transaction"]).optional(),
  /** Vercel выставляет VERCEL=1 в своих функциях. */
  VERCEL: z.string().optional(),
  ADMIN_TOKEN: z.string().optional(),
  SESSION_SECRET: z.string().optional(),
  WORKER_INTERVAL_MINUTES: z.coerce.number().int().min(5).max(24 * 60).default(60),
  MANUAL_RUN_COOLDOWN_MINUTES: z.coerce.number().int().min(1).max(24 * 60).default(5),
  /** Источники, которые worker обновляет по расписанию (ключи через запятую). */
  SCHEDULED_SOURCES: z.string().default("synthetic"),
  IMPORT_MAX_FILE_MB: z.coerce.number().min(0.1).max(50).default(5),
  IMPORT_MAX_ROWS: z.coerce.number().int().min(1).max(100_000).default(20_000),
  /** Сбор со страниц krisha.kz — выключен по умолчанию, см. docs/adr/0002. */
  KRISHA_WEB_ENABLED: z.stringbool().default(false),
  KRISHA_WEB_MAX_PAGES: z.coerce.number().int().min(1).max(20).default(5),
  /** Пауза между страницами; не меньше 2 с, чтобы не нагружать сайт. */
  KRISHA_WEB_DELAY_MS: z.coerce.number().int().min(2_000).max(60_000).default(4_000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

export type ServerEnv = z.infer<typeof envSchema>;

let cached: ServerEnv | null = null;

export function getEnv(): ServerEnv {
  if (cached) return cached;
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const problems = result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
    throw new Error(`Некорректная конфигурация окружения: ${problems}`);
  }
  cached = result.data;
  return cached;
}

/** Администрирование включено, только если заданы достаточно длинные секреты. */
export function getAdminSecrets(): { adminToken: string; sessionSecret: string } | null {
  const { ADMIN_TOKEN, SESSION_SECRET } = getEnv();
  if (!ADMIN_TOKEN || ADMIN_TOKEN.length < 16) return null;
  if (!SESSION_SECRET || SESSION_SECRET.length < 32) return null;
  return { adminToken: ADMIN_TOKEN, sessionSecret: SESSION_SECRET };
}

export function scheduledSourceKeys(): string[] {
  return getEnv()
    .SCHEDULED_SOURCES.split(",")
    .map((key) => key.trim())
    .filter(Boolean);
}

/** Настройки пула: на Vercel — transaction pooler, мало соединений и быстрое закрытие простаивающих. */
export function databasePoolSettings(): {
  mode: "session" | "transaction";
  max: number;
  idleTimeoutMillis: number;
} {
  const { DATABASE_POOL_MAX, DATABASE_POOL_MODE, VERCEL } = getEnv();
  const serverless = Boolean(VERCEL);
  return {
    mode: DATABASE_POOL_MODE ?? (serverless ? "transaction" : "session"),
    max: DATABASE_POOL_MAX ?? (serverless ? 2 : 5),
    idleTimeoutMillis: serverless ? 10_000 : 30_000,
  };
}

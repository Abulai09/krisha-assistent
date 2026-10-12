import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { PrismaClient } from "@/generated/prisma/client";
import { databasePoolSettings, getEnv } from "@/config/env";
import { pgConnectionConfig, urlForPoolMode } from "@/lib/pgConfig";
import { errorMessage } from "@/lib/utils/async";
import { logger } from "@/lib/utils/logger";

// Один PrismaClient на процесс. В dev Next.js перезагружает модули — храним экземпляр в globalThis,
// чтобы не открывать новый пул соединений при каждом изменении файла.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * Схема БД из `?schema=` в DATABASE_URL — тот же параметр читает `prisma migrate`.
 * Своя схема нужна, когда база общая с другим приложением (например, проект Supabase).
 */
export function databaseSchema(url: string): string {
  const schema = new URL(url).searchParams.get("schema") ?? "public";
  if (!/^[a-z_][a-z0-9_]*$/.test(schema)) throw new Error(`Некорректное имя схемы в DATABASE_URL: ${schema}`);
  return schema;
}

/** Ожидание свободного соединения для транзакции и предельная длительность транзакции. */
const TRANSACTION_MAX_WAIT_MS = 20_000;
const TRANSACTION_TIMEOUT_MS = 60_000;

function createClient(): PrismaClient {
  const { DATABASE_URL } = getEnv();
  const schema = databaseSchema(DATABASE_URL);
  // Запросы Prisma адаптер сам дополняет схемой, а сырой SQL ($queryRaw) ищет таблицы по search_path —
  // задаём его при открытии соединения (Supabase pooler пропускает этот параметр в обоих режимах).
  const { mode, max, idleTimeoutMillis } = databasePoolSettings();
  const pool = new Pool({
    ...pgConnectionConfig(urlForPoolMode(DATABASE_URL, mode)),
    max,
    idleTimeoutMillis,
    options: schema === "public" ? undefined : `-c search_path=${schema}`,
    // Без keep-alive простаивающее соединение (пока worker минутами читает Krisha) обрывает сеть/pooler.
    keepAlive: true,
  });
  // Обрыв простаивающего соединения: pg выбрасывает его из пула и сообщает событием 'error'.
  // Без обработчика Node.js завершает весь процесс (так падал worker с ECONNRESET).
  pool.on("error", (error) => logger.warn("Соединение с БД в пуле оборвалось — будет открыто новое", { error: errorMessage(error) }));
  return new PrismaClient({
    adapter: new PrismaPg(pool, { schema, disposeExternalPool: true }),
    // По умолчанию Prisma ждёт соединение для транзакции 2 с, а новое соединение с Supabase (Сингапур)
    // открывается 2,3–2,6 с — транзакции падали с «Unable to start a transaction in the given time».
    transactionOptions: { maxWait: TRANSACTION_MAX_WAIT_MS, timeout: TRANSACTION_TIMEOUT_MS },
  });
}

export const db: PrismaClient = globalForPrisma.prisma ?? createClient();

if (getEnv().NODE_ENV !== "production") globalForPrisma.prisma = db;

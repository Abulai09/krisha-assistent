import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { PrismaClient } from "@/generated/prisma/client";
import { getEnv } from "@/config/env";
import { pgConnectionConfig } from "@/lib/pgConfig";

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

function createClient(): PrismaClient {
  const { DATABASE_URL } = getEnv();
  const schema = databaseSchema(DATABASE_URL);
  // Запросы Prisma адаптер сам дополняет схемой, а сырой SQL ($queryRaw) ищет таблицы по search_path —
  // задаём его при открытии соединения (Supabase Session pooler этот параметр пропускает).
  const pool = new Pool({
    ...pgConnectionConfig(DATABASE_URL),
    options: schema === "public" ? undefined : `-c search_path=${schema}`,
  });
  return new PrismaClient({ adapter: new PrismaPg(pool, { schema, disposeExternalPool: true }) });
}

export const db: PrismaClient = globalForPrisma.prisma ?? createClient();

if (getEnv().NODE_ENV !== "production") globalForPrisma.prisma = db;

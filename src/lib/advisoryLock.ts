import { Client } from "pg";
import { getEnv } from "@/config/env";
import { pgConnectionConfig } from "@/lib/pgConfig";

/**
 * Блокировка «одно задание за раз» через pg_try_advisory_lock.
 *
 * Блокировка сессионная, поэтому держится на отдельном соединении, а не на пуле Prisma
 * (пул может выполнить unlock на другом соединении). Если процесс упадёт, соединение
 * закроется и PostgreSQL сам снимет блокировку — повторный запуск безопасен.
 */
export const LOCK_KEYS = {
  collection: 74_210_001,
} as const;

export interface HeldLock {
  release(): Promise<void>;
}

export async function tryAcquireLock(key: number): Promise<HeldLock | null> {
  const client = new Client(pgConnectionConfig(getEnv().DATABASE_URL));
  await client.connect();
  try {
    const result = await client.query<{ locked: boolean }>("SELECT pg_try_advisory_lock($1) AS locked", [key]);
    if (!result.rows[0]?.locked) {
      await client.end();
      return null;
    }
  } catch (error) {
    await client.end();
    throw error;
  }

  let released = false;
  return {
    async release() {
      if (released) return;
      released = true;
      try {
        await client.query("SELECT pg_advisory_unlock($1)", [key]);
      } finally {
        await client.end();
      }
    },
  };
}

import { Client } from "pg";
import { databasePoolSettings, getEnv } from "@/config/env";
import { pgConnectionConfig, urlForPoolMode } from "@/lib/pgConfig";
import { errorMessage } from "@/lib/utils/async";
import { logger } from "@/lib/utils/logger";

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
  // Сессионная блокировка в transaction pooler не держится — там соединение отдаётся другим клиентам после запроса.
  if (databasePoolSettings().mode === "transaction") {
    throw new Error("Блокировка обновлений требует DATABASE_POOL_MODE=session (Supabase Session pooler)");
  }
  const client = new Client({ ...pgConnectionConfig(urlForPoolMode(getEnv().DATABASE_URL, "session")), keepAlive: true });
  // Соединение блокировки простаивает весь сбор (минуты). Если сеть его оборвёт, без обработчика pg бросит
  // необработанное 'error' и уронит процесс. С обработчиком — предупреждение: PostgreSQL снимет блокировку сам,
  // текущий сбор доработает, а следующий запуск снова возьмёт блокировку.
  client.on("error", (error) => logger.warn("Соединение блокировки обновлений оборвалось", { error: errorMessage(error) }));
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
      } catch (error) {
        // Соединение уже оборвано — вместе с ним PostgreSQL снял и блокировку, снимать нечего.
        logger.warn("Не удалось снять блокировку обновлений явно", { error: errorMessage(error) });
      } finally {
        await client.end().catch(() => undefined);
      }
    },
  };
}

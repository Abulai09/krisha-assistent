import { db } from "@/lib/db";

// Ограничение подбора паролей: не больше MAX_FAILURES неудачных входов с одного адреса за окно.
// Счётчик — в базе: на Vercel много копий сайта, и счётчик в памяти каждая вела бы свой.
// Общего лимита «на всех» нет намеренно: иначе злоумышленник мог бы 30 ошибками закрыть вход всем, включая админа.

export const MAX_FAILURES = 10;
export const WINDOW_MS = 15 * 60 * 1000;
const KEEP_MS = 24 * 60 * 60 * 1000;

export async function isThrottled(ip: string, now = new Date()): Promise<boolean> {
  const failures = await db.loginFailure.count({ where: { ip, at: { gt: new Date(now.getTime() - WINDOW_MS) } } });
  return failures >= MAX_FAILURES;
}

export async function recordLoginFailure(ip: string, now = new Date()): Promise<void> {
  await db.$transaction([
    db.loginFailure.create({ data: { ip, at: now } }),
    // Заодно чистим старые записи всех адресов — таблица не растёт бесконечно.
    db.loginFailure.deleteMany({ where: { at: { lt: new Date(now.getTime() - KEEP_MS) } } }),
  ]);
}

export async function clearLoginFailures(ip: string): Promise<void> {
  await db.loginFailure.deleteMany({ where: { ip } });
}

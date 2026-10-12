import { createHmac, timingSafeEqual } from "node:crypto";

// Чистые функции сессии (без Next.js) — их легко покрыть тестами.
// Сессия без хранения в БД: в cookie — id пользователя и срок, подписанные HMAC; подделать её без
// SESSION_SECRET нельзя. Роль и статус cookie не хранит — их каждый раз берут из базы, поэтому блокировка
// действует сразу, а не после истечения срока. Отзыв всех сессий — смена SESSION_SECRET.

export const USER_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Администратору — короче: украденная cookie админа опаснее. */
export const ADMIN_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const USER_SESSION_VERSION = "u1";

function sign(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

/** Сравнение за постоянное время: хешируем обе строки, чтобы длины совпадали и время не выдавало префикс. */
export function safeEqual(a: string, b: string): boolean {
  const left = createHmac("sha256", "compare").update(a).digest();
  const right = createHmac("sha256", "compare").update(b).digest();
  return timingSafeEqual(left, right);
}

/** Общий пароль сайта: постоянное время, ограничение длины. */
export function verifySitePassword(input: string, sitePassword: string): boolean {
  return input.length > 0 && input.length <= 512 && safeEqual(input, sitePassword);
}

export function createUserSessionValue(
  secret: string,
  userId: string,
  now: Date,
  ttlMs = USER_SESSION_TTL_MS,
): { value: string; expiresAt: Date } {
  const expiresAt = new Date(now.getTime() + ttlMs);
  const payload = `${USER_SESSION_VERSION}.${userId}.${expiresAt.getTime()}`;
  return { value: `${payload}.${sign(secret, `user|${payload}`)}`, expiresAt };
}

/** id пользователя из действительной cookie или null. */
export function verifyUserSessionValue(value: string | undefined, secret: string, now: Date): string | null {
  if (!value || value.length > 256) return null;
  const parts = value.split(".");
  if (parts.length !== 4) return null;
  const [version, userId, expiresAtRaw, signature] = parts;
  if (version !== USER_SESSION_VERSION || !/^[a-z0-9]{1,64}$/.test(userId) || !/^\d{13}$/.test(expiresAtRaw)) return null;
  if (!safeEqual(signature, sign(secret, `user|${version}.${userId}.${expiresAtRaw}`))) return null;
  return Number(expiresAtRaw) > now.getTime() ? userId : null;
}

/**
 * Ограничение попыток входа: не больше N неудачных попыток за окно с одного адреса.
 * Хранится в памяти процесса — достаточно для одного сервера; при нескольких экземплярах нужен общий стор.
 */
export class LoginRateLimiter {
  private readonly failures = new Map<string, number[]>();

  constructor(
    private readonly maxFailures = 5,
    private readonly windowMs = 15 * 60 * 1000,
  ) {}

  isBlocked(key: string, now: number): boolean {
    return this.recent(key, now).length >= this.maxFailures;
  }

  recordFailure(key: string, now: number) {
    const recent = this.recent(key, now);
    recent.push(now);
    this.failures.set(key, recent);
    if (this.failures.size > 10_000) this.failures.clear();
  }

  reset(key: string) {
    this.failures.delete(key);
  }

  private recent(key: string, now: number): number[] {
    return (this.failures.get(key) ?? []).filter((time) => now - time < this.windowMs);
  }
}

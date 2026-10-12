import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// Чистые функции админ-сессии (без Next.js) — их легко покрыть тестами.
// Сессия без хранения в БД: значение cookie подписано HMAC, подделать его без SESSION_SECRET нельзя.
// Отзыв всех сессий — смена SESSION_SECRET (сервис рассчитан на одного администратора).

export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const SESSION_VERSION = "v1";

function sign(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

/** Сравнение за постоянное время: хешируем обе строки, чтобы длины совпадали и время не выдавало префикс. */
export function safeEqual(a: string, b: string): boolean {
  const left = createHmac("sha256", "compare").update(a).digest();
  const right = createHmac("sha256", "compare").update(b).digest();
  return timingSafeEqual(left, right);
}

export function verifyAdminToken(input: string, adminToken: string): boolean {
  return input.length > 0 && input.length <= 512 && safeEqual(input, adminToken);
}

/** Общий пароль сайта проверяется так же: постоянное время, ограничение длины. */
export const verifySitePassword = verifyAdminToken;

export function createSessionValue(secret: string, now: Date): { value: string; expiresAt: Date } {
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  const nonce = randomBytes(16).toString("base64url");
  const payload = `${SESSION_VERSION}.${expiresAt.getTime()}.${nonce}`;
  return { value: `${payload}.${sign(secret, `admin|${payload}`)}`, expiresAt };
}

export function verifySessionValue(value: string | undefined, secret: string, now: Date): boolean {
  if (!value || value.length > 256) return false;
  const parts = value.split(".");
  if (parts.length !== 4) return false;
  const [version, expiresAtRaw, nonce, signature] = parts;
  if (version !== SESSION_VERSION || !/^\d{13}$/.test(expiresAtRaw) || !nonce) return false;
  const payload = `${version}.${expiresAtRaw}.${nonce}`;
  if (!safeEqual(signature, sign(secret, `admin|${payload}`))) return false;
  return Number(expiresAtRaw) > now.getTime();
}

// Сессия пользователя сайта: в cookie — id пользователя и срок, подписанные HMAC с другой меткой («user|»),
// поэтому её нельзя выдать за сессию администратора и наоборот. Статус (одобрен/заблокирован) cookie
// не хранит — его проверяет proxy по базе, так блокировка действует сразу, а не после истечения срока.

export const USER_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const USER_SESSION_VERSION = "u1";

export function createUserSessionValue(secret: string, userId: string, now: Date): { value: string; expiresAt: Date } {
  const expiresAt = new Date(now.getTime() + USER_SESSION_TTL_MS);
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

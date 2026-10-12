import { createHmac, timingSafeEqual } from "node:crypto";

// Чистые функции сессии (без Next.js) — их легко покрыть тестами.
// В cookie — id пользователя, номер версии сессий и срок, подписанные HMAC; подделать без SESSION_SECRET нельзя.
// Роль и статус cookie не хранит — их берут из базы. Номер версии сравнивается с User.sessionVersion:
// выход, смена пароля или статуса увеличивают его, и все прежние cookie аккаунта сразу недействительны.

export const USER_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Администратору — короче: украденная cookie админа опаснее. */
export const ADMIN_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const COOKIE_FORMAT = "u2";

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

export type SessionClaims = { userId: string; sessionVersion: number };

export function createUserSessionValue(
  secret: string,
  claims: SessionClaims,
  now: Date,
  ttlMs = USER_SESSION_TTL_MS,
): { value: string; expiresAt: Date } {
  const expiresAt = new Date(now.getTime() + ttlMs);
  const payload = `${COOKIE_FORMAT}.${claims.userId}.${claims.sessionVersion}.${expiresAt.getTime()}`;
  return { value: `${payload}.${sign(secret, `user|${payload}`)}`, expiresAt };
}

/** Данные из действительной cookie или null (подделка, другой секрет, истёк срок, старый формат). */
export function verifyUserSessionValue(value: string | undefined, secret: string, now: Date): SessionClaims | null {
  if (!value || value.length > 256) return null;
  const parts = value.split(".");
  if (parts.length !== 5) return null;
  const [format, userId, versionRaw, expiresAtRaw, signature] = parts;
  if (format !== COOKIE_FORMAT || !/^[a-z0-9]{1,64}$/.test(userId) || !/^\d{1,9}$/.test(versionRaw) || !/^\d{13}$/.test(expiresAtRaw)) {
    return null;
  }
  if (!safeEqual(signature, sign(secret, `user|${format}.${userId}.${versionRaw}.${expiresAtRaw}`))) return null;
  return Number(expiresAtRaw) > now.getTime() ? { userId, sessionVersion: Number(versionRaw) } : null;
}

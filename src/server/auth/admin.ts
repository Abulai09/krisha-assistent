import { cookies, headers } from "next/headers";
import { getAdminSecrets, getEnv } from "@/config/env";
import { createSessionValue, LoginRateLimiter, verifyAdminToken, verifySessionValue } from "./session";

const COOKIE_NAME = "admin_session";
const loginLimiter = new LoginRateLimiter();
// X-Forwarded-For можно подделать без прокси, поэтому есть и общий лимит, не зависящий от заголовков.
const globalLoginLimiter = new LoginRateLimiter(20);
const GLOBAL_KEY = "*";

export class AdminAuthError extends Error {
  constructor(message = "Требуется вход администратора") {
    super(message);
    this.name = "AdminAuthError";
  }
}

export async function isAdmin(now = new Date()): Promise<boolean> {
  const secrets = getAdminSecrets();
  if (!secrets) return false;
  const value = (await cookies()).get(COOKIE_NAME)?.value;
  return verifySessionValue(value, secrets.sessionSecret, now);
}

/** Вызывается в начале каждого Server Action админки: страница — не защита, действие можно вызвать напрямую. */
export async function requireAdmin(): Promise<void> {
  if (!(await isAdmin())) throw new AdminAuthError();
}

export type LoginResult = { ok: true } | { ok: false; error: string };

export async function login(token: string, now = new Date()): Promise<LoginResult> {
  const secrets = getAdminSecrets();
  if (!secrets) return { ok: false, error: "Вход отключён: не заданы ADMIN_TOKEN и SESSION_SECRET." };

  const clientKey = await clientAddress();
  if (loginLimiter.isBlocked(clientKey, now.getTime()) || globalLoginLimiter.isBlocked(GLOBAL_KEY, now.getTime())) {
    return { ok: false, error: "Слишком много неудачных попыток. Попробуйте через 15 минут." };
  }
  if (!verifyAdminToken(token, secrets.adminToken)) {
    loginLimiter.recordFailure(clientKey, now.getTime());
    globalLoginLimiter.recordFailure(GLOBAL_KEY, now.getTime());
    return { ok: false, error: "Неверный токен администратора." };
  }

  loginLimiter.reset(clientKey);
  const session = createSessionValue(secrets.sessionSecret, now);
  (await cookies()).set(COOKIE_NAME, session.value, {
    httpOnly: true,
    secure: getEnv().NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    expires: session.expiresAt,
  });
  return { ok: true };
}

export async function logout(): Promise<void> {
  (await cookies()).delete(COOKIE_NAME);
}

async function clientAddress(): Promise<string> {
  const headerList = await headers();
  // За обратным прокси берём первый адрес из X-Forwarded-For; иначе — общий ключ.
  return headerList.get("x-forwarded-for")?.split(",")[0]?.trim() || headerList.get("x-real-ip") || "local";
}

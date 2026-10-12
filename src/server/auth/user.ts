import { cookies, headers } from "next/headers";
import { getEnv, getSiteAccess } from "@/config/env";
import type { User } from "@/generated/prisma/client";
import { findUserById, findUserByLogin, recordLogin, registerUser } from "@/server/services/userService";
import { createUserSessionValue, LoginRateLimiter, verifySitePassword, verifyUserSessionValue } from "./session";

export const USER_COOKIE_NAME = "user_session";

// Общий пароль знают все пользователи, поэтому подбор имеет смысл только у чужих — ограничиваем попытки.
const passwordLimiter = new LoginRateLimiter();
const globalPasswordLimiter = new LoginRateLimiter(30);
const GLOBAL_KEY = "*";

export type AuthResult = { ok: true; message: string } | { ok: false; error: string };

/** Проверка общего пароля с ограничением попыток. Сначала пароль — без него ничего не сообщаем о логинах. */
async function checkSitePassword(password: string, now: Date): Promise<AuthResult | null> {
  const access = getSiteAccess();
  if (!access) return { ok: false, error: "Вход отключён: на сервере не задан SITE_PASSWORD." };

  const clientKey = await clientAddress();
  const time = now.getTime();
  if (passwordLimiter.isBlocked(clientKey, time) || globalPasswordLimiter.isBlocked(GLOBAL_KEY, time)) {
    return { ok: false, error: "Слишком много неудачных попыток. Попробуйте через 15 минут." };
  }
  if (!verifySitePassword(password, access.sitePassword)) {
    passwordLimiter.recordFailure(clientKey, time);
    globalPasswordLimiter.recordFailure(GLOBAL_KEY, time);
    return { ok: false, error: "Неверный пароль." };
  }
  passwordLimiter.reset(clientKey);
  return null;
}

export async function register(input: { login: string; name: string; password: string }, now = new Date()): Promise<AuthResult> {
  const passwordProblem = await checkSitePassword(input.password, now);
  if (passwordProblem) return passwordProblem;
  await registerUser({ login: input.login, name: input.name });
  return { ok: true, message: "Заявка отправлена. Войти можно будет после одобрения администратором." };
}

export async function userLogin(input: { login: string; password: string }, now = new Date()): Promise<AuthResult> {
  const passwordProblem = await checkSitePassword(input.password, now);
  if (passwordProblem) return passwordProblem;

  const user = await findUserByLogin(input.login);
  if (!user) return { ok: false, error: "Такого логина нет. Сначала зарегистрируйтесь." };
  if (user.status === "PENDING") return { ok: false, error: "Заявка ещё не одобрена администратором." };
  if (user.status === "BLOCKED") return { ok: false, error: "Администратор закрыл вам доступ." };

  await recordLogin(user.id, now);
  const session = createUserSessionValue(getSiteAccess()!.sessionSecret, user.id, now);
  (await cookies()).set(USER_COOKIE_NAME, session.value, {
    httpOnly: true,
    secure: getEnv().NODE_ENV === "production",
    // lax: ссылка на сайт из мессенджера открывается уже залогиненной; POST с чужих сайтов cookie не получит.
    sameSite: "lax",
    path: "/",
    expires: session.expiresAt,
  });
  return { ok: true, message: "Вход выполнен." };
}

export async function userLogout(): Promise<void> {
  (await cookies()).delete(USER_COOKIE_NAME);
}

/** Текущий одобренный пользователь или null. */
export async function currentUser(now = new Date()): Promise<User | null> {
  const access = getSiteAccess();
  if (!access) return null;
  const userId = verifyUserSessionValue((await cookies()).get(USER_COOKIE_NAME)?.value, access.sessionSecret, now);
  if (!userId) return null;
  const user = await findUserById(userId);
  return user?.status === "APPROVED" ? user : null;
}

async function clientAddress(): Promise<string> {
  const headerList = await headers();
  return headerList.get("x-forwarded-for")?.split(",")[0]?.trim() || headerList.get("x-real-ip") || "local";
}

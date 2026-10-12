import { cookies, headers } from "next/headers";
import { getEnv, getSessionSecret, getSitePassword } from "@/config/env";
import { findUserById, findUserByLogin, recordLogin, registerUser, type UserSummary } from "@/server/services/userService";
import { credentialsMatch } from "./credentials";
import { ADMIN_SESSION_TTL_MS, createUserSessionValue, LoginRateLimiter, verifySitePassword, verifyUserSessionValue } from "./session";

export const USER_COOKIE_NAME = "user_session";

// Неудачные попытки считаем по адресу и в целом — от подбора общего пароля и пароля администратора.
const passwordLimiter = new LoginRateLimiter();
const globalPasswordLimiter = new LoginRateLimiter(30);
const GLOBAL_KEY = "*";
const WRONG_CREDENTIALS = "Неверный логин или пароль.";

export type AuthResult = { ok: true; message: string } | { ok: false; error: string };
export type CurrentUser = UserSummary;

async function rateLimited(now: Date): Promise<{ key: string; blocked: boolean }> {
  const key = await clientAddress();
  const time = now.getTime();
  return { key, blocked: passwordLimiter.isBlocked(key, time) || globalPasswordLimiter.isBlocked(GLOBAL_KEY, time) };
}

function recordFailure(key: string, now: Date) {
  passwordLimiter.recordFailure(key, now.getTime());
  globalPasswordLimiter.recordFailure(GLOBAL_KEY, now.getTime());
}

const TOO_MANY: AuthResult = { ok: false, error: "Слишком много неудачных попыток. Попробуйте через 15 минут." };

/** Заявка создаётся только с верным общим паролем; с неверным в базу ничего не пишется. */
export async function register(input: { login: string; name: string; password: string }, now = new Date()): Promise<AuthResult> {
  const sitePassword = getSitePassword();
  if (!sitePassword) return { ok: false, error: "Регистрация выключена: на сервере не задан SITE_PASSWORD." };
  const limit = await rateLimited(now);
  if (limit.blocked) return TOO_MANY;
  if (!verifySitePassword(input.password, sitePassword)) {
    recordFailure(limit.key, now);
    return { ok: false, error: "Неверный пароль. Заявка не создана." };
  }
  await registerUser({ login: input.login, name: input.name });
  return { ok: true, message: "Заявка отправлена. Войти можно будет после одобрения администратором." };
}

/**
 * Администратор входит только личным паролем (хеш в базе), обычный пользователь — только общим.
 * Поэтому общий пароль, который знают все пользователи, к аккаунту администратора не подходит.
 */
export async function userLogin(input: { login: string; password: string }, now = new Date()): Promise<AuthResult> {
  const sessionSecret = getSessionSecret();
  if (!sessionSecret) return { ok: false, error: "Вход выключен: на сервере не задан SESSION_SECRET." };
  const limit = await rateLimited(now);
  if (limit.blocked) return TOO_MANY;

  const user = await findUserByLogin(input.login);
  if (!(await credentialsMatch(user, input.password, getSitePassword()))) {
    recordFailure(limit.key, now);
    return { ok: false, error: WRONG_CREDENTIALS };
  }

  // Сюда доходят только с верным общим паролем — им можно подсказать, что не так с логином.
  if (!user) return { ok: false, error: "Такого логина нет. Сначала зарегистрируйтесь." };
  if (user.status === "PENDING") return { ok: false, error: "Заявка ещё не одобрена администратором." };
  if (user.status === "BLOCKED") return { ok: false, error: "Администратор закрыл вам доступ." };

  passwordLimiter.reset(limit.key);
  await recordLogin(user.id, now);
  const session = createUserSessionValue(sessionSecret, user.id, now, user.role === "ADMIN" ? ADMIN_SESSION_TTL_MS : undefined);
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

/** Текущий одобренный пользователь (с ролью) или null. Статус и роль — всегда свежие из базы. */
export async function currentUser(now = new Date()): Promise<CurrentUser | null> {
  const sessionSecret = getSessionSecret();
  if (!sessionSecret) return null;
  const userId = verifyUserSessionValue((await cookies()).get(USER_COOKIE_NAME)?.value, sessionSecret, now);
  if (!userId) return null;
  const user = await findUserById(userId);
  return user?.status === "APPROVED" ? user : null;
}

async function clientAddress(): Promise<string> {
  const headerList = await headers();
  return headerList.get("x-forwarded-for")?.split(",")[0]?.trim() || headerList.get("x-real-ip") || "local";
}

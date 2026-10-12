import { cookies } from "next/headers";
import { getEnv, getSessionSecret, getSitePassword } from "@/config/env";
import { recordAudit } from "@/server/services/auditService";
import {
  findUserById,
  findUserByLogin,
  recordLogin,
  registerUser,
  revokeSessions,
  type UserSummary,
} from "@/server/services/userService";
import { clientAddress } from "./clientAddress";
import { credentialsMatch } from "./credentials";
import { clearLoginFailures, isThrottled, recordLoginFailure } from "./loginThrottle";
import { ADMIN_SESSION_TTL_MS, createUserSessionValue, verifySitePassword, verifyUserSessionValue } from "./session";

export const USER_COOKIE_NAME = "user_session";

const WRONG_CREDENTIALS = "Неверный логин или пароль.";
const TOO_MANY: AuthResult = { ok: false, error: "Слишком много неудачных попыток с вашего адреса. Попробуйте через 15 минут." };

export type AuthResult = { ok: true; message: string } | { ok: false; error: string };
export type CurrentUser = UserSummary;

/**
 * Аккаунт создаётся только с верным общим паролем (с неверным в базу ничего не пишется) и сразу получает доступ:
 * одобрение администратором выключено. Закрыть доступ можно блокировкой в «Управлении».
 */
export async function register(input: { login: string; name: string; password: string }, now = new Date()): Promise<AuthResult> {
  const sitePassword = getSitePassword();
  const sessionSecret = getSessionSecret();
  if (!sitePassword || !sessionSecret) return { ok: false, error: "Регистрация выключена: на сервере не задан SITE_PASSWORD." };
  const ip = await clientAddress();
  if (await isThrottled(ip, now)) return TOO_MANY;
  if (!verifySitePassword(input.password, sitePassword)) {
    await recordLoginFailure(ip, now);
    return { ok: false, error: "Неверный пароль. Аккаунт не создан." };
  }
  const user = await registerUser({ login: input.login, name: input.name });
  await recordLogin(user.id, now);
  await startSession(sessionSecret, user, now);
  return { ok: true, message: "Аккаунт создан." };
}

/**
 * Администратор входит только личным паролем (хеш в базе), обычный пользователь — только общим.
 * Поэтому общий пароль, который знают все пользователи, к аккаунту администратора не подходит.
 */
export async function userLogin(input: { login: string; password: string }, now = new Date()): Promise<AuthResult> {
  const sessionSecret = getSessionSecret();
  if (!sessionSecret) return { ok: false, error: "Вход выключен: на сервере не задан SESSION_SECRET." };
  const ip = await clientAddress();
  if (await isThrottled(ip, now)) return TOO_MANY;

  const user = await findUserByLogin(input.login);
  if (!(await credentialsMatch(user, input.password, getSitePassword()))) {
    await recordLoginFailure(ip, now);
    if (user?.role === "ADMIN") await recordAudit({ id: user.id, login: user.login }, "ADMIN_LOGIN_FAILED", undefined, ip);
    return { ok: false, error: WRONG_CREDENTIALS };
  }

  // Сюда доходят только с верным паролем — им можно подсказать, что не так с логином.
  if (!user) return { ok: false, error: "Такого логина нет. Сначала зарегистрируйтесь." };
  if (user.status === "PENDING") return { ok: false, error: "Заявка ещё не одобрена администратором." };
  if (user.status === "BLOCKED") return { ok: false, error: "Администратор закрыл вам доступ." };

  await clearLoginFailures(ip);
  await recordLogin(user.id, now);
  if (user.role === "ADMIN") await recordAudit({ id: user.id, login: user.login }, "ADMIN_LOGIN", undefined, ip);
  await startSession(sessionSecret, user, now);
  return { ok: true, message: "Вход выполнен." };
}

async function startSession(sessionSecret: string, user: { id: string; role: string; sessionVersion: number }, now: Date) {
  const session = createUserSessionValue(
    sessionSecret,
    { userId: user.id, sessionVersion: user.sessionVersion },
    now,
    user.role === "ADMIN" ? ADMIN_SESSION_TTL_MS : undefined,
  );
  (await cookies()).set(USER_COOKIE_NAME, session.value, {
    httpOnly: true,
    secure: getEnv().NODE_ENV === "production",
    // lax: ссылка на сайт из мессенджера открывается уже залогиненной; POST с чужих сайтов cookie не получит.
    sameSite: "lax",
    path: "/",
    expires: session.expiresAt,
  });
}

/**
 * Выход завершает все сессии аккаунта, а не только удаляет cookie в этом браузере:
 * если cookie украли, после выхода она тоже перестаёт действовать.
 */
export async function userLogout(now = new Date()): Promise<void> {
  const claims = await sessionClaims(now);
  if (claims) await revokeSessions(claims.userId);
  (await cookies()).delete(USER_COOKIE_NAME);
}

/** Текущий одобренный пользователь (с ролью) или null. Статус, роль и версия сессий — всегда свежие из базы. */
export async function currentUser(now = new Date()): Promise<CurrentUser | null> {
  const claims = await sessionClaims(now);
  if (!claims) return null;
  const user = await findUserById(claims.userId);
  if (user?.status !== "APPROVED" || user.sessionVersion !== claims.sessionVersion) return null;
  return user;
}

async function sessionClaims(now: Date) {
  const sessionSecret = getSessionSecret();
  if (!sessionSecret) return null;
  return verifyUserSessionValue((await cookies()).get(USER_COOKIE_NAME)?.value, sessionSecret, now);
}

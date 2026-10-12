import { verifyPassword } from "./password";
import { verifySitePassword } from "./session";

export type LoginCandidate = { role: string; passwordHash: string | null } | null;

/**
 * Подходит ли пароль к аккаунту. Закрыто по умолчанию: общий пароль принимается только для
 * несуществующего логина (чтобы подсказать «зарегистрируйтесь») или для аккаунта с ролью ровно USER
 * без личного пароля. ADMIN — только личным паролем. Любое другое значение роли (например, если код
 * не видит новую колонку) — отказ, а не вход по общему паролю.
 */
export async function credentialsMatch(user: LoginCandidate, password: string, sitePassword: string | null): Promise<boolean> {
  if (user?.role === "ADMIN") return verifyPassword(password, user.passwordHash);
  if (user && (user.role !== "USER" || user.passwordHash !== null)) return false;
  return sitePassword !== null && verifySitePassword(password, sitePassword);
}

import { currentUser, type CurrentUser } from "./user";

export class AdminAuthError extends Error {
  constructor(message = "Требуется вход администратора") {
    super(message);
    this.name = "AdminAuthError";
  }
}

/** Вошедший администратор или null. Роль берётся из базы на каждый вызов, а не из cookie. */
export async function currentAdmin(): Promise<CurrentUser | null> {
  const user = await currentUser();
  return user?.role === "ADMIN" ? user : null;
}

/** Вызывается в начале каждого Server Action админки: страница — не защита, действие можно вызвать напрямую. */
export async function requireAdmin(): Promise<CurrentUser> {
  const admin = await currentAdmin();
  if (!admin) throw new AdminAuthError();
  return admin;
}

import { z } from "zod";
import { Prisma, type User, type UserStatus } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { hashPassword } from "@/server/auth/password";

// Пользователи сайта. USER: пароль общий (SITE_PASSWORD), поэтому хранится только логин, имя и статус:
// APPROVED — может входить (так создаётся при регистрации), BLOCKED — вход закрыт.
// PENDING — «ждёт одобрения»: сейчас при регистрации не используется, одобрение админом выключено.
// ADMIN: личный пароль (хеш), создаётся только командой `npm run admin:create`, из панели его не изменить.

export const loginSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9._-]{3,32}$/, "Логин: 3–32 символа — латинские буквы, цифры, точка, дефис или подчёркивание.");

export const nameSchema = z.string().trim().min(2, "Имя — от 2 символов.").max(60, "Имя — до 60 символов.");

export type UserSummary = Omit<User, "passwordHash">;

export class UserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserError";
  }
}

export async function registerUser(input: { login: string; name: string }): Promise<User> {
  try {
    return await db.user.create({ data: { login: input.login, name: input.name, status: "APPROVED" } });
  } catch (error) {
    // Уникальный индекс по логину: два одновременных запроса не создадут дубликат.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new UserError("Этот логин уже занят.");
    }
    throw error;
  }
}

export function findUserByLogin(login: string): Promise<User | null> {
  return db.user.findUnique({ where: { login } });
}

/** Без хеша пароля: для проверки сессии он не нужен. */
export function findUserById(id: string): Promise<UserSummary | null> {
  return db.user.findUnique({ where: { id }, omit: { passwordHash: true } });
}

export async function recordLogin(id: string, now = new Date()): Promise<void> {
  await db.user.update({ where: { id }, data: { lastLoginAt: now } });
}

/** Ожидающие одобрения — первыми, внутри групп — новые сверху. Хеш пароля не выбираем: он не нужен странице. */
export async function listUsers(): Promise<UserSummary[]> {
  const users = await db.user.findMany({ orderBy: { createdAt: "desc" }, omit: { passwordHash: true } });
  return users.sort((a, b) => Number(b.status === "PENDING") - Number(a.status === "PENDING"));
}

/**
 * Администратора из панели не блокируют и не удаляют — иначе можно закрыть доступ самому себе.
 * Смена статуса завершает прежние сессии: после разблокировки человек входит заново.
 */
export async function setUserStatus(id: string, status: UserStatus): Promise<void> {
  const { count } = await db.user.updateMany({
    where: { id, role: "USER" },
    data: { status, sessionVersion: { increment: 1 } },
  });
  if (count === 0) throw new UserError("Пользователь не найден или это администратор.");
}

export async function deleteUser(id: string): Promise<void> {
  const { count } = await db.user.deleteMany({ where: { id, role: "USER" } });
  if (count === 0) throw new UserError("Пользователь не найден или это администратор.");
}

/** Завершает все сессии аккаунта: прежние cookie перестают действовать. */
export async function revokeSessions(id: string): Promise<void> {
  await db.user.updateMany({ where: { id }, data: { sessionVersion: { increment: 1 } } });
}

/** Создаёт администратора или меняет пароль существующему. Обычного пользователя в админа не превращает. */
export async function upsertAdmin(input: { login: string; name: string; password: string }): Promise<"created" | "updated"> {
  const passwordHash = await hashPassword(input.password);
  const existing = await findUserByLogin(input.login);
  if (existing && existing.role !== "ADMIN") {
    throw new UserError(`Логин «${input.login}» занят обычным пользователем — выберите другой.`);
  }
  if (existing) {
    // Новый пароль завершает все сессии администратора — в том числе украденные.
    await db.user.update({
      where: { id: existing.id },
      data: { name: input.name, passwordHash, status: "APPROVED", sessionVersion: { increment: 1 } },
    });
    return "updated";
  }
  await db.user.create({ data: { login: input.login, name: input.name, passwordHash, role: "ADMIN", status: "APPROVED" } });
  return "created";
}

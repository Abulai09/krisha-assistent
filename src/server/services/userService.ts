import { z } from "zod";
import { Prisma, type User, type UserStatus } from "@/generated/prisma/client";
import { db } from "@/lib/db";

// Пользователи сайта. Пароль общий (SITE_PASSWORD), поэтому здесь только логин, имя и статус:
// PENDING — ждёт одобрения, APPROVED — может входить, BLOCKED — вход закрыт.

export const loginSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9._-]{3,32}$/, "Логин: 3–32 символа — латинские буквы, цифры, точка, дефис или подчёркивание.");

export const nameSchema = z.string().trim().min(2, "Имя — от 2 символов.").max(60, "Имя — до 60 символов.");

export class UserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserError";
  }
}

export async function registerUser(input: { login: string; name: string }): Promise<User> {
  try {
    return await db.user.create({ data: { login: input.login, name: input.name } });
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

export function findUserById(id: string): Promise<User | null> {
  return db.user.findUnique({ where: { id } });
}

export async function recordLogin(id: string, now = new Date()): Promise<void> {
  await db.user.update({ where: { id }, data: { lastLoginAt: now } });
}

/** Ожидающие одобрения — первыми, внутри групп — новые сверху. */
export async function listUsers(): Promise<User[]> {
  const users = await db.user.findMany({ orderBy: { createdAt: "desc" } });
  return users.sort((a, b) => Number(b.status === "PENDING") - Number(a.status === "PENDING"));
}

export async function setUserStatus(id: string, status: UserStatus): Promise<void> {
  const { count } = await db.user.updateMany({ where: { id }, data: { status } });
  if (count === 0) throw new UserError("Пользователь не найден.");
}

export async function deleteUser(id: string): Promise<void> {
  const { count } = await db.user.deleteMany({ where: { id } });
  if (count === 0) throw new UserError("Пользователь не найден.");
}

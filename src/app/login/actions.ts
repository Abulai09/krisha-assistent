"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { errorMessage } from "@/lib/utils/async";
import { logger } from "@/lib/utils/logger";
import { register, userLogin, userLogout } from "@/server/auth/user";
import { loginSchema, nameSchema, UserError } from "@/server/services/userService";

// login возвращаем при ошибке: React очищает форму после отправки, а набирать логин заново неудобно.
export type FormState =
  | { status: "idle" }
  | { status: "success"; message: string }
  | { status: "error"; message: string; login?: string };

const passwordSchema = z.string().min(1, "Введите пароль.").max(512);

const loginForm = z.object({ login: loginSchema, password: passwordSchema });
const registerForm = z.object({ login: loginSchema, name: nameSchema, password: passwordSchema });

export async function loginUserAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const rawLogin = formData.get("login");
  const login = typeof rawLogin === "string" ? rawLogin.slice(0, 32) : undefined;
  const parsed = loginForm.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0].message, login };
  const result = await safely(() => userLogin(parsed.data));
  if (!result.ok) return { status: "error", message: result.error, login };
  redirect("/");
}

export async function registerAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = registerForm.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0].message };
  const result = await safely(() => register(parsed.data));
  if (!result.ok) return { status: "error", message: result.error };
  redirect("/");
}

export async function logoutUserAction(): Promise<void> {
  await userLogout();
  redirect("/login");
}

/** Ожидаемые ошибки (занятый логин) — пользователю, неожиданные — только в лог. */
async function safely(action: () => Promise<{ ok: true; message: string } | { ok: false; error: string }>) {
  try {
    return await action();
  } catch (error) {
    if (error instanceof UserError) return { ok: false as const, error: error.message };
    logger.error("Ошибка входа или регистрации", { error: errorMessage(error) });
    return { ok: false as const, error: "Не удалось выполнить запрос. Попробуйте позже." };
  }
}

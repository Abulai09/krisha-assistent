"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { errorMessage } from "@/lib/utils/async";
import { logger } from "@/lib/utils/logger";
import { AdminAuthError, login, logout, requireAdmin } from "@/server/auth/admin";
import { acceptImportUpload } from "@/server/services/importUploadService";
import { enqueueManualRun, RunQueueError } from "@/server/services/runQueueService";
import { InvalidImportFileError } from "@/server/sources/types";

// Каждое действие само проверяет права: Server Action — это публичный POST-эндпоинт,
// его можно вызвать напрямую, минуя страницу.

export type ActionState = { status: "idle" } | { status: "success"; message: string } | { status: "error"; message: string };

export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const token = formData.get("token");
  if (typeof token !== "string" || token.length === 0) return { status: "error", message: "Введите токен администратора." };
  const result = await login(token);
  if (!result.ok) return { status: "error", message: result.error };
  revalidatePath("/admin");
  return { status: "success", message: "Вход выполнен." };
}

export async function logoutAction(): Promise<void> {
  await logout();
  revalidatePath("/admin");
}

const runSchema = z.object({ source: z.string().trim().min(1).max(50) });

export async function enqueueRunAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return guarded(async () => {
    const { source } = runSchema.parse({ source: formData.get("source") });
    await enqueueManualRun(source);
    revalidatePath("/admin");
    return { status: "success", message: "Обновление поставлено в очередь. Его выполнит worker в течение ~15 секунд." };
  });
}

export async function uploadImportAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return guarded(async () => {
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) return { status: "error", message: "Выберите файл CSV или JSON." };
    const summary = await acceptImportUpload(file);
    revalidatePath("/admin");
    const skipped = summary.invalid > 0 ? ` ${summary.invalid} не прошли проверку и будут пропущены.` : "";
    return {
      status: "success",
      message: `Файл принят: ${summary.valid} из ${summary.total} объявлений корректны.${skipped} Импорт выполнит worker.`,
    };
  });
}

/** Ожидаемые ошибки показываем пользователю, неожиданные — только в лог, без внутренних деталей. */
async function guarded(action: () => Promise<ActionState>): Promise<ActionState> {
  try {
    await requireAdmin();
    return await action();
  } catch (error) {
    if (error instanceof AdminAuthError) return { status: "error", message: "Сессия истекла — войдите снова." };
    if (error instanceof RunQueueError || error instanceof InvalidImportFileError) {
      return { status: "error", message: error.message };
    }
    if (error instanceof z.ZodError) return { status: "error", message: "Некорректный запрос." };
    logger.error("Ошибка действия администратора", { error: errorMessage(error) });
    return { status: "error", message: "Не удалось выполнить действие. Подробности — в логах сервера." };
  }
}

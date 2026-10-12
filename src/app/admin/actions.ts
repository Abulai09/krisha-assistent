"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { errorMessage } from "@/lib/utils/async";
import { logger } from "@/lib/utils/logger";
import { AdminAuthError, requireAdmin } from "@/server/auth/admin";
import { clientAddress } from "@/server/auth/clientAddress";
import type { CurrentUser } from "@/server/auth/user";
import { recordAudit } from "@/server/services/auditService";
import { DbBrowserError, deleteRow, isTableName } from "@/server/services/dbBrowserService";
import { acceptImportUpload } from "@/server/services/importUploadService";
import { enqueueManualRun, RunQueueError } from "@/server/services/runQueueService";
import { deleteUser, findUserById, setUserStatus, UserError } from "@/server/services/userService";
import { InvalidImportFileError } from "@/server/sources/types";

// Каждое действие само проверяет права: Server Action — это публичный POST-эндпоинт,
// его можно вызвать напрямую, минуя страницу. Каждое успешное действие попадает в журнал (AuditLog).

export type ActionState = { status: "idle" } | { status: "success"; message: string } | { status: "error"; message: string };

const runSchema = z.object({ source: z.string().trim().min(1).max(50) });

export async function enqueueRunAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return guarded(async (audit) => {
    const { source } = runSchema.parse({ source: formData.get("source") });
    await enqueueManualRun(source);
    await audit("RUN_ENQUEUED", source);
    revalidatePath("/admin");
    return { status: "success", message: "Обновление поставлено в очередь. Его выполнит worker в течение ~15 секунд." };
  });
}

export async function uploadImportAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return guarded(async (audit) => {
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) return { status: "error", message: "Выберите файл CSV или JSON." };
    const summary = await acceptImportUpload(file);
    await audit("IMPORT_UPLOADED", file.name.slice(0, 200));
    revalidatePath("/admin");
    const skipped = summary.invalid > 0 ? ` ${summary.invalid} не прошли проверку и будут пропущены.` : "";
    return {
      status: "success",
      message: `Файл принят: ${summary.valid} из ${summary.total} объявлений корректны.${skipped} Импорт выполнит worker.`,
    };
  });
}

const userActionSchema = z.object({
  userId: z.string().regex(/^[a-z0-9]{1,64}$/),
  action: z.enum(["approve", "block", "delete"]),
});

const USER_AUDIT_ACTIONS = { approve: "USER_APPROVED", block: "USER_BLOCKED", delete: "USER_DELETED" } as const;
const USER_ACTION_MESSAGES = { approve: "Доступ открыт.", block: "Доступ закрыт.", delete: "Пользователь удалён." } as const;

export async function userAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return guarded(async (audit) => {
    const { userId, action } = userActionSchema.parse({ userId: formData.get("userId"), action: formData.get("action") });
    const target = `User:${(await findUserById(userId))?.login ?? userId}`;
    if (action === "delete") await deleteUser(userId);
    else await setUserStatus(userId, action === "approve" ? "APPROVED" : "BLOCKED");
    await audit(USER_AUDIT_ACTIONS[action], target);
    revalidatePath("/admin");
    return { status: "success", message: USER_ACTION_MESSAGES[action] };
  });
}

const deleteRowSchema = z.object({
  table: z.string().refine(isTableName),
  id: z.string().min(1).max(100),
});

export async function deleteRowAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return guarded(async (audit) => {
    const { table, id } = deleteRowSchema.parse({ table: formData.get("table"), id: formData.get("id") });
    await deleteRow(table, id);
    await audit("ROW_DELETED", `${table}:${id}`);
    revalidatePath("/admin", "layout");
    return { status: "success", message: "Строка удалена." };
  });
}

type Audit = (action: Parameters<typeof recordAudit>[1], target: string) => Promise<void>;

/**
 * Проверка прав + журнал. Действие получает `audit` — запись «кто, что, над чем» от имени вошедшего админа.
 * Ожидаемые ошибки показываем пользователю, неожиданные — только в лог, без внутренних деталей.
 */
async function guarded(action: (audit: Audit) => Promise<ActionState>): Promise<ActionState> {
  try {
    const admin: CurrentUser = await requireAdmin();
    const ip = await clientAddress();
    return await action((auditAction, target) => recordAudit({ id: admin.id, login: admin.login }, auditAction, target, ip));
  } catch (error) {
    if (error instanceof AdminAuthError) return { status: "error", message: "Нужен вход администратора — войдите снова." };
    if (error instanceof RunQueueError || error instanceof InvalidImportFileError || error instanceof UserError || error instanceof DbBrowserError) {
      return { status: "error", message: error.message };
    }
    if (error instanceof z.ZodError) return { status: "error", message: "Некорректный запрос." };
    logger.error("Ошибка действия администратора", { error: errorMessage(error) });
    return { status: "error", message: "Не удалось выполнить действие. Подробности — в логах сервера." };
  }
}

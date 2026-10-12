import type { AuditAction } from "@/generated/prisma/client";
import { db } from "@/lib/db";

// Журнал действий администратора: кто, что и когда сделал. Пишется после успешного действия;
// неудачные входы в аккаунт администратора — тоже (признак подбора пароля).

export type AuditActor = { id: string | null; login: string };

export async function recordAudit(actor: AuditActor, action: AuditAction, target?: string, ip?: string): Promise<void> {
  await db.auditLog.create({ data: { actorId: actor.id, actorLogin: actor.login, action, target, ip } });
}

export function listAudit(take = 100) {
  return db.auditLog.findMany({ orderBy: { at: "desc" }, take });
}

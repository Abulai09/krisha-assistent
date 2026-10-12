import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/domain/format";
import type { AuditAction } from "@/generated/prisma/client";
import { listAudit } from "@/server/services/auditService";
import { AdminTabs } from "../admin-tabs";
import { requireAdminPage } from "../guard";

export const metadata: Metadata = { title: "Журнал действий", robots: { index: false } };

const ACTION_LABELS: Record<AuditAction, string> = {
  ADMIN_LOGIN: "Вход администратора",
  ADMIN_LOGIN_FAILED: "Неверный пароль администратора",
  ADMIN_PASSWORD_SET: "Пароль администратора задан",
  USER_APPROVED: "Пользователь одобрен",
  USER_BLOCKED: "Пользователь заблокирован",
  USER_DELETED: "Пользователь удалён",
  ROW_DELETED: "Строка удалена из базы",
  RUN_ENQUEUED: "Обновление поставлено в очередь",
  IMPORT_UPLOADED: "Загружен файл импорта",
  DATA_PRUNED: "Автоочистка устаревших данных",
};

/** Действия, на которые стоит обратить внимание: необратимые и признаки подбора пароля. */
const ATTENTION: ReadonlySet<AuditAction> = new Set(["ADMIN_LOGIN_FAILED", "USER_DELETED", "ROW_DELETED"]);

export default function AuditPage() {
  return (
    <>
      <PageHeader title="Управление" description="Последние 100 действий администраторов: кто, что и когда сделал." />
      <AdminTabs active="/admin/audit" />
      <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
        <AuditTable />
      </Suspense>
    </>
  );
}

async function AuditTable() {
  await connection();
  await requireAdminPage();
  const entries = await listAudit();
  if (entries.length === 0) {
    return <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Действий пока не было.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Когда</TableHead>
            <TableHead>Кто</TableHead>
            <TableHead>Действие</TableHead>
            <TableHead>Над чем</TableHead>
            <TableHead>Адрес</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map((entry) => (
            <TableRow key={entry.id}>
              <TableCell className="whitespace-nowrap">{formatDateTime(entry.at)}</TableCell>
              <TableCell className="font-mono text-xs">{entry.actorLogin}</TableCell>
              <TableCell>
                <Badge variant={ATTENTION.has(entry.action) ? "destructive" : "outline"}>{ACTION_LABELS[entry.action]}</Badge>
              </TableCell>
              <TableCell className="max-w-xs truncate font-mono text-xs" title={entry.target ?? undefined}>
                {entry.target ?? "—"}
              </TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">{entry.ip ?? "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

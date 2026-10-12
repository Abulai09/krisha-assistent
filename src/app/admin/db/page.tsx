import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBytes, formatDateTime, formatNumber, pluralize } from "@/domain/format";
import { RETENTION_DAYS } from "@/domain/retention";
import type { StorageLevel } from "@/domain/storage";
import { listTables } from "@/server/services/dbBrowserService";
import { getStorageReport, type StorageReport } from "@/server/services/storageService";
import { cn } from "@/lib/utils";
import { AdminTabs } from "../admin-tabs";
import { requireAdminPage } from "../guard";

export const metadata: Metadata = { title: "База данных", robots: { index: false } };

export default function DatabasePage() {
  return (
    <>
      <PageHeader title="Управление" description="Место в базе, автоочистка и все таблицы приложения." />
      <AdminTabs active="/admin/db" />
      <Suspense
        fallback={
          <div className="space-y-6">
            <Skeleton className="h-48 rounded-xl" />
            <Skeleton className="h-64 rounded-xl" />
          </div>
        }
      >
        <DatabaseOverview />
      </Suspense>
    </>
  );
}

async function DatabaseOverview() {
  await connection();
  await requireAdminPage();
  const [storage, tables] = await Promise.all([getStorageReport(), listTables()]);
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <StorageCard storage={storage} />
        <PruneCard storage={storage} />
      </div>
      <section aria-labelledby="tables-heading" className="space-y-3">
        <h2 id="tables-heading" className="font-medium">
          Таблицы
        </h2>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {tables.map((table) => (
            <li key={table.name} className="min-w-0">
              <Link
                href={`/admin/db/${table.name}`}
                className="block h-full rounded-xl border p-4 transition-colors hover:border-foreground/30 hover:bg-muted/50"
              >
                <p className="font-medium">{table.label}</p>
                <p className="font-mono text-xs text-muted-foreground">{table.name}</p>
                <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                  <span className="tabular">
                    {formatNumber(table.rows)} {pluralize(table.rows, ["строка", "строки", "строк"])}
                  </span>
                  {storage.tableBytes[table.name] !== undefined && (
                    <span className="tabular text-muted-foreground">· {formatBytes(storage.tableBytes[table.name])}</span>
                  )}
                  {!table.deletable && <Badge variant="outline">только просмотр</Badge>}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

const BAR_COLOR: Record<StorageLevel, string> = {
  ok: "bg-primary",
  warning: "bg-warning",
  critical: "bg-destructive",
};

function StorageCard({ storage }: { storage: StorageReport }) {
  const { usage } = storage;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Место в базе</CardTitle>
        <CardDescription>Лимит тарифа — {formatBytes(storage.limitBytes)}. Считается вся база PostgreSQL.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-2xl font-semibold tabular">
          {formatBytes(storage.databaseBytes)}
          <span className="ml-2 text-base font-normal text-muted-foreground">
            из {formatBytes(storage.limitBytes)} · {usage.percent}%
          </span>
        </p>
        <div
          role="progressbar"
          aria-label="Заполненность базы"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.min(usage.percent, 100)}
          className="h-2 overflow-hidden rounded-full bg-muted"
        >
          <div className={cn("h-full rounded-full", BAR_COLOR[usage.level])} style={{ width: `${Math.min(Math.max(usage.percent, 1), 100)}%` }} />
        </div>
        <p className="text-sm text-muted-foreground">
          Из них таблицы приложения — {formatBytes(storage.appBytes)}. Остальное — служебные данные PostgreSQL и другие
          проекты в этой же базе.
        </p>
        {usage.level !== "ok" && (
          <p
            role="status"
            className={cn(
              "rounded-lg border p-3 text-sm",
              usage.level === "critical" ? "border-destructive/40 bg-destructive/5 text-destructive" : "border-warning/40 bg-warning-muted",
            )}
          >
            База заполнена на {usage.percent}%. Когда она упрётся в лимит, Supabase перестанет принимать новые данные.
            Сократите сроки хранения в <span className="font-mono">src/domain/retention.ts</span> или удалите лишние данные.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function PruneCard({ storage }: { storage: StorageReport }) {
  const { lastPrune, nextPruneAt } = storage;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Автоочистка</CardTitle>
        <CardDescription>
          Раз в сутки worker удаляет снятые с продажи объявления старше {RETENTION_DAYS.inactiveListing} дней, запуски
          старше {RETENTION_DAYS.finishedRun} дней, журнал старше {RETENTION_DAYS.auditLog} дней и неодобренные заявки
          старше {RETENTION_DAYS.pendingUser} дней.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {lastPrune ? (
          <>
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1">
              <dt className="text-muted-foreground">Последняя</dt>
              <dd className="tabular">{formatDateTime(lastPrune.at)}</dd>
              <dt className="text-muted-foreground">Следующая</dt>
              <dd className="tabular">не раньше {nextPruneAt ? formatDateTime(nextPruneAt) : "—"}</dd>
            </dl>
            <p className="min-w-0 break-words">
              <span className="text-muted-foreground">Удалено: </span>
              {lastPrune.summary ?? "—"}
            </p>
          </>
        ) : (
          <p className="text-muted-foreground">Ещё не было. Worker почистит базу при ближайшем запуске.</p>
        )}
        <Link href="/admin/audit" className="inline-block underline underline-offset-4 hover:text-foreground">
          История очисток в журнале
        </Link>
      </CardContent>
    </Card>
  );
}

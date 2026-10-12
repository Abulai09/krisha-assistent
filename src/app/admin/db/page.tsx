import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber, pluralize } from "@/domain/format";
import { listTables } from "@/server/services/dbBrowserService";
import { AdminTabs } from "../admin-tabs";
import { requireAdminPage } from "../guard";

export const metadata: Metadata = { title: "База данных", robots: { index: false } };

export default function DatabasePage() {
  return (
    <>
      <PageHeader title="Управление" description="Все таблицы приложения: просмотр строк и удаление." />
      <AdminTabs active="/admin/db" />
      <Suspense fallback={<Skeleton className="h-64 rounded-xl" />}>
        <TableList />
      </Suspense>
    </>
  );
}

async function TableList() {
  await connection();
  await requireAdminPage();
  const tables = await listTables();
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {tables.map((table) => (
        <li key={table.name} className="min-w-0">
          <Link
            href={`/admin/db/${table.name}`}
            className="block h-full rounded-xl border p-4 transition-colors hover:border-foreground/30 hover:bg-muted/50"
          >
            <p className="font-medium">{table.label}</p>
            <p className="font-mono text-xs text-muted-foreground">{table.name}</p>
            <p className="mt-3 flex flex-wrap items-center gap-2 text-sm">
              <span className="tabular">
                {formatNumber(table.rows)} {pluralize(table.rows, ["строка", "строки", "строк"])}
              </span>
              {!table.deletable && <Badge variant="outline">только просмотр</Badge>}
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}

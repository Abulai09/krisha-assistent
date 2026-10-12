import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime, formatNumber } from "@/domain/format";
import { isTableName, readTable, type DbRow } from "@/server/services/dbBrowserService";
import { AdminTabs } from "../../admin-tabs";
import { DeleteRowButton } from "../../forms";
import { requireAdminPage } from "../../guard";

export const metadata: Metadata = { title: "База данных", robots: { index: false } };

export default function TablePage(props: PageProps<"/admin/db/[table]">) {
  return (
    <>
      <PageHeader title="Управление" />
      <AdminTabs active="/admin/db" />
      <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
        <TableView params={props.params} searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

async function TableView({ params, searchParams }: Pick<PageProps<"/admin/db/[table]">, "params" | "searchParams">) {
  await connection();
  await requireAdminPage();
  const { table } = await params;
  if (!isTableName(table)) notFound();
  const pageParam = (await searchParams).page;
  const requested = Number(typeof pageParam === "string" ? pageParam : 1);
  const data = await readTable(table, Number.isInteger(requested) ? requested : 1);
  const columns = data.rows.length > 0 ? Object.keys(data.rows[0]) : [];

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Link href="/admin/db" className="text-sm text-muted-foreground hover:text-foreground">
          ← Все таблицы
        </Link>
        <h2 className="text-lg font-semibold">
          {data.label} <span className="font-mono text-sm font-normal text-muted-foreground">{table}</span>
        </h2>
        <p className="max-w-3xl text-sm text-muted-foreground">
          {data.description} Всего строк: {formatNumber(data.total)}.
        </p>
      </div>

      {data.rows.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Таблица пуста.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                {data.deletable && <TableHead className="w-0" />}
                {columns.map((column) => (
                  <TableHead key={column} className="font-mono text-xs">
                    {column}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.map((row, index) => (
                <TableRow key={String(row.id ?? index)} className="align-top">
                  {data.deletable && (
                    <TableCell>{typeof row.id === "string" && <DeleteRowButton table={table} id={row.id} />}</TableCell>
                  )}
                  {columns.map((column) => (
                    <Cell key={column} value={row[column]} />
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Pagination table={table} page={data.page} pages={data.pages} />
    </div>
  );
}

const MAX_CELL_LENGTH = 80;

/** Значение ячейки как текст: даты по-русски, деньги и Decimal — без потери точности, JSON — сокращённо. */
function cellText(value: DbRow[string]): string {
  if (value === null || value === undefined) return "—";
  if (value instanceof Date) return formatDateTime(value);
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "object") {
    // Prisma.Decimal печатается сам; JSON и массивы — строкой (bigint внутри JSON.stringify не понимает).
    if ("toFixed" in value) return String(value);
    return JSON.stringify(value, (_key, item) => (typeof item === "bigint" ? item.toString() : item));
  }
  return String(value);
}

function Cell({ value }: { value: DbRow[string] }) {
  const text = cellText(value);
  const short = text.length > MAX_CELL_LENGTH ? `${text.slice(0, MAX_CELL_LENGTH)}…` : text;
  return (
    <TableCell className="max-w-xs font-mono text-xs whitespace-nowrap" title={short === text ? undefined : text}>
      <span className={value === null || value === undefined ? "text-muted-foreground" : undefined}>{short}</span>
    </TableCell>
  );
}

function Pagination({ table, page, pages }: { table: string; page: number; pages: number }) {
  if (pages <= 1) return null;
  const href = (target: number) => `/admin/db/${table}?page=${target}`;
  return (
    <nav aria-label="Страницы таблицы" className="flex items-center justify-between gap-2 text-sm">
      {page > 1 ? (
        <Button asChild variant="outline" size="sm">
          <Link href={href(page - 1)}>← Назад</Link>
        </Button>
      ) : (
        <span />
      )}
      <span className="text-muted-foreground">
        Страница {page} из {pages}
      </span>
      {page < pages ? (
        <Button asChild variant="outline" size="sm">
          <Link href={href(page + 1)}>Дальше →</Link>
        </Button>
      ) : (
        <span />
      )}
    </nav>
  );
}

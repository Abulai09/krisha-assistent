import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { RUN_STATUS_LABELS, RUN_TRIGGER_LABELS, SOURCE_STATUS_LABELS } from "@/components/labels";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getAdminSecrets, getEnv, scheduledSourceKeys } from "@/config/env";
import { formatDateTime } from "@/domain/format";
import { db } from "@/lib/db";
import { isAdmin } from "@/server/auth/admin";
import { getWorkerState } from "@/server/services/heartbeatService";
import { listSchedulableSources } from "@/server/sources/registry";
import { logoutAction } from "./actions";
import { LoginForm, RunSourceButton, UploadImportForm } from "./forms";

export const metadata: Metadata = { title: "Управление", robots: { index: false } };

export default function AdminPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
      <AdminContent />
    </Suspense>
  );
}

async function AdminContent() {
  await connection();

  if (!getAdminSecrets()) {
    return (
      <>
        <PageHeader title="Управление" />
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle>Управление отключено</CardTitle>
            <CardDescription>
              Задайте в .env переменные ADMIN_TOKEN (от 16 символов) и SESSION_SECRET (от 32 символов) и перезапустите
              сервер. Пример генерации — в .env.example.
            </CardDescription>
          </CardHeader>
        </Card>
      </>
    );
  }

  if (!(await isAdmin())) {
    return (
      <>
        <PageHeader title="Управление" description="Ручной запуск обновления, импорт файлов и журнал запусков." />
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Вход администратора</CardTitle>
          </CardHeader>
          <CardContent>
            <LoginForm />
          </CardContent>
        </Card>
      </>
    );
  }

  return <AdminPanel />;
}

async function AdminPanel() {
  const [sources, runs, worker] = await Promise.all([
    db.dataSource.findMany(),
    db.collectionRun.findMany({ orderBy: { requestedAt: "desc" }, take: 20, include: { source: { select: { name: true } } } }),
    getWorkerState(),
  ]);
  const sourcesByKey = new Map(sources.map((source) => [source.key, source]));
  const scheduled = new Set(scheduledSourceKeys());

  return (
    <>
      <PageHeader
        title="Управление"
        description="Ручной запуск обновления, импорт файлов и журнал запусков."
        actions={
          <form action={logoutAction}>
            <Button type="submit" variant="ghost" size="sm">
              Выйти
            </Button>
          </form>
        }
      />

      <div className="space-y-6">
        {worker.state !== "RUNNING" && (
          <div role="status" className="rounded-xl border border-warning/40 bg-warning-muted p-4 text-sm">
            <p className="font-medium">Фоновый процесс не запущен</p>
            <p className="text-muted-foreground">
              Запуски из очереди и импорт файлов выполняет worker. Запустите его командой{" "}
              <code className="font-mono">npm run worker</code> — задачи из очереди будут обработаны автоматически.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Источники данных</CardTitle>
              <CardDescription>Автообновление каждые {getEnv().WORKER_INTERVAL_MINUTES} мин. для источников из SCHEDULED_SOURCES.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {listSchedulableSources().map((source) => {
                const record = sourcesByKey.get(source.key);
                const status = record?.status ?? "NOT_CONNECTED";
                const notConnected = source.kind !== "SYNTHETIC" && status === "NOT_CONNECTED";
                return (
                  <div key={source.key} className="space-y-2 rounded-lg border p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{source.name}</p>
                      <Badge variant="outline">{SOURCE_STATUS_LABELS[status]}</Badge>
                      {scheduled.has(source.key) && <Badge variant="secondary">По расписанию</Badge>}
                      {source.isSynthetic && <Badge variant="outline" className="border-warning/50 text-warning">Тестовые данные</Badge>}
                    </div>
                    {record?.statusMessage && <p className="text-sm text-muted-foreground">{record.statusMessage}</p>}
                    <p className="text-xs text-muted-foreground">
                      Последнее успешное обновление: {record?.lastSuccessAt ? formatDateTime(record.lastSuccessAt) : "не было"}
                    </p>
                    <RunSourceButton
                      sourceKey={source.key}
                      disabledReason={notConnected ? "Нельзя запустить: источник не подключён (см. сообщение выше)." : undefined}
                    />
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Импорт объявлений из файла</CardTitle>
              <CardDescription>Файл проверяется сразу, а сохранение и пересчёт оценок выполняет worker.</CardDescription>
            </CardHeader>
            <CardContent>
              <UploadImportForm maxMb={getEnv().IMPORT_MAX_FILE_MB} />
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Журнал запусков</CardTitle>
            <CardDescription>Последние 20 запусков. Ошибки проверки данных — первые 50 на запуск.</CardDescription>
          </CardHeader>
          <CardContent>
            {runs.length === 0 ? (
              <p className="text-sm text-muted-foreground">Запусков ещё не было.</p>
            ) : (
              <div className="-mx-2 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Время</TableHead>
                      <TableHead>Источник</TableHead>
                      <TableHead>Статус</TableHead>
                      <TableHead className="text-right">Получено</TableHead>
                      <TableHead className="text-right">Новых / изм.</TableHead>
                      <TableHead className="text-right">Отклонено</TableHead>
                      <TableHead className="text-right">Снято</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {runs.map((run) => (
                      <TableRow key={run.id} className="align-top">
                        <TableCell className="whitespace-nowrap">
                          {formatDateTime(run.startedAt ?? run.requestedAt)}
                          <div className="text-xs text-muted-foreground">{RUN_TRIGGER_LABELS[run.trigger]}</div>
                        </TableCell>
                        <TableCell>{run.source.name}</TableCell>
                        <TableCell className="max-w-xs">
                          <Badge variant={run.status === "FAILED" ? "destructive" : "outline"}>{RUN_STATUS_LABELS[run.status]}</Badge>
                          {run.errorMessage && <p className="mt-1 text-xs whitespace-normal text-destructive">{run.errorMessage}</p>}
                          <ErrorSamples samples={run.errorSamples} />
                        </TableCell>
                        <TableCell className="tabular text-right">{run.fetchedCount}</TableCell>
                        <TableCell className="tabular text-right">
                          {run.createdCount} / {run.updatedCount}
                        </TableCell>
                        <TableCell className="tabular text-right">{run.invalidCount}</TableCell>
                        <TableCell className="tabular text-right">{run.deactivatedCount}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function ErrorSamples({ samples }: { samples: unknown }) {
  if (!Array.isArray(samples) || samples.length === 0) return null;
  return (
    <details className="mt-1 text-xs whitespace-normal">
      <summary className="cursor-pointer text-muted-foreground">Ошибки проверки ({samples.length})</summary>
      <ul className="mt-1 space-y-1">
        {samples.slice(0, 50).map((sample, index) => {
          const item = sample as { externalId?: string | null; issues?: string[] };
          return (
            <li key={index}>
              <span className="font-mono">{item.externalId ?? "без id"}</span>: {(item.issues ?? []).join("; ")}
            </li>
          );
        })}
      </ul>
    </details>
  );
}

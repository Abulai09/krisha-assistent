import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { RUN_STATUS_LABELS, RUN_TRIGGER_LABELS, SOURCE_STATUS_LABELS } from "@/components/labels";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getEnv, getSitePassword, scheduledSourceKeys } from "@/config/env";
import { formatDateTime } from "@/domain/format";
import { db } from "@/lib/db";
import { getDataHealth, type DataHealth } from "@/server/services/dataHealthService";
import { getWorkerState } from "@/server/services/heartbeatService";
import { listUsers } from "@/server/services/userService";
import { listSchedulableSources } from "@/server/sources/registry";
import { AdminTabs } from "./admin-tabs";
import { RunSourceButton, UserActions } from "./forms";
import { requireAdminPage } from "./guard";

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
  await requireAdminPage();
  return <AdminPanel />;
}

async function AdminPanel() {
  const [sources, runs, worker, users, health] = await Promise.all([
    db.dataSource.findMany(),
    db.collectionRun.findMany({ orderBy: { requestedAt: "desc" }, take: 20, include: { source: { select: { name: true } } } }),
    getWorkerState(),
    listUsers(),
    getDataHealth(),
  ]);
  const sourcesByKey = new Map(sources.map((source) => [source.key, source]));
  const scheduled = new Set(scheduledSourceKeys());

  return (
    <>
      <PageHeader title="Управление" description="Пользователи, обновления данных и журнал запусков." />
      <AdminTabs active="/admin" />

      <div className="space-y-6">
        {worker.state !== "RUNNING" && (
          <div role="status" className="rounded-xl border border-warning/40 bg-warning-muted p-4 text-sm">
            <p className="font-medium">Фоновый процесс не запущен</p>
            <p className="text-muted-foreground">
              Запуски из очереди выполняет worker. Запустите его командой{" "}
              <code className="font-mono">npm run worker</code> — задачи из очереди будут обработаны автоматически.
            </p>
          </div>
        )}

        <DataHealthAlert health={health} />

        <UsersCard users={users} />

          <Card>
            <CardHeader>
              <CardTitle>Источники данных</CardTitle>
              <CardDescription>Автообновление каждые {getEnv().WORKER_INTERVAL_MINUTES} мин. для источников из SCHEDULED_SOURCES.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {listSchedulableSources().map((source) => {
                const record = sourcesByKey.get(source.key);
                const status = record?.status ?? "NOT_CONNECTED";
                const notConnected = source.kind !== "SYNTHETIC" && status === "NOT_CONNECTED";
                return (
                  <div key={source.key} className="min-w-0 space-y-2 rounded-lg border p-3">
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

/** Сайт при поломке worker'а работает, но показывает старые данные — поэтому предупреждаем явно. */
function DataHealthAlert({ health }: { health: DataHealth }) {
  if (health.ok) return null;
  return (
    <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm">
      <p className="font-medium text-destructive">Данные не обновляются</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted-foreground">
        {health.staleSources.map((source) => (
          <li key={source.key}>
            Источник <span className="font-mono">{source.key}</span>: последнее успешное обновление —{" "}
            {source.lastSuccessAt ? formatDateTime(source.lastSuccessAt) : "не было"} (норма — не реже раза в{" "}
            {health.maxAgeHours} ч).
          </li>
        ))}
        {health.stuckRuns > 0 && (
          <li>Зависших запусков (идут дольше часа): {health.stuckRuns}. Скорее всего, worker упал во время обновления.</li>
        )}
      </ul>
      <p className="mt-2 text-muted-foreground">Проверьте logs/worker.log на компьютере, где работает worker.</p>
    </div>
  );
}

const USER_STATUS_LABELS = { PENDING: "Ждёт одобрения", APPROVED: "Есть доступ", BLOCKED: "Доступ закрыт" } as const;

function UsersCard({ users }: { users: Awaited<ReturnType<typeof listUsers>> }) {
  const pending = users.filter((user) => user.status === "PENDING").length;
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Пользователи{pending > 0 && <Badge className="ml-2 align-middle">новых: {pending}</Badge>}
        </CardTitle>
        <CardDescription>
          У пользователей общий пароль (SITE_PASSWORD), у администратора — личный. Войти могут только аккаунты со
          статусом «Есть доступ». Блокировка действует в течение 30 секунд. Администратора здесь не блокируют и не
          удаляют — это делается командой npm run admin:create.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!getSitePassword() && (
          <div role="status" className="rounded-xl border border-warning/40 bg-warning-muted p-4 text-sm">
            <p className="font-medium">Сайт открыт всем</p>
            <p className="text-muted-foreground">
              Чтобы пускать только одобренных пользователей, задайте SITE_PASSWORD (от 8 символов) в .env и в настройках
              Vercel.
            </p>
          </div>
        )}
        {users.length === 0 ? (
          <p className="text-sm text-muted-foreground">Заявок пока нет. Отправьте людям ссылку на страницу /register и пароль.</p>
        ) : (
          <div className="-mx-2 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Имя и логин</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead>Заявка</TableHead>
                  <TableHead>Последний вход</TableHead>
                  <TableHead>Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id} className="align-top">
                    <TableCell className="max-w-56 whitespace-normal">
                      <p className="font-medium break-words">
                        {user.name}
                        {user.role === "ADMIN" && <Badge variant="secondary" className="ml-2 align-middle">Администратор</Badge>}
                      </p>
                      <p className="font-mono text-xs text-muted-foreground">{user.login}</p>
                    </TableCell>
                    <TableCell>
                      <Badge variant={user.status === "BLOCKED" ? "destructive" : user.status === "PENDING" ? "secondary" : "outline"}>
                        {USER_STATUS_LABELS[user.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{formatDateTime(user.createdAt)}</TableCell>
                    <TableCell className="whitespace-nowrap">{user.lastLoginAt ? formatDateTime(user.lastLoginAt) : "—"}</TableCell>
                    <TableCell>
                      {user.role === "ADMIN" ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        <UserActions userId={user.id} status={user.status} />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
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

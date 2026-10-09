import { connection } from "next/server";
import Link from "next/link";
import { Suspense } from "react";
import { DealScore, DiscountBadge, RiskBadge } from "@/components/listing/badges";
import { SOURCE_STATUS_LABELS } from "@/components/labels";
import { EmptyState, PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DISTRICT_LABELS } from "@/domain/listing/enums";
import { formatArea, formatDateTime, formatKztShort, formatNumber, formatPercent } from "@/domain/format";
import { DEFAULT_MIN_DISCOUNT } from "@/lib/validation/catalogFilters";
import { cn } from "@/lib/utils";
import { getDashboardStats, type DashboardStats } from "@/server/services/dashboardService";

const PERIODS = [
  { days: 1, label: "Сутки" },
  { days: 7, label: "Неделя" },
  { days: 30, label: "Месяц" },
] as const;

export default function DashboardPage(props: PageProps<"/">) {
  return (
    <>
      <PageHeader
        title="Обзор рынка"
        description={`Квартиры в Алматы, цена которых на ${DEFAULT_MIN_DISCOUNT}% и более ниже расчётной рыночной стоимости по похожим объявлениям.`}
        actions={
          <Button asChild>
            <Link href="/listings">Смотреть выгодные квартиры</Link>
          </Button>
        }
      />
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardContent searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

async function DashboardContent({ searchParams }: Pick<PageProps<"/">, "searchParams">) {
  await connection();
  const params = await searchParams;
  const period = PERIODS.find((p) => String(p.days) === params.period)?.days ?? 7;
  const stats = await getDashboardStats(period);

  if (stats.realm === "empty") {
    return (
      <div className="space-y-6">
        <EmptyState
          title="Данных пока нет"
          description={
            <>
              Объявления появятся после первого обновления. Запустите <code className="font-mono">npm run worker</code>,
              загрузите файл в разделе «Управление» или выполните <code className="font-mono">npm run seed</code> для
              тестовых данных.
            </>
          }
          action={
            <Button asChild variant="outline">
              <Link href="/admin">Перейти в управление</Link>
            </Button>
          }
        />
        <SystemStatus stats={stats} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section aria-label="Ключевые показатели" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Активных объявлений"
          value={formatNumber(stats.activeCount)}
          hint={`Оценено надёжно: ${formatNumber(stats.valuedCount)}`}
        />
        <KpiCard
          label={`Потенциально выгодных (от ${DEFAULT_MIN_DISCOUNT}%)`}
          value={formatNumber(stats.dealsCount)}
          hint={
            <Link href="/listings" className="underline underline-offset-2">
              Открыть рейтинг
            </Link>
          }
          accent
        />
        <KpiCard
          label="Новых объявлений"
          value={formatNumber(stats.newCount)}
          hint={<PeriodSwitch current={period} />}
        />
        <KpiCard
          label="Отклонение от рынка"
          value={stats.medianDiscount === null ? "—" : signedPercent(stats.medianDiscount)}
          hint={stats.averageDiscount === null ? "Нет оценок" : `Медиана; среднее ${signedPercent(stats.averageDiscount)}`}
        />
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="min-w-0 lg:col-span-2" aria-labelledby="latest-deals">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 id="latest-deals" className="font-semibold">
              Последние найденные предложения
            </h2>
            <Link href="/listings?mode=discount" className="text-sm text-muted-foreground hover:text-foreground">
              Все по скидке →
            </Link>
          </div>
          {stats.latestDeals.length === 0 ? (
            <EmptyState
              title="Выгодных предложений пока нет"
              description={`Ни одно объявление сейчас не дешевле рынка на ${DEFAULT_MIN_DISCOUNT}% с надёжной оценкой.`}
            />
          ) : (
            <ul className="divide-y rounded-xl border">
              {stats.latestDeals.map((deal) => (
                <li key={deal.id}>
                  <Link
                    href={`/listings/${deal.id}`}
                    className="flex items-start gap-4 px-4 py-3 transition-colors hover:bg-muted/50"
                  >
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <p className="font-medium">
                        {deal.rooms}-комн., {formatArea(deal.totalArea.toString())} · {DISTRICT_LABELS[deal.district]} р-н
                      </p>
                      <p className="truncate text-sm text-muted-foreground">
                        {deal.complexName ?? "ЖК не указан"} · найдено {formatDateTime(deal.firstSeenAt)}
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <DiscountBadge percent={deal.valuation?.discountPercent ? Number(deal.valuation.discountPercent) : null} />
                        <RiskBadge level={deal.valuation?.riskLevel ?? null} />
                      </div>
                    </div>
                    <div className="tabular flex shrink-0 flex-col items-end gap-1 text-right">
                      <p className="font-semibold">{formatKztShort(deal.priceKzt)}</p>
                      {deal.valuation?.marketValue && (
                        <p className="text-xs text-muted-foreground">рынок ≈ {formatKztShort(deal.valuation.marketValue)}</p>
                      )}
                      <DealScore score={deal.valuation?.dealScore ?? null} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        <SystemStatus stats={stats} />
      </div>
    </div>
  );
}

function KpiCard({ label, value, hint, accent }: { label: string; value: string; hint: React.ReactNode; accent?: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className={cn("tabular text-3xl font-semibold", accent && "text-positive")}>{value}</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">{hint}</CardContent>
    </Card>
  );
}

function PeriodSwitch({ current }: { current: number }) {
  return (
    <span className="inline-flex gap-1" role="group" aria-label="Период">
      {PERIODS.map((period) => (
        <Link
          key={period.days}
          href={period.days === 7 ? "/" : `/?period=${period.days}`}
          aria-current={period.days === current ? "true" : undefined}
          className={cn(
            "rounded px-1.5 py-0.5 hover:text-foreground",
            period.days === current && "bg-muted font-medium text-foreground",
          )}
        >
          {period.label}
        </Link>
      ))}
    </span>
  );
}

function SystemStatus({ stats }: { stats: DashboardStats }) {
  const worker = stats.worker;
  const workerText =
    worker.state === "RUNNING"
      ? worker.currentTask
        ? `Работает: ${worker.currentTask.toLowerCase()}`
        : "Работает, ожидает следующего запуска"
      : worker.state === "STOPPED"
        ? `Остановлен (последний сигнал ${formatDateTime(worker.lastBeatAt!)})`
        : "Ещё не запускался";

  return (
    <section aria-labelledby="system-status">
      <h2 id="system-status" className="mb-3 font-semibold">
        Состояние данных
      </h2>
      <Card size="sm">
        <CardContent className="space-y-4 text-sm">
          <StatusRow label="Последнее успешное обновление">
            {stats.lastSuccessAt ? formatDateTime(stats.lastSuccessAt) : "Не было"}
          </StatusRow>
          <StatusRow label="Фоновый процесс">
            <StatusDot ok={worker.state === "RUNNING"} />
            {workerText}
          </StatusRow>
          <div className="space-y-2">
            <p className="text-muted-foreground">Источники данных</p>
            {stats.sources.length === 0 && <p>Источники ещё не зарегистрированы — запустите worker.</p>}
            <ul className="space-y-2">
              {stats.sources.map((source) => (
                <li key={source.key} className="rounded-lg bg-muted/50 p-2.5">
                  <p className="flex items-center gap-1.5 font-medium">
                    <StatusDot ok={source.status === "CONNECTED"} warn={source.status === "NOT_CONNECTED"} />
                    {source.name}
                    <span className="font-normal text-muted-foreground">— {SOURCE_STATUS_LABELS[source.status]}</span>
                  </p>
                  {source.statusMessage && <p className="mt-0.5 text-xs text-muted-foreground">{source.statusMessage}</p>}
                </li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

function StatusRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-muted-foreground">{label}</p>
      <p className="flex items-center gap-1.5 font-medium">{children}</p>
    </div>
  );
}

function StatusDot({ ok, warn }: { ok: boolean; warn?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block size-2 shrink-0 rounded-full", ok ? "bg-positive" : warn ? "bg-warning" : "bg-destructive")}
    />
  );
}

function signedPercent(value: number) {
  return value > 0 ? `−${formatPercent(value)}` : value < 0 ? `+${formatPercent(-value)}` : formatPercent(0);
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Загрузка">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-32 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-80 rounded-xl" />
    </div>
  );
}

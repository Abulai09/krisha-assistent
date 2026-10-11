import { connection } from "next/server";
import Link from "next/link";
import { Suspense } from "react";
import { ChevronDown } from "lucide-react";
import { ListingCard } from "@/components/listing/listing-card";
import { SOURCE_STATUS_LABELS } from "@/components/labels";
import { EmptyState, PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTime, formatNumber, formatPercent, pluralize } from "@/domain/format";
import { DEFAULT_MIN_DISCOUNT } from "@/lib/validation/catalogFilters";
import { cn } from "@/lib/utils";
import { getDashboardStats, type DashboardStats } from "@/server/services/dashboardService";

const PERIODS = [
  { days: 1, label: "сутки" },
  { days: 7, label: "неделю" },
  { days: 30, label: "месяц" },
] as const;

export default function DashboardPage(props: PageProps<"/">) {
  return (
    <>
      <PageHeader
        title="Выгодные квартиры в Алматы"
        description={`Квартиры, которые дешевле похожих объявлений на ${DEFAULT_MIN_DISCOUNT}% и больше.`}
        actions={
          <Button asChild>
            <Link href="/listings">Все выгодные предложения</Link>
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
          description="Объявления появятся после первого обновления данных. Администратор может загрузить файл или запустить обновление в разделе «Управление»."
          action={
            <Button asChild variant="outline">
              <Link href="/admin">Перейти в управление</Link>
            </Button>
          }
        />
        <DataStatus stats={stats} />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <SummaryStrip stats={stats} period={period} />

      <section aria-labelledby="latest-deals" className="space-y-3">
        <h2 id="latest-deals" className="font-semibold">
          Новые выгодные предложения
        </h2>
        {stats.latestDeals.length === 0 ? (
          <EmptyState
            title="Выгодных предложений пока нет"
            description={`Сейчас нет квартир дешевле рынка на ${DEFAULT_MIN_DISCOUNT}% с надёжной оценкой. Загляните после следующего обновления.`}
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {stats.latestDeals.map((listing) => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </div>
        )}
      </section>

      <DataStatus stats={stats} />
    </div>
  );
}

/** Ключевые цифры одной строкой вместо четырёх отдельных плиток. */
function SummaryStrip({ stats, period }: { stats: DashboardStats; period: number }) {
  return (
    <section aria-label="Ключевые показатели" className="grid grid-cols-1 divide-y rounded-xl border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
      <Stat
        value={formatNumber(stats.dealsCount)}
        label={pluralize(stats.dealsCount, ["выгодное предложение", "выгодных предложения", "выгодных предложений"])}
        accent
      >
        дешевле рынка на {DEFAULT_MIN_DISCOUNT}% и больше
      </Stat>
      <Stat value={formatNumber(stats.activeCount)} label={pluralize(stats.activeCount, ["объявление в базе", "объявления в базе", "объявлений в базе"])}>
        {stats.lastSuccessAt ? `обновлено ${formatDateTime(stats.lastSuccessAt)}` : "ещё не обновлялось"}
      </Stat>
      <Stat value={formatNumber(stats.newCount)} label="новых">
        <span className="inline-flex flex-wrap gap-x-1" role="group" aria-label="Период">
          за
          {PERIODS.map((p) => (
            <Link
              key={p.days}
              href={p.days === 7 ? "/" : `/?period=${p.days}`}
              aria-current={p.days === period ? "true" : undefined}
              className={cn("hover:text-foreground", p.days === period ? "font-medium text-foreground" : "underline underline-offset-2")}
            >
              {p.label}
            </Link>
          ))}
        </span>
      </Stat>
    </section>
  );
}

function Stat({ value, label, accent, children }: { value: string; label: string; accent?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1 p-4">
      <p className="flex items-baseline gap-2">
        <span className={cn("tabular text-2xl font-semibold", accent && "text-positive")}>{value}</span>
        <span className="text-sm">{label}</span>
      </p>
      <p className="text-xs text-muted-foreground">{children}</p>
    </div>
  );
}

/** Технические подробности — для тех, кому важно, откуда данные. Свёрнуто по умолчанию. */
function DataStatus({ stats }: { stats: DashboardStats }) {
  const worker = stats.worker;
  const workerText =
    worker.state === "RUNNING"
      ? worker.currentTask
        ? `работает: ${worker.currentTask.toLowerCase()}`
        : "работает"
      : worker.state === "STOPPED"
        ? `остановлено (последний сигнал ${formatDateTime(worker.lastBeatAt!)})`
        : "ещё не запускалось";
  const problems = stats.sources.filter((s) => s.status === "ERROR").length + (worker.state === "RUNNING" ? 0 : 1);

  return (
    <details className="group rounded-xl border">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm">
        <span>
          <span className="font-medium">Состояние данных</span>
          <span className="text-muted-foreground">
            {" · "}
            {problems > 0 ? "требует внимания" : "всё работает"}
          </span>
        </span>
        <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 border-t p-4 text-sm sm:grid-cols-2">
        <StatusRow label="Последнее успешное обновление">
          {stats.lastSuccessAt ? formatDateTime(stats.lastSuccessAt) : "не было"}
        </StatusRow>
        <StatusRow label="Фоновое обновление">{workerText}</StatusRow>
        <StatusRow label="Отклонение цен от рынка">
          {stats.medianDiscount === null
            ? "нет оценок"
            : `медиана ${signedPercent(stats.medianDiscount)}, среднее ${signedPercent(stats.averageDiscount ?? 0)}`}
        </StatusRow>
        <StatusRow label="Надёжно оценено">
          {formatNumber(stats.valuedCount)} из {formatNumber(stats.activeCount)}
        </StatusRow>
        <div className="sm:col-span-2">
          <dt className="text-muted-foreground">Источники данных</dt>
          <dd>
            <ul className="mt-1 space-y-1">
              {stats.sources.length === 0 && <li>Источники ещё не зарегистрированы.</li>}
              {stats.sources.map((source) => (
                <li key={source.key}>
                  {source.name} — {SOURCE_STATUS_LABELS[source.status].toLowerCase()}
                  {source.statusMessage && <span className="block text-xs text-muted-foreground">{source.statusMessage}</span>}
                </li>
              ))}
            </ul>
          </dd>
        </div>
      </dl>
    </details>
  );
}

function StatusRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** «−2,0%» = цены в среднем ниже рынка (так же, как скидка в карточках). */
function signedPercent(value: number) {
  return value > 0 ? `−${formatPercent(value)}` : value < 0 ? `+${formatPercent(-value)}` : formatPercent(0);
}

function DashboardSkeleton() {
  return (
    <div className="space-y-8" aria-busy="true" aria-label="Загрузка">
      <Skeleton className="h-24 rounded-xl" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-56 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

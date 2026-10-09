import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { DistributionChart, DistrictPriceChart, TrendChart } from "@/components/analytics/charts";
import { EmptyState, PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DISTRICT_LABELS } from "@/domain/listing/enums";
import { formatNumber, formatPercent } from "@/domain/format";
import { DEFAULT_MIN_DISCOUNT } from "@/lib/validation/catalogFilters";
import {
  getAnalytics,
  MIN_DISTRICT_SAMPLE,
  MIN_TREND_MONTHS,
  MIN_TREND_POINTS_PER_MONTH,
} from "@/server/services/analyticsService";

export const metadata: Metadata = { title: "Аналитика" };

export default function AnalyticsPage() {
  return (
    <>
      <PageHeader
        title="Аналитика рынка"
        description="Цены предложения по районам Алматы на основе активных объявлений (дубликаты исключены)."
      />
      <Suspense fallback={<Skeleton className="h-[40rem] rounded-xl" />}>
        <AnalyticsContent />
      </Suspense>
    </>
  );
}

async function AnalyticsContent() {
  await connection();
  const data = await getAnalytics();

  if (data.realm === "empty") {
    return <EmptyState title="Данных для аналитики пока нет" description="Аналитика появится после первого обновления данных." />;
  }

  const chartDistricts = data.districts
    .filter((d) => d.medianPricePerSqm !== null)
    .map((d) => ({ name: DISTRICT_LABELS[d.district], value: d.medianPricePerSqm! }));
  const share = data.activeTotal > 0 ? (data.dealsTotal / data.activeTotal) * 100 : 0;

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3" aria-label="Итоги">
        <Stat label="Активных объявлений" value={formatNumber(data.activeTotal)} />
        <Stat label={`Со скидкой от ${DEFAULT_MIN_DISCOUNT}%`} value={formatNumber(data.dealsTotal)} />
        <Stat label="Доля потенциально выгодных" value={formatPercent(share)} />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Медианная цена за м² по районам</CardTitle>
          <CardDescription>
            Медиана устойчивее среднего к единичным завышенным или ошибочным ценам. Районы, где меньше{" "}
            {MIN_DISTRICT_SAMPLE} объявлений, не оцениваются.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {chartDistricts.length > 0 && <DistrictPriceChart data={chartDistricts} />}
          <div className="-mx-2 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Район</TableHead>
                  <TableHead className="text-right">Объявлений</TableHead>
                  <TableHead className="text-right">Медиана, ₸/м²</TableHead>
                  <TableHead className="text-right">Со скидкой от {DEFAULT_MIN_DISCOUNT}%</TableHead>
                  <TableHead className="text-right">Медианное отклонение</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.districts.map((row) => (
                  <TableRow key={row.district}>
                    <TableCell>
                      <Link href={`/listings?district=${row.district}`} className="underline-offset-2 hover:underline">
                        {DISTRICT_LABELS[row.district]}
                      </Link>
                    </TableCell>
                    <TableCell className="tabular text-right">{formatNumber(row.listings)}</TableCell>
                    <TableCell className="tabular text-right">
                      {row.medianPricePerSqm !== null ? formatNumber(row.medianPricePerSqm) : <span className="text-muted-foreground">мало данных</span>}
                    </TableCell>
                    <TableCell className="tabular text-right">{formatNumber(row.deals)}</TableCell>
                    <TableCell className="tabular text-right">
                      {row.medianDiscount !== null ? signed(row.medianDiscount) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Распределение цен</CardTitle>
            <CardDescription>Сколько объявлений в каждом диапазоне цены за м² (шаг 100 тыс. ₸).</CardDescription>
          </CardHeader>
          <CardContent>
            <DistributionChart
              data={data.distribution.map((bucket) => ({ label: String(bucket.from / 1000), count: bucket.count }))}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Динамика цен</CardTitle>
            <CardDescription>Медиана цены за м² по месяцам наблюдения.</CardDescription>
          </CardHeader>
          <CardContent>
            {data.trend ? (
              <TrendChart data={data.trend.map((point) => ({ month: point.month, value: point.medianPricePerSqm }))} />
            ) : (
              <div className="flex h-64 flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-6 text-center text-sm">
                <p className="font-medium">Недостаточно накопленных данных</p>
                <p className="max-w-sm text-muted-foreground">
                  Чтобы говорить о динамике, нужно минимум {MIN_TREND_MONTHS} месяца наблюдений по {MIN_TREND_POINTS_PER_MONTH}+
                  цен. Сейчас накоплено: {data.trendMonthsAvailable}. Выводы о росте или падении рынка пока не делаются.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="tabular text-3xl font-semibold">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}

function signed(value: number) {
  return value > 0 ? `−${formatPercent(value)}` : value < 0 ? `+${formatPercent(-value)}` : formatPercent(0);
}

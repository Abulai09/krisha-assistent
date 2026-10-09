import { connection } from "next/server";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AlertTriangle, ExternalLink, Info } from "lucide-react";
import { ConfidenceBadge, DealScore, DiscountBadge, RiskBadge } from "@/components/listing/badges";
import { PriceHistoryChart } from "@/components/listing/price-history-chart";
import { SCOPE_LABELS } from "@/components/labels";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  BUILDING_TYPE_LABELS,
  CONDITION_LABELS,
  DISTRICT_LABELS,
  SELLER_TYPE_LABELS,
} from "@/domain/listing/enums";
import { formatArea, formatDate, formatKzt, formatKztApprox, formatNumber, formatPercent, formatShortDate, pluralize } from "@/domain/format";
import { pricePerSqm, toAreaCenti } from "@/domain/money";
import { WARNING_DESCRIPTIONS, WARNING_LABELS, isWarningCode } from "@/domain/valuation/warnings";
import { readExplanation } from "@/lib/validation/explanation";
import { getListingDetail, type ListingDetail } from "@/server/services/listingQueryService";

export const metadata: Metadata = { title: "Квартира" };

export default function ListingPage(props: PageProps<"/listings/[id]">) {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <ListingDetailView params={props.params} />
    </Suspense>
  );
}

async function ListingDetailView({ params }: Pick<PageProps<"/listings/[id]">, "params">) {
  await connection();
  const { id } = await params;
  if (id.length > 64) notFound();
  const listing = await getListingDetail(id);
  if (!listing) notFound();

  const valuation = listing.valuation;
  const ok = valuation?.status === "OK";
  const explanation = readExplanation(valuation?.explanation);
  const warnings = (valuation?.warnings ?? []).filter(isWarningCode);
  const ownPricePerSqm = pricePerSqm(listing.priceKzt, toAreaCenti(listing.totalArea.toString()));
  const discount = valuation?.discountPercent ? Number(valuation.discountPercent) : null;

  return (
    <div className="space-y-6">
      <nav aria-label="Навигация" className="text-sm">
        <Link href="/listings" className="text-muted-foreground hover:text-foreground">
          ← К списку квартир
        </Link>
      </nav>

      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            {listing.rooms}-комн. квартира, {formatArea(listing.totalArea.toString())}
          </h1>
          {listing.status === "INACTIVE" && <Badge variant="secondary">Снято с публикации</Badge>}
          {listing.source.isSynthetic && (
            <Badge variant="outline" className="border-warning/50 text-warning">
              Тестовые данные
            </Badge>
          )}
        </div>
        <p className="text-muted-foreground">
          {DISTRICT_LABELS[listing.district]} район
          {listing.microdistrict && `, ${listing.microdistrict}`}
          {listing.complexName && ` · ${listing.complexName}`}
          {listing.address && ` · ${listing.address}`}
        </p>
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span>Источник: {listing.source.name}</span>
          {listing.url ? (
            <a href={listing.url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 underline underline-offset-2 hover:text-foreground">
              Открыть оригинальное объявление <ExternalLink className="size-3.5" aria-hidden="true" />
              <span className="sr-only">(откроется в новой вкладке)</span>
            </a>
          ) : (
            <span>Ссылка на оригинал отсутствует</span>
          )}
        </p>
      </header>

      <section aria-label="Итог оценки" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard label="Цена объявления" value={formatKzt(listing.priceKzt)} hint={`${formatNumber(Number(ownPricePerSqm))} ₸/м²`} />
        <SummaryCard
          label="Расчётная рыночная стоимость"
          value={ok && valuation.marketValue ? formatKztApprox(valuation.marketValue) : "Не определена"}
          hint={
            ok && valuation.marketValueLow && valuation.marketValueHigh
              ? `Типичный диапазон: ${formatKztApprox(valuation.marketValueLow).slice(2)} – ${formatKztApprox(valuation.marketValueHigh).slice(2)}`
              : "Недостаточно данных для надёжной оценки"
          }
        />
        <SummaryCard
          label="Отклонение от рынка"
          value={<DiscountBadge percent={ok ? discount : null} className="text-base" />}
          hint={ok && valuation.potentialDifference !== null ? `Разница ≈ ${signedKzt(roundTo10k(valuation.potentialDifference))}` : "—"}
        />
        <SummaryCard
          label="Deal Score"
          value={<DealScore score={ok ? valuation.dealScore : null} size="lg" />}
          hint={
            ok ? (
              <span className="flex flex-wrap gap-1.5">
                <ConfidenceBadge level={valuation.confidenceLevel} />
                <RiskBadge level={valuation.riskLevel} />
              </span>
            ) : (
              "Объект не участвует в рейтинге"
            )
          }
        />
      </section>

      {warnings.length > 0 && (
        <Alert className="border-warning/40 bg-warning-muted">
          <AlertTriangle className="text-warning" aria-hidden="true" />
          <AlertTitle>На что обратить внимание</AlertTitle>
          <AlertDescription>
            <ul className="mt-1 space-y-1.5">
              {warnings.map((code) => (
                <li key={code}>
                  <span className="font-medium text-foreground">{WARNING_LABELS[code]}.</span> {WARNING_DESCRIPTIONS[code]}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>{ok ? "Почему объект попал в рейтинг" : "Почему нет оценки"}</CardTitle>
              <CardDescription>
                {ok
                  ? `Сравнение с ${valuation.comparablesCount} ${pluralize(valuation.comparablesCount, ["похожим объявлением", "похожими объявлениями", "похожими объявлениями"])}: ${SCOPE_LABELS[valuation.comparableScope ?? ""]?.toLowerCase() ?? ""}.`
                  : "Без достаточного количества аналогов рыночная цена не рассчитывается — мы не подставляем догадки."}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <FactorList title="Повышает привлекательность" items={explanation.positives} empty="Явных преимуществ не найдено." tone="positive" />
              <FactorList title="Снижает привлекательность" items={explanation.negatives} empty="Явных недостатков не найдено." tone="negative" />
              {explanation.differences.length > 0 && (
                <div className="sm:col-span-2">
                  <FactorList title="Чем отличается от аналогов" items={explanation.differences} tone="neutral" />
                </div>
              )}
            </CardContent>
          </Card>

          {ok && valuation.marketValue && valuation.estimatedPricePerSqm && (
            <Card>
              <CardHeader>
                <CardTitle>Как рассчитана рыночная стоимость</CardTitle>
                <CardDescription>Оценка по ценам предложения похожих объявлений, а не по ценам сделок.</CardDescription>
              </CardHeader>
              <CardContent className="tabular space-y-3 text-sm">
                <FormulaRow label="Медиана цены за м² у аналогов (взвешенная по похожести)">
                  {formatKzt(valuation.estimatedPricePerSqm)}/м²
                </FormulaRow>
                {explanation.pricePerSqmLow && explanation.pricePerSqmHigh && (
                  <FormulaRow label="Типичный диапазон у аналогов (25–75%)">
                    {formatKzt(BigInt(explanation.pricePerSqmLow))} – {formatKzt(BigInt(explanation.pricePerSqmHigh))}/м²
                  </FormulaRow>
                )}
                <FormulaRow label="Рыночная стоимость = цена за м² × площадь">
                  {formatKzt(valuation.estimatedPricePerSqm)} × {formatArea(listing.totalArea.toString())} ={" "}
                  <strong>{formatKzt(valuation.marketValue)}</strong>
                </FormulaRow>
                <FormulaRow label="Скидка = (рынок − цена) / рынок × 100">
                  ({formatKzt(valuation.marketValue)} − {formatKzt(listing.priceKzt)}) / {formatKzt(valuation.marketValue)} × 100 ={" "}
                  <strong>{discount !== null ? formatPercent(discount) : "—"}</strong>
                </FormulaRow>
                <FormulaRow label="Разница = рынок − цена">
                  <strong>{valuation.potentialDifference !== null ? signedKzt(valuation.potentialDifference) : "—"}</strong>
                </FormulaRow>
                {explanation.comparablesExcluded > 0 && (
                  <p className="text-muted-foreground">
                    Исключено как выбросы: {explanation.comparablesExcluded}{" "}
                    {pluralize(explanation.comparablesExcluded, ["объявление", "объявления", "объявлений"])} с аномальной ценой за м².
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {valuation && valuation.comparables.length > 0 && <ComparablesTable listing={listing} />}
        </div>

        <aside className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Характеристики</CardTitle>
            </CardHeader>
            <CardContent>
              <Characteristics listing={listing} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>История цены</CardTitle>
              <CardDescription>
                {listing.priceHistory.length > 1
                  ? `Цена менялась ${listing.priceHistory.length - 1} ${pluralize(listing.priceHistory.length - 1, ["раз", "раза", "раз"])}`
                  : "Цена не менялась с момента первого обнаружения"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {listing.priceHistory.length > 1 && (
                <PriceHistoryChart
                  points={listing.priceHistory.map((point) => ({
                    date: point.observedAt.toISOString(),
                    label: point.observedAt.toLocaleDateString("ru-RU", { day: "numeric", month: "short" }),
                    price: Number(point.priceKzt),
                  }))}
                />
              )}
              <ul className="tabular space-y-1 text-sm">
                {[...listing.priceHistory].reverse().map((point) => (
                  <li key={point.observedAt.toISOString()} className="flex justify-between gap-2">
                    <span className="text-muted-foreground">{formatDate(point.observedAt)}</span>
                    <span>{formatKzt(point.priceKzt)}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Info className="size-4" aria-hidden="true" />
                Ограничения оценки
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {explanation.missingFields.length > 0 && (
                <div>
                  <p className="font-medium">Нет данных</p>
                  <p className="text-muted-foreground">{explanation.missingFields.join(", ")}</p>
                </div>
              )}
              <ul className="list-disc space-y-1.5 pl-4 text-muted-foreground">
                {explanation.caveats.map((caveat) => (
                  <li key={caveat}>{caveat}</li>
                ))}
              </ul>
              {valuation && <p className="text-xs text-muted-foreground">Оценка от {formatDate(valuation.valuedAt)}, метод {valuation.method}</p>}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, hint }: { label: string; value: React.ReactNode; hint: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <div className="tabular text-xl font-semibold">{value}</div>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">{hint}</CardContent>
    </Card>
  );
}

function FactorList({ title, items, empty, tone }: { title: string; items: string[]; empty?: string; tone: "positive" | "negative" | "neutral" }) {
  const marker = tone === "positive" ? "+" : tone === "negative" ? "−" : "•";
  return (
    <div>
      <h3 className="mb-2 text-sm font-medium">{title}</h3>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="space-y-1.5 text-sm">
          {items.map((item) => (
            <li key={item} className="flex gap-2">
              <span
                aria-hidden="true"
                className={tone === "positive" ? "text-positive" : tone === "negative" ? "text-destructive" : "text-muted-foreground"}
              >
                {marker}
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FormulaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-b pb-3 last:border-0 last:pb-0">
      <span className="text-muted-foreground">{label}</span>
      <span>{children}</span>
    </div>
  );
}

function Characteristics({ listing }: { listing: ListingDetail }) {
  const unknown = <span className="text-muted-foreground">не указано</span>;
  const rows: [string, React.ReactNode][] = [
    ["Общая площадь", formatArea(listing.totalArea.toString())],
    ["Жилая площадь", listing.livingArea ? formatArea(listing.livingArea.toString()) : unknown],
    ["Кухня", listing.kitchenArea ? formatArea(listing.kitchenArea.toString()) : unknown],
    ["Комнат", listing.rooms],
    ["Этаж", listing.floor !== null ? `${listing.floor}${listing.floorsTotal ? ` из ${listing.floorsTotal}` : ""}` : unknown],
    ["Тип дома", listing.buildingType ? BUILDING_TYPE_LABELS[listing.buildingType] : unknown],
    ["Год постройки", listing.yearBuilt ?? unknown],
    ["Состояние", listing.condition ? CONDITION_LABELS[listing.condition] : unknown],
    ["Потолки", listing.ceilingHeight ? `${listing.ceilingHeight.toString()} м` : unknown],
    ["Продавец", listing.sellerType ? SELLER_TYPE_LABELS[listing.sellerType] : unknown],
    ["Мебель", listing.furnished === null ? unknown : listing.furnished ? "Есть" : "Нет"],
    ["Опубликовано", listing.publishedAt ? formatShortDate(listing.publishedAt) : unknown],
    ["Обновлено в источнике", listing.sourceUpdatedAt ? formatShortDate(listing.sourceUpdatedAt) : unknown],
    ["Последний раз видели", formatShortDate(listing.lastSeenAt)],
  ];
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="text-right">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function ComparablesTable({ listing }: { listing: ListingDetail }) {
  const comparables = listing.valuation?.comparables ?? [];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Использованные аналоги</CardTitle>
        <CardDescription>Похожесть учитывает площадь, состояние, год и тип дома, этаж и свежесть объявления.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="-mx-2 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Квартира</TableHead>
                <TableHead className="text-right">Цена</TableHead>
                <TableHead className="text-right">₸/м²</TableHead>
                <TableHead className="text-right">Похожесть</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {comparables.map(({ comparable, pricePerSqm: ppsm, similarity, excludedAsOutlier }) => (
                <TableRow key={comparable.id} className={excludedAsOutlier ? "text-muted-foreground" : undefined}>
                  <TableCell>
                    <Link href={`/listings/${comparable.id}`} className="underline-offset-2 hover:underline">
                      {comparable.rooms}-комн., {formatArea(comparable.totalArea.toString())}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      {[
                        comparable.complexName ?? comparable.microdistrict,
                        comparable.floor !== null ? `${comparable.floor}/${comparable.floorsTotal ?? "?"} эт.` : null,
                        comparable.yearBuilt,
                        comparable.condition ? CONDITION_LABELS[comparable.condition] : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                    {excludedAsOutlier && <Badge variant="outline" className="mt-1">Исключён как выброс</Badge>}
                  </TableCell>
                  <TableCell className="tabular text-right">{formatKzt(comparable.priceKzt)}</TableCell>
                  <TableCell className="tabular text-right">{formatNumber(Number(ppsm))}</TableCell>
                  <TableCell className="tabular text-right">{Math.round(Number(similarity) * 100)}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function roundTo10k(value: bigint): bigint {
  return BigInt(Math.round(Number(value) / 10_000) * 10_000);
}

function signedKzt(value: bigint) {
  if (value > 0n) return `+${formatKzt(value)}`;
  if (value < 0n) return `−${formatKzt(-value)}`;
  return formatKzt(0);
}

function DetailSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Загрузка">
      <Skeleton className="h-16 w-2/3" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-96 rounded-xl" />
    </div>
  );
}

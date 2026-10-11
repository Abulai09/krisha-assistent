import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { AlertTriangle, ChevronDown, ExternalLink } from "lucide-react";
import { DiscountBadge } from "@/components/listing/badges";
import { PriceHistoryChart } from "@/components/listing/price-history-chart";
import { CONFIDENCE_LABELS, RISK_LABELS, SCOPE_LABELS } from "@/components/labels";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BUILDING_TYPE_LABELS, CONDITION_LABELS, DISTRICT_LABELS, SELLER_TYPE_LABELS } from "@/domain/listing/enums";
import {
  formatArea,
  formatDate,
  formatKzt,
  formatKztApprox,
  formatKztShort,
  formatNumber,
  formatPercent,
  formatShortDate,
  pluralize,
} from "@/domain/format";
import { pricePerSqm, toAreaCenti } from "@/domain/money";
import { WARNING_DESCRIPTIONS, WARNING_LABELS, isWarningCode } from "@/domain/valuation/warnings";
import { cn } from "@/lib/utils";
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

/**
 * Порядок экрана — от ответа к подробностям:
 * вердикт → предупреждения → почему → (по клику) расчёт и аналоги; характеристики и история — сбоку.
 */
async function ListingDetailView({ params }: Pick<PageProps<"/listings/[id]">, "params">) {
  await connection();
  const { id } = await params;
  if (id.length > 64) notFound();
  const listing = await getListingDetail(id);
  if (!listing) notFound();

  const valuation = listing.valuation;
  const explanation = readExplanation(valuation?.explanation);
  const warnings = (valuation?.warnings ?? []).filter(isWarningCode);
  const ok = valuation?.status === "OK";

  return (
    <div className="space-y-6">
      <Link href="/listings" className="inline-block text-sm text-muted-foreground hover:text-foreground">
        ← К списку квартир
      </Link>

      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {listing.rooms}-комн. квартира, {formatArea(listing.totalArea.toString())}
          </h1>
          <p className="text-muted-foreground">
            {[`${DISTRICT_LABELS[listing.district]} район`, listing.microdistrict, listing.complexName, listing.address]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            {listing.status === "INACTIVE" && <Badge variant="secondary">Снято с публикации</Badge>}
            {listing.source.isSynthetic && (
              <Badge variant="outline" className="border-warning/50 text-warning">
                Тестовые данные
              </Badge>
            )}
          </div>
        </div>
        {listing.url && (
          <Button asChild variant="outline" className="shrink-0">
            <a href={listing.url} target="_blank" rel="noopener noreferrer nofollow">
              Открыть объявление <ExternalLink aria-hidden="true" />
              <span className="sr-only">(откроется в новой вкладке)</span>
            </a>
          </Button>
        )}
      </header>

      <Verdict listing={listing} />

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

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <section aria-labelledby="why" className="space-y-4">
            <div>
              <h2 id="why" className="font-semibold">
                {ok ? "Почему такая оценка" : "Почему нет оценки"}
              </h2>
              <p className="text-sm text-muted-foreground">
                {ok
                  ? `Сравнение с ${valuation.comparablesCount} ${pluralize(valuation.comparablesCount, ["похожим объявлением", "похожими объявлениями", "похожими объявлениями"])} — ${SCOPE_LABELS[valuation.comparableScope ?? ""]?.toLowerCase() ?? ""}.`
                  : "Похожих объявлений слишком мало, поэтому рыночная цена не рассчитывается — мы не подставляем догадки."}
              </p>
            </div>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <FactorList title="Плюсы" items={explanation.positives} empty="Явных плюсов не найдено." tone="positive" />
              <FactorList title="Минусы" items={explanation.negatives} empty="Явных минусов не найдено." tone="negative" />
            </div>
            {explanation.differences.length > 0 && (
              <FactorList title="Чем отличается от похожих квартир" items={explanation.differences} tone="neutral" />
            )}
          </section>

          {ok && valuation.marketValue && valuation.estimatedPricePerSqm && (
            <Collapsible title="Как рассчитана стоимость">
              <Calculation listing={listing} />
            </Collapsible>
          )}
          {valuation && valuation.comparables.length > 0 && (
            <Collapsible title={`Похожие объявления (${valuation.comparables.length})`}>
              <ComparablesTable listing={listing} />
            </Collapsible>
          )}

          <section aria-labelledby="limits" className="space-y-2 text-sm text-muted-foreground">
            <h2 id="limits" className="font-medium text-foreground">
              Важно знать
            </h2>
            <ul className="list-disc space-y-1 pl-4">
              {explanation.caveats.map((caveat) => (
                <li key={caveat}>{caveat}</li>
              ))}
            </ul>
            {valuation && (
              <p className="text-xs">
                Оценка от {formatDate(valuation.valuedAt)} · метод {valuation.method}
              </p>
            )}
          </section>
        </div>

        <aside className="space-y-8">
          <section aria-labelledby="specs" className="space-y-3">
            <h2 id="specs" className="font-semibold">
              Характеристики
            </h2>
            <Characteristics listing={listing} missing={explanation.missingFields} />
          </section>
          <PriceHistory listing={listing} />
        </aside>
      </div>
    </div>
  );
}

/** Главный ответ страницы в одном блоке: цена, рынок, скидка и насколько этому верить. */
function Verdict({ listing }: { listing: ListingDetail }) {
  const valuation = listing.valuation;
  const ownPricePerSqm = pricePerSqm(listing.priceKzt, toAreaCenti(listing.totalArea.toString()));

  if (valuation?.status !== "OK" || !valuation.marketValue) {
    return (
      <section aria-label="Итог оценки" className="rounded-xl border p-5">
        <p className="tabular text-2xl font-semibold">{formatKzt(listing.priceKzt)}</p>
        <p className="text-sm text-muted-foreground">{formatNumber(Number(ownPricePerSqm))} ₸/м²</p>
        <p className="mt-3 text-sm">
          {valuation?.status === "INVALID_LISTING"
            ? "Данные объявления некорректны — оценка не выполнялась."
            : "Недостаточно данных для надёжной оценки — объект не участвует в рейтинге."}
        </p>
      </section>
    );
  }

  const discount = valuation.discountPercent ? Number(valuation.discountPercent) : 0;
  const difference = valuation.potentialDifference ?? 0n;

  return (
    <section aria-label="Итог оценки" className="grid grid-cols-1 gap-5 rounded-xl border p-5 md:grid-cols-[1fr_auto]">
      <div className="space-y-3">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <p className="tabular text-3xl font-semibold">{formatKzt(listing.priceKzt)}</p>
          <DiscountBadge percent={discount} className="text-sm" />
        </div>
        <p className="tabular text-sm text-muted-foreground">
          Рыночная стоимость {formatKztApprox(valuation.marketValue)}
          {valuation.marketValueLow && valuation.marketValueHigh && (
            <> (обычно {formatKztShort(valuation.marketValueLow)} – {formatKztShort(valuation.marketValueHigh)})</>
          )}
          {" · "}
          {formatNumber(Number(ownPricePerSqm))} ₸/м²
        </p>
        <p className="tabular text-sm">
          {difference > 0n
            ? `Дешевле рынка примерно на ${formatKztShort(roundTo10k(difference))}`
            : difference < 0n
              ? `Дороже рынка примерно на ${formatKztShort(roundTo10k(-difference))}`
              : "Цена на уровне рынка"}
          <span className="text-muted-foreground"> — это не прибыль: торг, ремонт и расходы на сделку не учтены.</span>
        </p>
      </div>

      <dl className="tabular grid grid-cols-3 gap-4 border-t pt-4 text-sm md:grid-cols-1 md:gap-2 md:border-t-0 md:border-l md:pt-0 md:pl-5">
        <VerdictFact label="Deal Score" value={`${valuation.dealScore ?? "—"} из 100`} />
        <VerdictFact label="Уверенность" value={CONFIDENCE_LABELS[valuation.confidenceLevel ?? "LOW"]} />
        <VerdictFact
          label="Риск"
          value={RISK_LABELS[valuation.riskLevel ?? "LOW"]}
          tone={valuation.riskLevel === "HIGH" ? "danger" : valuation.riskLevel === "MEDIUM" ? "warning" : undefined}
        />
      </dl>
    </section>
  );
}

function VerdictFact({ label, value, tone }: { label: string; value: string; tone?: "warning" | "danger" }) {
  return (
    <div className="md:flex md:items-baseline md:justify-between md:gap-6">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("font-medium", tone === "warning" && "text-warning", tone === "danger" && "text-destructive")}>{value}</dd>
    </div>
  );
}

/** Подробности для любопытных: свёрнуто, но в один клик. */
function Collapsible({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="group rounded-xl border">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 font-medium">
        {title}
        <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="border-t p-4">{children}</div>
    </details>
  );
}

function Calculation({ listing }: { listing: ListingDetail }) {
  const valuation = listing.valuation!;
  const explanation = readExplanation(valuation.explanation);
  const discount = valuation.discountPercent ? Number(valuation.discountPercent) : null;
  return (
    <div className="tabular space-y-3 text-sm">
      <p className="text-muted-foreground">Оценка по ценам предложения похожих объявлений, а не по ценам сделок.</p>
      <FormulaRow label="Цена за м² у похожих квартир (медиана, взвешенная по похожести)">
        {formatKzt(valuation.estimatedPricePerSqm!)}/м²
        {explanation.pricePerSqmLow && explanation.pricePerSqmHigh && (
          <span className="text-muted-foreground">
            {" "}
            (обычно {formatKzt(BigInt(explanation.pricePerSqmLow))} – {formatKzt(BigInt(explanation.pricePerSqmHigh))})
          </span>
        )}
      </FormulaRow>
      <FormulaRow label="Рыночная стоимость = цена за м² × площадь">
        {formatKzt(valuation.estimatedPricePerSqm!)} × {formatArea(listing.totalArea.toString())} = <strong>{formatKzt(valuation.marketValue!)}</strong>
      </FormulaRow>
      <FormulaRow label="Скидка = (рынок − цена) / рынок × 100">
        ({formatKzt(valuation.marketValue!)} − {formatKzt(listing.priceKzt)}) / {formatKzt(valuation.marketValue!)} × 100 ={" "}
        <strong>{discount !== null ? formatPercent(discount) : "—"}</strong>
      </FormulaRow>
      <FormulaRow label="Разница = рынок − цена">
        <strong>{valuation.potentialDifference !== null ? signedKzt(valuation.potentialDifference) : "—"}</strong>
      </FormulaRow>
      {explanation.comparablesExcluded > 0 && (
        <p className="text-muted-foreground">
          Не учтено как аномальные: {explanation.comparablesExcluded}{" "}
          {pluralize(explanation.comparablesExcluded, ["объявление", "объявления", "объявлений"])}.
        </p>
      )}
    </div>
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

/** Только известные характеристики; пробелы — одной строкой, а не десятком «не указано». */
function Characteristics({ listing, missing }: { listing: ListingDetail; missing: string[] }) {
  const rows: [string, string | number | null][] = [
    ["Общая площадь", formatArea(listing.totalArea.toString())],
    ["Жилая площадь", listing.livingArea ? formatArea(listing.livingArea.toString()) : null],
    ["Кухня", listing.kitchenArea ? formatArea(listing.kitchenArea.toString()) : null],
    ["Этаж", listing.floor !== null ? `${listing.floor}${listing.floorsTotal ? ` из ${listing.floorsTotal}` : ""}` : null],
    ["Дом", [listing.buildingType ? BUILDING_TYPE_LABELS[listing.buildingType] : null, listing.yearBuilt].filter(Boolean).join(", ") || null],
    ["Состояние", listing.condition ? CONDITION_LABELS[listing.condition] : null],
    ["Потолки", listing.ceilingHeight ? `${listing.ceilingHeight.toString()} м` : null],
    ["Продавец", listing.sellerType ? SELLER_TYPE_LABELS[listing.sellerType] : null],
    ["Мебель", listing.furnished === null ? null : listing.furnished ? "Есть" : "Нет"],
    ["Опубликовано", listing.publishedAt ? formatShortDate(listing.publishedAt) : null],
    ["Обновлено", formatShortDate(listing.sourceUpdatedAt ?? listing.lastSeenAt)],
  ];
  const known = rows.filter(([, value]) => value !== null);

  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        {known.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="text-right">{value}</dd>
          </div>
        ))}
      </dl>
      {missing.length > 0 && <p className="text-xs text-muted-foreground">Не указано в объявлении: {missing.join(", ").toLowerCase()}.</p>}
    </div>
  );
}

function PriceHistory({ listing }: { listing: ListingDetail }) {
  const changes = listing.priceHistory.length - 1;
  return (
    <section aria-labelledby="price-history" className="space-y-3">
      <div>
        <h2 id="price-history" className="font-semibold">
          История цены
        </h2>
        <p className="text-sm text-muted-foreground">
          {changes > 0 ? `Цена менялась ${changes} ${pluralize(changes, ["раз", "раза", "раз"])}` : "Цена не менялась с момента появления"}
        </p>
      </div>
      {changes > 0 && (
        <PriceHistoryChart
          points={listing.priceHistory.map((point) => ({
            date: point.observedAt.toISOString(),
            label: point.observedAt.toLocaleDateString("ru-RU", { day: "numeric", month: "short", timeZone: "Asia/Almaty" }),
            price: Number(point.priceKzt),
          }))}
        />
      )}
      <ul className="tabular space-y-1 text-sm">
        {[...listing.priceHistory].reverse().map((point) => (
          <li key={point.observedAt.toISOString()} className="flex justify-between gap-2">
            <span className="text-muted-foreground">{formatShortDate(point.observedAt)}</span>
            <span>{formatKzt(point.priceKzt)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ComparablesTable({ listing }: { listing: ListingDetail }) {
  const comparables = listing.valuation?.comparables ?? [];
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">Похожесть учитывает площадь, ремонт, год и тип дома, этаж и свежесть объявления.</p>
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
                      excludedAsOutlier ? "не учтено: аномальная цена" : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                </TableCell>
                <TableCell className="tabular text-right">{formatKzt(comparable.priceKzt)}</TableCell>
                <TableCell className="tabular text-right">{formatNumber(Number(ppsm))}</TableCell>
                <TableCell className="tabular text-right">{Math.round(Number(similarity) * 100)}%</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
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
      <Skeleton className="h-36 rounded-xl" />
      <Skeleton className="h-96 rounded-xl" />
    </div>
  );
}

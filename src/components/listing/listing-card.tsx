import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { CONDITION_LABELS, DISTRICT_LABELS } from "@/domain/listing/enums";
import { formatArea, formatShortDate, formatKzt, formatKztShort, formatNumber, pluralize } from "@/domain/format";
import { pricePerSqm, toAreaCenti } from "@/domain/money";
import { WARNING_LABELS, isWarningCode } from "@/domain/valuation/warnings";
import type { CatalogListing } from "@/server/services/listingQueryService";
import { ConfidenceBadge, DealScore, DiscountBadge, RiskBadge } from "./badges";

/**
 * Карточка квартиры в каталоге. Иерархия: цена и скидка → рынок и разница →
 * характеристики → надёжность оценки. Вся карточка — ссылка на подробную страницу.
 */
export function ListingCard({ listing }: { listing: CatalogListing }) {
  const valuation = listing.valuation?.status === "OK" ? listing.valuation : null;
  const discount = valuation?.discountPercent ? Number(valuation.discountPercent) : null;
  const ownPricePerSqm = pricePerSqm(listing.priceKzt, toAreaCenti(listing.totalArea.toString()));
  const updatedAt = listing.sourceUpdatedAt ?? listing.lastSeenAt;
  const warnings = (valuation?.warnings ?? []).filter(isWarningCode).filter((code) => code !== "PRICE_CHANGED");

  return (
    <article className="group relative flex min-w-0 flex-col gap-3 rounded-xl border bg-card p-4 transition-shadow focus-within:ring-2 focus-within:ring-ring/50 hover:shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-medium">
            <Link href={`/listings/${listing.id}`} className="after:absolute after:inset-0 focus-visible:outline-none">
              {listing.rooms}-комн. квартира, {formatArea(listing.totalArea.toString())}
            </Link>
          </h3>
          <p className="truncate text-sm text-muted-foreground">
            {DISTRICT_LABELS[listing.district]} р-н
            {listing.complexName ? ` · ${listing.complexName}` : listing.microdistrict ? ` · ${listing.microdistrict}` : ""}
          </p>
        </div>
        <DealScore score={valuation?.dealScore ?? null} />
      </div>

      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="tabular">
          <p className="text-xl font-semibold">{formatKzt(listing.priceKzt)}</p>
          <p className="text-xs text-muted-foreground">{formatNumber(Number(ownPricePerSqm))} ₸/м²</p>
        </div>
        <DiscountBadge percent={discount} />
      </div>

      {valuation?.marketValue ? (
        <dl className="tabular grid grid-cols-2 gap-x-3 gap-y-1 rounded-lg bg-muted/50 p-2.5 text-sm">
          <dt className="text-muted-foreground">Расчётный рынок</dt>
          <dd className="text-right font-medium">≈ {formatKztShort(valuation.marketValue)}</dd>
          <dt className="text-muted-foreground">Разница</dt>
          <dd className="text-right font-medium">{formatSigned(valuation.potentialDifference)}</dd>
        </dl>
      ) : (
        <p className="rounded-lg bg-muted/50 p-2.5 text-sm text-muted-foreground">
          {listing.valuation?.status === "INVALID_LISTING"
            ? "Данные объявления некорректны — оценка не выполнялась."
            : "Недостаточно данных для надёжной оценки."}
        </p>
      )}

      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
        <li>{listing.floor !== null ? `${listing.floor}${listing.floorsTotal ? `/${listing.floorsTotal}` : ""} этаж` : "Этаж не указан"}</li>
        <li>{listing.condition ? CONDITION_LABELS[listing.condition] : "Состояние не указано"}</li>
        {listing.yearBuilt && <li>{listing.yearBuilt} г.</li>}
      </ul>

      {valuation && (
        <div className="flex flex-wrap items-center gap-1.5">
          <ConfidenceBadge level={valuation.confidenceLevel} />
          <RiskBadge level={valuation.riskLevel} />
          <span className="text-xs text-muted-foreground">
            {valuation.comparablesCount} {pluralize(valuation.comparablesCount, ["аналог", "аналога", "аналогов"])}
          </span>
        </div>
      )}

      {warnings.length > 0 && (
        <p className="text-xs text-warning">{warnings.map((code) => WARNING_LABELS[code]).join(" · ")}</p>
      )}

      <div className="mt-auto flex items-center justify-between gap-2 border-t pt-3 text-xs text-muted-foreground">
        <span>Обновлено {formatShortDate(updatedAt)}</span>
        {listing.url ? (
          <a
            href={listing.url}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="relative z-10 inline-flex items-center gap-1 hover:text-foreground"
          >
            Оригинал <ExternalLink className="size-3" aria-hidden="true" />
            <span className="sr-only">(откроется в новой вкладке)</span>
          </a>
        ) : (
          <span>{listing.source.isSynthetic ? "Тестовое объявление" : "Ссылка недоступна"}</span>
        )}
      </div>
    </article>
  );
}

function formatSigned(value: bigint | null) {
  if (value === null) return "—";
  if (value > 0n) return `+${formatKztShort(value)}`;
  if (value < 0n) return `−${formatKztShort(-value)}`;
  return formatKztShort(0);
}

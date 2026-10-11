import Link from "next/link";
import { AlertTriangle, ExternalLink } from "lucide-react";
import { CONFIDENCE_LABELS } from "@/components/labels";
import { CONDITION_LABELS, DISTRICT_LABELS } from "@/domain/listing/enums";
import { formatArea, formatKzt, formatKztShort, formatNumber, formatShortDate, pluralize } from "@/domain/format";
import { pricePerSqm, toAreaCenti } from "@/domain/money";
import type { CatalogListing } from "@/server/services/listingQueryService";
import { DiscountBadge } from "./badges";

/**
 * Карточка квартиры. Иерархия для покупателя:
 * 1) насколько дешевле рынка, 2) цена, 3) что за квартира и где, 4) можно ли доверять оценке.
 * Подробности (разница, аналоги, все предупреждения) — на странице квартиры.
 */
export function ListingCard({ listing }: { listing: CatalogListing }) {
  const valuation = listing.valuation?.status === "OK" ? listing.valuation : null;
  const discount = valuation?.discountPercent ? Number(valuation.discountPercent) : null;
  const ownPricePerSqm = pricePerSqm(listing.priceKzt, toAreaCenti(listing.totalArea.toString()));
  const updatedAt = listing.sourceUpdatedAt ?? listing.lastSeenAt;
  const risky = valuation?.riskLevel === "HIGH" || valuation?.riskLevel === "MEDIUM";

  const specs = [
    `${listing.rooms}-комн.`,
    formatArea(listing.totalArea.toString()),
    listing.floor !== null ? `${listing.floor}${listing.floorsTotal ? `/${listing.floorsTotal}` : ""} эт.` : null,
    listing.condition ? CONDITION_LABELS[listing.condition] : null,
  ].filter(Boolean);
  const place = [`${DISTRICT_LABELS[listing.district]} р-н`, listing.complexName ?? listing.microdistrict].filter(Boolean);

  return (
    <article className="relative flex min-w-0 flex-col gap-3 rounded-xl border bg-card p-4 transition-shadow focus-within:ring-2 focus-within:ring-ring/50 hover:shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <DiscountBadge percent={discount} className="text-sm" />
        {valuation?.dealScore != null && (
          <span className="tabular text-sm text-muted-foreground" title="Deal Score: скидка с учётом надёжности оценки и рисков">
            Deal Score <span className="font-semibold text-foreground">{valuation.dealScore}</span>
          </span>
        )}
      </div>

      <div className="tabular">
        <p className="text-xl font-semibold">{formatKzt(listing.priceKzt)}</p>
        <p className="text-sm text-muted-foreground">
          {valuation?.marketValue ? `рынок ≈ ${formatKztShort(valuation.marketValue)} · ` : ""}
          {formatNumber(Number(ownPricePerSqm))} ₸/м²
        </p>
      </div>

      <div className="min-w-0">
        <h3 className="font-medium">
          <Link href={`/listings/${listing.id}`} className="after:absolute after:inset-0 focus-visible:outline-none">
            {specs.join(" · ")}
          </Link>
        </h3>
        <p className="truncate text-sm text-muted-foreground">{place.join(" · ")}</p>
      </div>

      {risky && (
        <p className="flex items-center gap-1.5 text-sm text-warning">
          <AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" />
          {valuation?.riskLevel === "HIGH" ? "Высокий риск — проверьте детали" : "Есть на что обратить внимание"}
        </p>
      )}

      <div className="mt-auto flex items-center justify-between gap-2 border-t pt-3 text-xs text-muted-foreground">
        <span>
          {valuation
            ? `Уверенность ${CONFIDENCE_LABELS[valuation.confidenceLevel ?? "LOW"].toLowerCase()} · ${valuation.comparablesCount} ${pluralize(valuation.comparablesCount, ["аналог", "аналога", "аналогов"])}`
            : "Недостаточно данных для оценки"}
          {` · ${formatShortDate(updatedAt)}`}
        </span>
        {listing.url && (
          <a
            href={listing.url}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="relative z-10 inline-flex shrink-0 items-center gap-1 hover:text-foreground"
          >
            Оригинал <ExternalLink className="size-3" aria-hidden="true" />
            <span className="sr-only">(откроется в новой вкладке)</span>
          </a>
        )}
      </div>
    </article>
  );
}

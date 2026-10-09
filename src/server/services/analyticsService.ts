import type { District } from "@/domain/listing/enums";
import { db } from "@/lib/db";
import { DEFAULT_MIN_DISCOUNT } from "@/lib/validation/catalogFilters";
import { getActiveRealm, realmIsSynthetic, type DataRealm } from "./dataRealmService";

/** Минимум объявлений в районе, чтобы показывать по нему медиану. */
export const MIN_DISTRICT_SAMPLE = 10;
/** Для динамики нужны минимум 3 месяца наблюдений по 30+ точек. */
export const MIN_TREND_MONTHS = 3;
export const MIN_TREND_POINTS_PER_MONTH = 30;

export interface DistrictStats {
  district: District;
  listings: number;
  medianPricePerSqm: number | null;
  deals: number;
  medianDiscount: number | null;
}

export interface PriceBucket {
  from: number;
  to: number;
  count: number;
}

export interface TrendPoint {
  month: string;
  medianPricePerSqm: number;
  observations: number;
}

export interface AnalyticsData {
  realm: DataRealm;
  districts: DistrictStats[];
  distribution: PriceBucket[];
  dealsTotal: number;
  activeTotal: number;
  trend: TrendPoint[] | null;
  trendMonthsAvailable: number;
}

export async function getAnalytics(): Promise<AnalyticsData> {
  const realm = await getActiveRealm();
  const synthetic = realmIsSynthetic(realm);
  const [districts, pricesPerSqm, trend] = await Promise.all([
    districtStatistics(synthetic),
    activePricesPerSqm(synthetic),
    monthlyTrend(synthetic),
  ]);

  const enoughMonths = trend.filter((point) => point.observations >= MIN_TREND_POINTS_PER_MONTH);
  return {
    realm,
    districts,
    distribution: histogram(pricesPerSqm, 100_000),
    dealsTotal: districts.reduce((sum, d) => sum + d.deals, 0),
    activeTotal: pricesPerSqm.length,
    trend: enoughMonths.length >= MIN_TREND_MONTHS ? enoughMonths : null,
    trendMonthsAvailable: enoughMonths.length,
  };
}

async function districtStatistics(synthetic: boolean): Promise<DistrictStats[]> {
  const rows = await db.$queryRaw<
    { district: District; listings: bigint; median_ppsm: string | null; deals: bigint; median_discount: string | null }[]
  >`
    SELECT l.district,
           count(*) AS listings,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY l."priceKzt"::numeric / l."totalArea")::text AS median_ppsm,
           count(*) FILTER (WHERE v.status = 'OK' AND v."discountPercent" >= ${DEFAULT_MIN_DISCOUNT}) AS deals,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY v."discountPercent") FILTER (WHERE v.status = 'OK')::text AS median_discount
    FROM "Listing" l
    JOIN "DataSource" s ON s.id = l."sourceId"
    LEFT JOIN "Valuation" v ON v."listingId" = l.id
    WHERE l.status = 'ACTIVE' AND l."duplicateOfId" IS NULL AND s."isSynthetic" = ${synthetic}
    GROUP BY l.district
  `;
  const stats = rows.map((row) => {
    const listings = Number(row.listings);
    const enough = listings >= MIN_DISTRICT_SAMPLE;
    return {
      district: row.district,
      listings,
      medianPricePerSqm: enough && row.median_ppsm ? Math.round(Number(row.median_ppsm)) : null,
      deals: Number(row.deals),
      medianDiscount: enough && row.median_discount ? Number(row.median_discount) : null,
    };
  });
  // Сортируем по числу в JS: медиана приходит строкой, и сортировка строк в SQL дала бы «752 000» > «1 225 000».
  return stats.sort((a, b) => (b.medianPricePerSqm ?? -1) - (a.medianPricePerSqm ?? -1));
}

async function activePricesPerSqm(synthetic: boolean): Promise<number[]> {
  const rows = await db.$queryRaw<{ ppsm: string }[]>`
    SELECT (l."priceKzt"::numeric / l."totalArea")::text AS ppsm
    FROM "Listing" l JOIN "DataSource" s ON s.id = l."sourceId"
    WHERE l.status = 'ACTIVE' AND l."duplicateOfId" IS NULL AND s."isSynthetic" = ${synthetic}
  `;
  return rows.map((row) => Number(row.ppsm));
}

/** Медиана цены за м² по месяцам наблюдения (из истории цен — только реально наблюдавшиеся цены). */
async function monthlyTrend(synthetic: boolean): Promise<TrendPoint[]> {
  const rows = await db.$queryRaw<{ month: string; median_ppsm: string; observations: bigint }[]>`
    SELECT to_char(date_trunc('month', h."observedAt"), 'YYYY-MM') AS month,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY h."priceKzt"::numeric / l."totalArea")::text AS median_ppsm,
           count(*) AS observations
    FROM "ListingPriceHistory" h
    JOIN "Listing" l ON l.id = h."listingId"
    JOIN "DataSource" s ON s.id = l."sourceId"
    WHERE s."isSynthetic" = ${synthetic}
    GROUP BY 1 ORDER BY 1
  `;
  return rows.map((row) => ({
    month: row.month,
    medianPricePerSqm: Math.round(Number(row.median_ppsm)),
    observations: Number(row.observations),
  }));
}

export function histogram(values: number[], bucketSize: number): PriceBucket[] {
  if (values.length === 0) return [];
  const counts = new Map<number, number>();
  for (const value of values) {
    const bucket = Math.floor(value / bucketSize);
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
  }
  const buckets = [...counts.keys()];
  const min = Math.min(...buckets);
  const max = Math.max(...buckets);
  return Array.from({ length: max - min + 1 }, (_, i) => ({
    from: (min + i) * bucketSize,
    to: (min + i + 1) * bucketSize,
    count: counts.get(min + i) ?? 0,
  }));
}

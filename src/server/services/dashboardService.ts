import { db } from "@/lib/db";
import { DEFAULT_MIN_DISCOUNT } from "@/lib/validation/catalogFilters";
import { getActiveRealm, realmIsSynthetic, type DataRealm } from "./dataRealmService";
import { getWorkerState, type WorkerState } from "./heartbeatService";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface DashboardStats {
  realm: DataRealm;
  activeCount: number;
  valuedCount: number;
  dealsCount: number;
  newCount: number;
  averageDiscount: number | null;
  medianDiscount: number | null;
  lastSuccessAt: Date | null;
  worker: WorkerState;
  sources: {
    key: string;
    name: string;
    status: string;
    statusMessage: string | null;
    isSynthetic: boolean;
    lastSuccessAt: Date | null;
    lastError: string | null;
  }[];
  latestDeals: Awaited<ReturnType<typeof latestDeals>>;
}

export async function getDashboardStats(periodDays: number, now = new Date()): Promise<DashboardStats> {
  const realm = await getActiveRealm();
  const synthetic = realmIsSynthetic(realm);
  const activeWhere = { status: "ACTIVE" as const, source: { isSynthetic: synthetic } };
  const dealWhere = {
    ...activeWhere,
    valuation: { status: "OK" as const, discountPercent: { gte: DEFAULT_MIN_DISCOUNT } },
  };

  const [activeCount, valuedCount, dealsCount, newCount, discountStats, sources, worker, deals] = await Promise.all([
    db.listing.count({ where: activeWhere }),
    db.listing.count({ where: { ...activeWhere, valuation: { status: "OK" } } }),
    db.listing.count({ where: dealWhere }),
    db.listing.count({ where: { ...activeWhere, firstSeenAt: { gte: new Date(now.getTime() - periodDays * DAY_MS) } } }),
    discountStatistics(synthetic),
    db.dataSource.findMany({ orderBy: [{ isSynthetic: "asc" }, { name: "asc" }] }),
    getWorkerState(now),
    latestDeals(synthetic),
  ]);

  const lastSuccessAt = sources
    .filter((source) => source.isSynthetic === synthetic && source.lastSuccessAt)
    .map((source) => source.lastSuccessAt as Date)
    .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

  return {
    realm,
    activeCount,
    valuedCount,
    dealsCount,
    newCount,
    ...discountStats,
    lastSuccessAt,
    worker,
    sources: sources.map((source) => ({
      key: source.key,
      name: source.name,
      status: source.status,
      statusMessage: source.statusMessage,
      isSynthetic: source.isSynthetic,
      lastSuccessAt: source.lastSuccessAt,
      lastError: source.lastError,
    })),
    latestDeals: deals,
  };
}

/** Среднее и медианное отклонение от рынка среди надёжно оценённых активных объявлений. */
async function discountStatistics(synthetic: boolean) {
  const rows = await db.$queryRaw<{ average: string | null; median: string | null }[]>`
    SELECT avg(v."discountPercent")::text AS average,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY v."discountPercent")::text AS median
    FROM "Valuation" v
    JOIN "Listing" l ON l.id = v."listingId"
    JOIN "DataSource" s ON s.id = l."sourceId"
    WHERE v.status = 'OK' AND l.status = 'ACTIVE' AND s."isSynthetic" = ${synthetic}
  `;
  const toNumber = (value: string | null | undefined) => (value === null || value === undefined ? null : Number(value));
  return { averageDiscount: toNumber(rows[0]?.average), medianDiscount: toNumber(rows[0]?.median) };
}

function latestDeals(synthetic: boolean) {
  return db.listing.findMany({
    where: {
      status: "ACTIVE",
      source: { isSynthetic: synthetic },
      valuation: { status: "OK", discountPercent: { gte: DEFAULT_MIN_DISCOUNT } },
    },
    orderBy: [{ firstSeenAt: "desc" }, { id: "asc" }],
    take: 6,
    select: {
      id: true,
      priceKzt: true,
      totalArea: true,
      rooms: true,
      district: true,
      complexName: true,
      firstSeenAt: true,
      valuation: { select: { discountPercent: true, dealScore: true, confidenceLevel: true, riskLevel: true, marketValue: true } },
    },
  });
}

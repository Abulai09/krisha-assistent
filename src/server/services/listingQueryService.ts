import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import {
  CATALOG_PAGE_SIZE,
  effectiveMinDiscount,
  type CatalogFilters,
} from "@/lib/validation/catalogFilters";
import { getActiveRealm, realmIsSynthetic, type DataRealm } from "./dataRealmService";

const MILLION = 1_000_000;
const DAY_MS = 24 * 60 * 60 * 1000;

export const catalogSelect = {
  id: true,
  url: true,
  priceKzt: true,
  totalArea: true,
  rooms: true,
  district: true,
  microdistrict: true,
  complexName: true,
  floor: true,
  floorsTotal: true,
  condition: true,
  yearBuilt: true,
  publishedAt: true,
  sourceUpdatedAt: true,
  lastSeenAt: true,
  source: { select: { isSynthetic: true } },
  valuation: {
    select: {
      status: true,
      marketValue: true,
      pricePerSqm: true,
      discountPercent: true,
      potentialDifference: true,
      dealScore: true,
      confidence: true,
      confidenceLevel: true,
      comparablesCount: true,
      riskLevel: true,
      warnings: true,
    },
  },
} satisfies Prisma.ListingSelect;

export type CatalogListing = Prisma.ListingGetPayload<{ select: typeof catalogSelect }>;

export interface CatalogPage {
  realm: DataRealm;
  items: CatalogListing[];
  total: number;
  page: number;
  pageCount: number;
}

/** Строит условие выборки каталога. Все фильтры применяются в БД, а не в браузере. */
export function buildCatalogWhere(filters: CatalogFilters, realm: DataRealm, now: Date): Prisma.ListingWhereInput {
  const and: Prisma.ListingWhereInput[] = [{ status: "ACTIVE" }, { source: { isSynthetic: realmIsSynthetic(realm) } }];

  if (filters.district) and.push({ district: filters.district });
  if (filters.rooms) and.push(filters.rooms === "5" ? { rooms: { gte: 5 } } : { rooms: Number(filters.rooms) });
  if (filters.priceMin !== undefined) and.push({ priceKzt: { gte: BigInt(Math.round(filters.priceMin * MILLION)) } });
  if (filters.priceMax !== undefined) and.push({ priceKzt: { lte: BigInt(Math.round(filters.priceMax * MILLION)) } });
  if (filters.areaMin !== undefined) and.push({ totalArea: { gte: filters.areaMin } });
  if (filters.areaMax !== undefined) and.push({ totalArea: { lte: filters.areaMax } });
  if (filters.condition) and.push({ condition: filters.condition });
  if (filters.complex) and.push({ complexKey: filters.complex });
  if (filters.yearMin !== undefined) and.push({ yearBuilt: { gte: filters.yearMin } });
  if (filters.yearMax !== undefined) and.push({ yearBuilt: { lte: filters.yearMax } });
  if (filters.published) {
    and.push({ publishedAt: { gte: new Date(now.getTime() - Number(filters.published) * DAY_MS) } });
  }

  // Фильтр по этажу: неизвестный этаж не проходит фильтр — мы не можем утверждать, что он подходит.
  if (filters.floor === "not_first" || filters.floor === "middle") and.push({ floor: { gt: 1 } });
  if (filters.floor === "not_last" || filters.floor === "middle") {
    and.push({ floor: { not: null, lt: db.listing.fields.floorsTotal } });
  }

  const valuation: Prisma.ValuationWhereInput[] = [];
  const minDiscount = effectiveMinDiscount(filters);
  if (minDiscount !== null) valuation.push({ discountPercent: { gte: minDiscount } });
  if (filters.scoreMin !== undefined) valuation.push({ dealScore: { gte: filters.scoreMin } });
  if (filters.confidence === "MEDIUM") valuation.push({ confidenceLevel: { in: ["MEDIUM", "HIGH"] } });
  if (filters.confidence === "HIGH") valuation.push({ confidenceLevel: "HIGH" });
  if (filters.risk === "LOW") valuation.push({ riskLevel: "LOW" });
  if (filters.risk === "MEDIUM") valuation.push({ riskLevel: { in: ["LOW", "MEDIUM"] } });
  // Объявления без надёжной оценки в рейтинг не попадают — только в режим «все объявления».
  if (valuation.length > 0) and.push({ valuation: { status: "OK", AND: valuation } });

  return { AND: and };
}

function catalogOrder(mode: CatalogFilters["mode"]): Prisma.ListingOrderByWithRelationInput[] {
  const byDiscount = { valuation: { discountPercent: { sort: "desc", nulls: "last" } } } as const;
  const byScore = { valuation: { dealScore: { sort: "desc", nulls: "last" } } } as const;
  const stable = { id: "asc" } as const;
  return mode === "discount" ? [byDiscount, byScore, stable] : [byScore, byDiscount, stable];
}

export async function listCatalog(filters: CatalogFilters, now = new Date()): Promise<CatalogPage> {
  const realm = await getActiveRealm();
  if (realm === "empty") return { realm, items: [], total: 0, page: 1, pageCount: 0 };

  const where = buildCatalogWhere(filters, realm, now);
  const total = await db.listing.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / CATALOG_PAGE_SIZE));
  const page = Math.min(filters.page, pageCount);
  const items = await db.listing.findMany({
    where,
    select: catalogSelect,
    orderBy: catalogOrder(filters.mode),
    skip: (page - 1) * CATALOG_PAGE_SIZE,
    take: CATALOG_PAGE_SIZE,
  });
  return { realm, items, total, page, pageCount };
}

export interface ComplexOption {
  key: string;
  name: string;
  count: number;
}

/** Список ЖК для фильтра (только с активными объявлениями текущего набора данных). */
export async function listComplexOptions(realm: DataRealm): Promise<ComplexOption[]> {
  if (realm === "empty") return [];
  const rows = await db.listing.groupBy({
    by: ["complexKey", "complexName"],
    where: { status: "ACTIVE", complexKey: { not: null }, source: { isSynthetic: realmIsSynthetic(realm) } },
    _count: { _all: true },
    orderBy: { complexName: "asc" },
  });
  const byKey = new Map<string, ComplexOption>();
  for (const row of rows) {
    if (!row.complexKey || !row.complexName) continue;
    const existing = byKey.get(row.complexKey);
    if (existing) existing.count += row._count._all;
    else byKey.set(row.complexKey, { key: row.complexKey, name: row.complexName, count: row._count._all });
  }
  return [...byKey.values()];
}

export async function getListingDetail(id: string) {
  const listing = await db.listing.findUnique({
    where: { id },
    include: {
      source: { select: { name: true, key: true, isSynthetic: true } },
      priceHistory: { orderBy: { observedAt: "asc" }, select: { priceKzt: true, observedAt: true } },
      duplicateOf: { select: { id: true } },
      duplicates: { where: { status: "ACTIVE" }, select: { id: true } },
      valuation: {
        include: {
          comparables: {
            orderBy: [{ excludedAsOutlier: "asc" }, { similarity: "desc" }],
            include: {
              comparable: {
                select: {
                  id: true,
                  url: true,
                  priceKzt: true,
                  totalArea: true,
                  rooms: true,
                  complexName: true,
                  microdistrict: true,
                  floor: true,
                  floorsTotal: true,
                  yearBuilt: true,
                  condition: true,
                  status: true,
                },
              },
            },
          },
        },
      },
    },
  });
  return listing;
}

export type ListingDetail = NonNullable<Awaited<ReturnType<typeof getListingDetail>>>;

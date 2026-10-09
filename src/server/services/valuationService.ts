import { basisPointsToPercentString, toAreaCenti } from "@/domain/money";
import type { ValuationListing, ValuationResult } from "@/domain/valuation/types";
import { valuateListing } from "@/domain/valuation/valuate";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { mapWithConcurrency } from "@/lib/utils/async";

const SAVE_CONCURRENCY = 4;

/** Загружает активные объявления в форме, нужной домену оценки. */
export async function loadValuationListings(): Promise<ValuationListing[]> {
  const rows = await db.listing.findMany({
    where: { status: "ACTIVE" },
    select: {
      id: true,
      priceKzt: true,
      totalArea: true,
      livingArea: true,
      kitchenArea: true,
      rooms: true,
      district: true,
      microdistrict: true,
      complexKey: true,
      buildingType: true,
      yearBuilt: true,
      floor: true,
      floorsTotal: true,
      condition: true,
      publishedAt: true,
      sourceUpdatedAt: true,
      lastSeenAt: true,
      fingerprint: true,
      duplicateOfId: true,
      source: { select: { isSynthetic: true } },
      _count: { select: { priceHistory: true, duplicates: { where: { status: "ACTIVE" } } } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    isSynthetic: row.source.isSynthetic,
    isActive: true,
    priceKzt: row.priceKzt,
    areaCenti: toAreaCenti(row.totalArea.toString()),
    livingAreaCenti: row.livingArea ? toAreaCenti(row.livingArea.toString()) : null,
    kitchenAreaCenti: row.kitchenArea ? toAreaCenti(row.kitchenArea.toString()) : null,
    rooms: row.rooms,
    district: row.district,
    microdistrict: row.microdistrict,
    complexKey: row.complexKey,
    buildingType: row.buildingType,
    yearBuilt: row.yearBuilt,
    floor: row.floor,
    floorsTotal: row.floorsTotal,
    condition: row.condition,
    publishedAt: row.publishedAt,
    sourceUpdatedAt: row.sourceUpdatedAt,
    lastSeenAt: row.lastSeenAt,
    fingerprint: row.fingerprint,
    duplicateOfId: row.duplicateOfId,
    hasDuplicates: row._count.duplicates > 0,
    priceChangeCount: Math.max(row._count.priceHistory - 1, 0),
  }));
}

/** Пересчитывает оценки всех активных объявлений. Аналоги ищутся только в том же районе и наборе данных. */
export async function revalueAllListings(now: Date): Promise<number> {
  const listings = await loadValuationListings();

  const pools = new Map<string, ValuationListing[]>();
  for (const listing of listings) {
    const key = `${listing.isSynthetic}|${listing.district}`;
    pools.set(key, [...(pools.get(key) ?? []), listing]);
  }

  const results = listings.map((listing) => ({
    listingId: listing.id,
    result: valuateListing(listing, pools.get(`${listing.isSynthetic}|${listing.district}`) ?? [], now),
  }));

  await mapWithConcurrency(results, SAVE_CONCURRENCY, ({ listingId, result }) => saveValuation(listingId, result, now));
  return results.length;
}

async function saveValuation(listingId: string, result: ValuationResult, now: Date): Promise<void> {
  const data = {
    status: result.status,
    method: result.method,
    valuedAt: now,
    listingPriceKzt: result.listingPriceKzt,
    pricePerSqm: result.pricePerSqm,
    estimatedPricePerSqm: result.estimatedPricePerSqm,
    marketValue: result.marketValue,
    marketValueLow: result.marketValueLow,
    marketValueHigh: result.marketValueHigh,
    potentialDifference: result.potentialDifference,
    discountPercent: result.discountBasisPoints === null ? null : basisPointsToPercentString(result.discountBasisPoints),
    comparablesCount: result.explanation.comparablesUsed,
    comparableScope: result.comparableScope,
    confidence: result.confidence,
    confidenceLevel: result.confidenceLevel,
    dealScore: result.dealScore,
    riskLevel: result.riskLevel,
    warnings: result.warnings,
    explanation: result.explanation as unknown as Prisma.InputJsonValue,
  };

  await db.$transaction(async (tx) => {
    const valuation = await tx.valuation.upsert({
      where: { listingId },
      create: { listingId, ...data },
      update: data,
      select: { id: true },
    });
    await tx.valuationComparable.deleteMany({ where: { valuationId: valuation.id } });
    if (result.comparables.length > 0) {
      await tx.valuationComparable.createMany({
        data: result.comparables.map((c) => ({
          valuationId: valuation.id,
          comparableListingId: c.listingId,
          pricePerSqm: c.pricePerSqm,
          similarity: c.similarity.toFixed(4),
          excludedAsOutlier: c.excludedAsOutlier,
        })),
      });
    }
  });
}

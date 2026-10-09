import { toAreaCenti } from "@/domain/money";
import type { ValuationListing } from "@/domain/valuation/types";

export const NOW = new Date("2026-10-01T12:00:00Z");

let counter = 0;

/** Квартира с разумными значениями по умолчанию; переопределяйте только то, что важно для теста. */
export function makeListing(overrides: Partial<ValuationListing> & { area?: number } = {}): ValuationListing {
  counter += 1;
  const { area, ...rest } = overrides;
  return {
    id: `L${String(counter).padStart(4, "0")}`,
    isSynthetic: true,
    isActive: true,
    priceKzt: 50_000_000n,
    areaCenti: toAreaCenti(area ?? 50),
    livingAreaCenti: null,
    kitchenAreaCenti: null,
    rooms: 2,
    district: "BOSTANDYK",
    microdistrict: "Орбита-1",
    complexKey: "тестовый",
    buildingType: "MONOLITH",
    yearBuilt: 2015,
    floor: 5,
    floorsTotal: 12,
    condition: "GOOD",
    publishedAt: new Date("2026-09-25T00:00:00Z"),
    sourceUpdatedAt: new Date("2026-09-28T00:00:00Z"),
    lastSeenAt: new Date("2026-09-30T00:00:00Z"),
    fingerprint: `fp:${counter}`,
    duplicateOfId: null,
    hasDuplicates: false,
    priceChangeCount: 0,
    ...rest,
  };
}

/** Аналоги с заданными ценами за м² (площадь 50 м²). */
export function comparablesWithPricePerSqm(prices: number[], overrides: Partial<ValuationListing> = {}) {
  return prices.map((ppsm) => makeListing({ priceKzt: BigInt(ppsm * 50), ...overrides }));
}

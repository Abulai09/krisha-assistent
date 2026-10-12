import { db } from "@/lib/db";
import type { ListingSource, SourceStatus } from "@/server/sources/types";

export async function resetDatabase() {
  await db.$executeRawUnsafe(
    'TRUNCATE "ValuationComparable", "Valuation", "ListingPriceHistory", "Listing", "CollectionRun", "DataSource", "WorkerHeartbeat", "User" CASCADE',
  );
}

/** Управляемый источник для тестов: отдаёт заданные записи или ошибки. */
export class FakeSource implements ListingSource {
  readonly name = "Тестовый источник";
  readonly kind = "API" as const;
  readonly isSynthetic = false;
  records: unknown[] = [];
  failures: Error[] = [];
  fetchCalls = 0;
  status: SourceStatus = { availability: "CONNECTED", message: "ok" };

  constructor(
    readonly key = "fake",
    readonly providesFullSnapshot = true,
  ) {}

  async checkStatus() {
    return this.status;
  }

  async fetchListings() {
    this.fetchCalls++;
    const failure = this.failures.shift();
    if (failure) throw failure;
    return this.records;
  }
}

/** Объявление с одинаковыми параметрами квартиры и заданной ценой. */
export function rawListing(externalId: string, priceKzt: number, overrides: Record<string, unknown> = {}) {
  return {
    externalId,
    url: `https://example.com/${externalId}`,
    priceKzt,
    totalArea: 50,
    rooms: 2,
    district: "Бостандыкский",
    microdistrict: "Орбита-1",
    complexName: "ЖК Интеграционный",
    buildingType: "монолитный",
    yearBuilt: 2015,
    floor: Number(externalId.replace(/\D/g, "")) % 9 + 2,
    floorsTotal: 12,
    condition: "хорошее",
    updatedAt: "2026-09-28",
    ...overrides,
  };
}

/** Рынок из N аналогов около 1 000 000 ₸/м² (50 000 000 ₸ за 50 м²). */
export function marketListings(count: number) {
  const offsets = [-40_000, -20_000, 0, 20_000, 40_000, -10_000, 10_000, 30_000, -30_000, 0];
  return Array.from({ length: count }, (_, i) => rawListing(`M${i + 1}`, (1_000_000 + offsets[i % offsets.length]) * 50));
}

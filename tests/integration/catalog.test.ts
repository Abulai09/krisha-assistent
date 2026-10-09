import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { parseCatalogFilters } from "@/lib/validation/catalogFilters";
import { runCollection } from "@/server/services/collectionService";
import { getDashboardStats } from "@/server/services/dashboardService";
import { getActiveRealm } from "@/server/services/dataRealmService";
import { listCatalog } from "@/server/services/listingQueryService";
import { FakeSource, marketListings, rawListing, resetDatabase } from "./helpers";

const NOW = new Date("2026-10-01T10:00:00Z");

/** Реальный набор данных: рынок ~1 млн ₸/м² в ЖК и несколько квартир с известными отличиями. */
async function seedRealData() {
  const source = new FakeSource("real-test");
  source.records = [
    ...marketListings(10),
    rawListing("DEAL10", 45_000_000, { floor: 5 }),
    rawListing("DEAL20", 40_000_000, { floor: 1, publishedAt: "2026-09-29" }),
    rawListing("TOPFLOOR", 46_000_000, { floor: 12 }),
    rawListing("EXPENSIVE", 60_000_000, { floor: 6 }),
    rawListing("MEDEU", 80_000_000, { district: "Медеуский", complexName: "ЖК Другой", floor: 3 }),
  ];
  const summary = await runCollection({ source, trigger: "CLI", now: NOW, retryBaseDelayMs: 0 });
  expect(summary.status).toBe("SUCCESS");
}

async function ids(params: Record<string, string>) {
  const page = await listCatalog(parseCatalogFilters(params), NOW);
  return page.items.map((item) => item.id).length === 0 ? [] : await externalIds(page.items.map((item) => item.id));
}

async function externalIds(listingIds: string[]) {
  const rows = await db.listing.findMany({ where: { id: { in: listingIds } }, select: { id: true, externalId: true } });
  const byId = new Map(rows.map((row) => [row.id, row.externalId]));
  return listingIds.map((id) => byId.get(id));
}

afterAll(() => db.$disconnect());

describe("пустая база", () => {
  beforeAll(resetDatabase);

  it("каталог и обзор не выдумывают статистику", async () => {
    expect(await getActiveRealm()).toBe("empty");
    const catalog = await listCatalog(parseCatalogFilters({}), NOW);
    expect(catalog).toMatchObject({ realm: "empty", total: 0, items: [] });
    const stats = await getDashboardStats(7, NOW);
    expect(stats).toMatchObject({ activeCount: 0, dealsCount: 0, averageDiscount: null, medianDiscount: null });
  });
});

describe("фильтры каталога работают в базе", () => {
  beforeAll(async () => {
    await resetDatabase();
    await seedRealData();
  });

  it("по умолчанию — только скидка от 8%, отсортировано по Deal Score", async () => {
    const result = await ids({});
    expect(result).toEqual(expect.arrayContaining(["DEAL10", "DEAL20", "TOPFLOOR"]));
    expect(result).not.toContain("EXPENSIVE");
    const page = await listCatalog(parseCatalogFilters({}), NOW);
    const scores = page.items.map((item) => item.valuation?.dealScore ?? -1);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });

  it("режим «скидка» сортирует по проценту скидки", async () => {
    const page = await listCatalog(parseCatalogFilters({ mode: "discount" }), NOW);
    const discounts = page.items.map((item) => Number(item.valuation?.discountPercent));
    expect([...discounts].sort((a, b) => b - a)).toEqual(discounts);
    expect((await externalIds(page.items.map((i) => i.id)))[0]).toBe("DEAL20");
  });

  it("discount=any показывает и объявления без скидки", async () => {
    expect(await ids({ discount: "any" })).toEqual(expect.arrayContaining(["EXPENSIVE", "MEDEU"]));
  });

  it("порог скидки настраивается", async () => {
    const result = await ids({ discount: "15" });
    expect(result).toContain("DEAL20");
    expect(result).not.toContain("DEAL10");
  });

  it("район, цена, площадь, комнаты", async () => {
    expect(await ids({ discount: "any", district: "MEDEU" })).toEqual(["MEDEU"]);
    expect(await ids({ discount: "any", priceMax: "42" })).toEqual(["DEAL20"]);
    expect(await ids({ discount: "any", rooms: "3" })).toEqual([]);
    expect((await ids({ discount: "any", areaMin: "49", areaMax: "51" })).length).toBeGreaterThan(10);
  });

  it("этаж: не первый / не последний (сравнение двух колонок в БД)", async () => {
    expect(await ids({ discount: "any", floor: "not_first" })).not.toContain("DEAL20");
    expect(await ids({ discount: "any", floor: "not_last" })).not.toContain("TOPFLOOR");
    const middle = await ids({ discount: "any", floor: "middle" });
    expect(middle).not.toContain("DEAL20");
    expect(middle).not.toContain("TOPFLOOR");
    expect(middle).toContain("DEAL10");
  });

  it("ЖК, год, состояние, дата публикации", async () => {
    expect(await ids({ discount: "any", complex: "другой" })).toEqual(["MEDEU"]);
    expect(await ids({ discount: "any", yearMin: "2016" })).toEqual([]);
    expect(await ids({ discount: "any", condition: "EXCELLENT" })).toEqual([]);
    expect(await ids({ discount: "any", published: "7" })).toEqual(["DEAL20"]);
  });

  it("Deal Score, уверенность и риск фильтруют только надёжно оценённые", async () => {
    const page = await listCatalog(parseCatalogFilters({ discount: "any", scoreMin: "1", confidence: "MEDIUM", risk: "MEDIUM" }), NOW);
    expect(page.items.length).toBeGreaterThan(0);
    for (const item of page.items) {
      expect(item.valuation?.status).toBe("OK");
      expect(item.valuation?.dealScore).toBeGreaterThanOrEqual(1);
      expect(["MEDIUM", "HIGH"]).toContain(item.valuation?.confidenceLevel);
      expect(["LOW", "MEDIUM"]).toContain(item.valuation?.riskLevel);
    }
  });

  it("некорректные параметры URL игнорируются, а не ломают запрос", async () => {
    const filters = parseCatalogFilters({ district: "MARS", priceMin: "abc", page: "-5", mode: "hack" });
    expect(filters).toMatchObject({ district: undefined, priceMin: undefined, page: 1, mode: "deal" });
    await expect(listCatalog(filters, NOW)).resolves.toBeDefined();
  });

  it("реальные данные вытесняют синтетику, наборы не смешиваются", async () => {
    const synthetic = new FakeSource("synthetic-test");
    Object.assign(synthetic, { isSynthetic: true });
    synthetic.records = [rawListing("SYN1", 30_000_000)];
    await runCollection({ source: synthetic, trigger: "CLI", now: NOW, retryBaseDelayMs: 0 });

    expect(await getActiveRealm()).toBe("real");
    expect(await ids({ discount: "any" })).not.toContain("SYN1");
    const synValuation = await db.valuation.findFirstOrThrow({ where: { listing: { externalId: "SYN1" } } });
    expect(synValuation.status).toBe("INSUFFICIENT_DATA");
  });
});

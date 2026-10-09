import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { failInterruptedRuns, runCollection } from "@/server/services/collectionService";
import { enqueueManualRun, nextQueuedRun, RunQueueError } from "@/server/services/runQueueService";
import { KrishaApiSource } from "@/server/sources/krishaApiSource";
import { SourceNotConnectedError } from "@/server/sources/types";
import { FakeSource, marketListings, rawListing, resetDatabase } from "./helpers";

const DAY1 = new Date("2026-10-01T10:00:00Z");
const DAY2 = new Date("2026-10-02T10:00:00Z");

beforeEach(resetDatabase);
afterAll(() => db.$disconnect());

function run(source: FakeSource, now = DAY1) {
  return runCollection({ source, trigger: "CLI", now, retryBaseDelayMs: 0 });
}

describe("конвейер обновления", () => {
  it("пустая база: первый запуск сохраняет объявления, историю цен и оценки", async () => {
    expect(await db.listing.count()).toBe(0);
    const source = new FakeSource();
    source.records = [...marketListings(10), rawListing("DEAL1", 45_000_000)];

    const summary = await run(source);

    expect(summary).toMatchObject({ status: "SUCCESS", fetched: 11, created: 11, invalid: 0 });
    expect(await db.listing.count()).toBe(11);
    expect(await db.listingPriceHistory.count()).toBe(11);
    const deal = await db.listing.findFirstOrThrow({ where: { externalId: "DEAL1" }, include: { valuation: true } });
    expect(deal.valuation?.status).toBe("OK");
    expect(deal.valuation?.marketValue).toBe(50_000_000n);
    expect(deal.valuation?.discountPercent?.toString()).toBe("10");
    expect(deal.valuation?.potentialDifference).toBe(5_000_000n);
    expect(await db.valuationComparable.count({ where: { valuationId: deal.valuation!.id } })).toBeGreaterThanOrEqual(5);
  });

  it("повторное поступление того же объявления не создаёт дубликатов", async () => {
    const source = new FakeSource();
    source.records = marketListings(10);
    await run(source, DAY1);
    const second = await run(source, DAY2);

    expect(second).toMatchObject({ created: 0, updated: 0, unchanged: 10 });
    expect(await db.listing.count()).toBe(10);
    expect(await db.listingPriceHistory.count()).toBe(10);
    expect(await db.collectionRun.count()).toBe(2);
  });

  it("изменение цены обновляет объявление и записывает историю", async () => {
    const source = new FakeSource();
    source.records = [...marketListings(10), rawListing("X1", 52_000_000)];
    await run(source, DAY1);

    source.records = [...marketListings(10), rawListing("X1", 47_000_000)];
    const summary = await run(source, DAY2);

    expect(summary.updated).toBe(1);
    const listing = await db.listing.findFirstOrThrow({
      where: { externalId: "X1" },
      include: { priceHistory: { orderBy: { observedAt: "asc" } }, valuation: true },
    });
    expect(listing.priceKzt).toBe(47_000_000n);
    expect(listing.priceHistory.map((h) => h.priceKzt)).toEqual([52_000_000n, 47_000_000n]);
    expect(listing.valuation?.warnings).toContain("PRICE_CHANGED");
  });

  it("исчезнувшее из полного среза объявление становится неактивным", async () => {
    const source = new FakeSource();
    source.records = [...marketListings(10), rawListing("GONE", 50_000_000)];
    await run(source, DAY1);
    source.records = marketListings(10);
    const summary = await run(source, DAY2);

    expect(summary.deactivated).toBe(1);
    const gone = await db.listing.findFirstOrThrow({ where: { externalId: "GONE" } });
    expect(gone.status).toBe("INACTIVE");
  });

  it("частичный источник (файл) ничего не деактивирует", async () => {
    const source = new FakeSource("partial", false);
    source.records = marketListings(10);
    await run(source, DAY1);
    source.records = marketListings(3);
    const summary = await run(source, DAY2);
    expect(summary.deactivated).toBe(0);
    expect(await db.listing.count({ where: { status: "ACTIVE" } })).toBe(10);
  });

  it("некорректные объявления отклоняются, остальные сохраняются (PARTIAL)", async () => {
    const source = new FakeSource();
    source.records = [...marketListings(5), { externalId: "BAD1", priceKzt: "дорого" }, rawListing("BAD2", 50_000_000, { district: "Марс" })];
    const summary = await run(source);

    expect(summary).toMatchObject({ status: "PARTIAL", created: 5, invalid: 2 });
    const runRecord = await db.collectionRun.findFirstOrThrow();
    expect(runRecord.invalidCount).toBe(2);
    expect(JSON.stringify(runRecord.errorSamples)).toContain("BAD1");
  });

  it("недостаточно аналогов — оценка не выдумывается", async () => {
    const source = new FakeSource();
    source.records = marketListings(3);
    await run(source);
    const valuations = await db.valuation.findMany();
    expect(valuations.every((v) => v.status === "INSUFFICIENT_DATA" && v.marketValue === null)).toBe(true);
  });

  it("временная ошибка источника — повтор и успешное завершение", async () => {
    const source = new FakeSource();
    source.records = marketListings(5);
    source.failures = [new Error("ECONNRESET")];
    const summary = await run(source);
    expect(summary.status).toBe("SUCCESS");
    expect(source.fetchCalls).toBe(2);
  });

  it("постоянная ошибка источника — запуск FAILED, ошибка сохранена, данные не тронуты", async () => {
    const source = new FakeSource();
    source.records = marketListings(5);
    await run(source, DAY1);

    source.failures = [new Error("503"), new Error("503"), new Error("503")];
    const summary = await run(source, DAY2);

    expect(summary.status).toBe("FAILED");
    expect(source.fetchCalls).toBe(4);
    const dataSource = await db.dataSource.findUniqueOrThrow({ where: { key: "fake" } });
    expect(dataSource.status).toBe("ERROR");
    expect(dataSource.lastError).toBe("503");
    expect(await db.listing.count({ where: { status: "ACTIVE" } })).toBe(5);
  });

  it("пустой ответ источника с полным срезом не деактивирует всё подряд", async () => {
    const source = new FakeSource();
    source.records = marketListings(5);
    await run(source, DAY1);
    source.records = [];
    const summary = await run(source, DAY2);
    expect(summary.status).toBe("FAILED");
    expect(await db.listing.count({ where: { status: "ACTIVE" } })).toBe(5);
  });

  it("неподключённый источник Krisha.kz честно получает статус NOT_CONNECTED без повторов", async () => {
    const summary = await runCollection({ source: new KrishaApiSource(), trigger: "CLI", retryBaseDelayMs: 0 });
    expect(summary.status).toBe("FAILED");
    const dataSource = await db.dataSource.findUniqueOrThrow({ where: { key: "krisha-api" } });
    expect(dataSource.status).toBe("NOT_CONNECTED");
    expect(dataSource.statusMessage).toContain("письменного разрешения");
    await expect(new KrishaApiSource().fetchListings()).rejects.toBeInstanceOf(SourceNotConnectedError);
  });

  it("параллельный запуск блокируется, повторный запуск после завершения работает", async () => {
    const source = new FakeSource();
    source.records = marketListings(10);
    const [first, second] = await Promise.all([run(source, DAY1), run(source, DAY1)]);
    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual(["LOCKED", "SUCCESS"]);
    expect(await db.listing.count()).toBe(10);

    const third = await run(source, DAY2);
    expect(third.status).toBe("SUCCESS");
  });

  it("дубликаты одной квартиры связываются с оригиналом", async () => {
    const source = new FakeSource();
    source.records = [
      ...marketListings(6),
      rawListing("ORIG", 50_000_000, { floor: 11 }),
      rawListing("COPY", 50_500_000, { floor: 11 }),
    ];
    await run(source);
    const copy = await db.listing.findFirstOrThrow({ where: { externalId: "COPY" }, include: { valuation: true } });
    const original = await db.listing.findFirstOrThrow({ where: { externalId: "ORIG" } });
    expect([copy.duplicateOfId, original.duplicateOfId]).toContain(null);
    expect(copy.duplicateOfId ?? original.duplicateOfId).not.toBeNull();
    expect(copy.valuation?.warnings).toContain("POSSIBLE_DUPLICATE");
  });
});

describe("перезапуск после сбоя", () => {
  it("зависшие запуски после аварийной остановки помечаются как прерванные", async () => {
    const source = new FakeSource();
    source.records = marketListings(5);
    await run(source);
    const dataSource = await db.dataSource.findUniqueOrThrow({ where: { key: "fake" } });
    await db.collectionRun.create({
      data: { id: "stuck", sourceId: dataSource.id, trigger: "SCHEDULED", status: "RUNNING", startedAt: DAY1 },
    });

    expect(await failInterruptedRuns()).toBe(1);
    const stuck = await db.collectionRun.findUniqueOrThrow({ where: { id: "stuck" } });
    expect(stuck.status).toBe("FAILED");
    expect(stuck.errorMessage).toContain("Прервано");

    // После восстановления обычный запуск работает.
    expect((await run(source, DAY2)).status).toBe("SUCCESS");
  });
});

describe("очередь ручных запусков", () => {
  it("ставит запуск в очередь и не даёт запускать слишком часто", async () => {
    const queued = await enqueueManualRun("synthetic", DAY1);
    expect(queued.status).toBe("QUEUED");
    await expect(enqueueManualRun("synthetic", DAY1)).rejects.toBeInstanceOf(RunQueueError);

    const next = await nextQueuedRun();
    expect(next?.runId).toBe(queued.id);
    await db.collectionRun.update({ where: { id: queued.id }, data: { status: "SUCCESS" } });

    const soon = new Date(DAY1.getTime() + 60_000);
    await expect(enqueueManualRun("synthetic", soon)).rejects.toThrow(/не чаще/);
    const later = new Date(DAY1.getTime() + 6 * 60_000);
    await expect(enqueueManualRun("synthetic", later)).resolves.toMatchObject({ status: "QUEUED" });
  });

  it("отклоняет неизвестный источник", async () => {
    await expect(enqueueManualRun("unknown")).rejects.toThrow("Неизвестный источник");
  });
});

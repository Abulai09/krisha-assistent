import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { LOCK_KEYS, tryAcquireLock } from "@/lib/advisoryLock";
import { db } from "@/lib/db";
import { runCollection } from "@/server/services/collectionService";
import { pruneIfDue, pruneStaleData } from "@/server/services/retentionService";
import { FakeSource, marketListings, resetDatabase } from "./helpers";

const DAY = 24 * 3_600_000;
const NOW = new Date("2026-10-12T12:00:00Z");
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY);

beforeEach(resetDatabase);
afterAll(() => db.$disconnect());

/** Рынок из 10 объявлений с оценками и историей цен; объявления M1 и M2 сняты с продажи — давно и недавно. */
async function marketWithInactive() {
  const source = new FakeSource();
  source.records = marketListings(10);
  await runCollection({ source, trigger: "CLI", now: daysAgo(200), retryBaseDelayMs: 0 });
  await db.listing.updateMany({ where: { externalId: "M1" }, data: { status: "INACTIVE", deactivatedAt: daysAgo(91) } });
  await db.listing.updateMany({ where: { externalId: "M2" }, data: { status: "INACTIVE", deactivatedAt: daysAgo(10) } });
  return (await db.listing.findFirstOrThrow({ where: { externalId: "M1" } })).id;
}

describe("автоочистка", () => {
  it("удаляет давно снятое объявление вместе с оценкой и историей цен, остальные не трогает", async () => {
    const oldId = await marketWithInactive();

    const summary = await pruneStaleData(NOW);

    expect(summary?.listings).toBe(1);
    expect(await db.listing.findUnique({ where: { id: oldId } })).toBeNull();
    expect(await db.valuation.count({ where: { listingId: oldId } })).toBe(0);
    expect(await db.listingPriceHistory.count({ where: { listingId: oldId } })).toBe(0);
    expect(await db.valuationComparable.count({ where: { comparableListingId: oldId } })).toBe(0);
    expect(await db.listing.count({ where: { status: "ACTIVE" } })).toBe(8);
    expect(await db.listing.count({ where: { externalId: "M2" } })).toBe(1);
  });

  it("удаляет старые журналы и заявки, но не идущие запуски, одобренных пользователей и администратора", async () => {
    const source = await db.dataSource.create({ data: { key: "fake", name: "Тест", kind: "API", isSynthetic: false } });
    await db.collectionRun.createMany({
      data: [
        { sourceId: source.id, trigger: "SCHEDULED", status: "SUCCESS", requestedAt: daysAgo(100), finishedAt: daysAgo(100) },
        { sourceId: source.id, trigger: "SCHEDULED", status: "SUCCESS", requestedAt: daysAgo(5), finishedAt: daysAgo(5) },
        { sourceId: source.id, trigger: "MANUAL", status: "QUEUED", requestedAt: daysAgo(100) },
      ],
    });
    await db.user.createMany({
      data: [
        { login: "old-pending", name: "А", status: "PENDING", createdAt: daysAgo(40) },
        { login: "new-pending", name: "Б", status: "PENDING", createdAt: daysAgo(5) },
        { login: "old-approved", name: "В", status: "APPROVED", createdAt: daysAgo(400) },
        { login: "boss", name: "Г", status: "PENDING", role: "ADMIN", createdAt: daysAgo(400) },
      ],
    });
    await db.auditLog.createMany({
      data: [
        { actorLogin: "boss", action: "ADMIN_LOGIN", at: daysAgo(400) },
        { actorLogin: "boss", action: "ADMIN_LOGIN", at: daysAgo(300) },
      ],
    });
    await db.loginFailure.createMany({ data: [{ ip: "1.1.1.1", at: daysAgo(2) }, { ip: "1.1.1.1", at: NOW }] });

    const summary = await pruneStaleData(NOW);

    expect(summary).toMatchObject({ runs: 1, auditLogs: 1, pendingUsers: 1, loginFailures: 1 });
    expect((await db.collectionRun.findMany()).map((run) => run.status).sort()).toEqual(["QUEUED", "SUCCESS"]);
    expect((await db.user.findMany({ orderBy: { login: "asc" } })).map((user) => user.login)).toEqual(["boss", "new-pending", "old-approved"]);
  });

  it("записывает итог в журнал и повторно запускается не раньше чем через сутки", async () => {
    expect(await pruneIfDue(NOW)).not.toBeNull();
    const entry = await db.auditLog.findFirstOrThrow({ where: { action: "DATA_PRUNED" } });
    expect(entry.actorLogin).toBe("system");
    expect(entry.target).toContain("объявлений 0");

    expect(await pruneIfDue(new Date(NOW.getTime() + DAY / 2))).toBeNull();
    expect(await pruneIfDue(new Date(NOW.getTime() + DAY))).not.toBeNull();
  });

  it("пока идёт обновление, чистка откладывается", async () => {
    const lock = await tryAcquireLock(LOCK_KEYS.collection);
    try {
      expect(await pruneStaleData(NOW)).toBeNull();
    } finally {
      await lock?.release();
    }
  });
});

describe("отчёт о месте в базе", () => {
  it("показывает размер базы, таблиц и время последней очистки", async () => {
    const { getStorageReport } = await import("@/server/services/storageService");
    expect((await getStorageReport()).lastPrune).toBeNull();

    await pruneStaleData(NOW);
    const report = await getStorageReport();

    expect(report.databaseBytes).toBeGreaterThan(0);
    expect(report.tableBytes.Listing).toBeGreaterThan(0);
    expect(report.appBytes).toBeLessThanOrEqual(report.databaseBytes);
    expect(report.lastPrune?.at).toEqual(NOW);
    expect(report.nextPruneAt).toEqual(new Date(NOW.getTime() + DAY));
  });
});

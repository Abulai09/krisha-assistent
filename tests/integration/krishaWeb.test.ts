import { readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "node-html-parser";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { runCollection } from "@/server/services/collectionService";
import { KrishaWebSource } from "@/server/sources/krishaWebSource";
import { resetDatabase } from "./helpers";

// Источник krisha-web целиком через конвейер, но без сети: страницы выдачи подменены образцом вёрстки.

vi.mock("@/lib/utils/async", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/utils/async")>()),
  sleep: async () => {},
}));

const PAGE = readFileSync(path.join(import.meta.dirname, "../unit/fixtures/krisha-search-page.html"), "utf8");
const EMPTY_PAGE = "<html><body></body></html>";
const DAY_MS = 24 * 60 * 60 * 1000;
const DAY1 = new Date("2026-10-01T10:00:00Z");

beforeEach(resetDatabase);
afterAll(() => db.$disconnect());

function pageWithout(externalId: string) {
  const root = parse(PAGE);
  root.querySelector(`[data-id="${externalId}"]`)?.remove();
  return root.toString();
}

/** Первая страница — `firstPage`, дальше выдача пустая. */
function siteServing(firstPage: string, status = 200) {
  const fetchPage = vi.fn(async (url: string) => {
    const body = url.includes("page=") ? EMPTY_PAGE : firstPage;
    return Object.defineProperty(new Response(body, { status }), "url", { value: url });
  });
  return { source: new KrishaWebSource(fetchPage), fetchPage };
}

function run(source: KrishaWebSource, now: Date) {
  return runCollection({ source, trigger: "CLI", now, retryBaseDelayMs: 0 });
}

describe("источник krisha-web в конвейере", () => {
  it("сохраняет распознанные карточки, отклоняет цену «от …» и адрес без района", async () => {
    const summary = await run(siteServing(PAGE).source, DAY1);

    expect(summary).toMatchObject({ status: "PARTIAL", fetched: 4, created: 2, invalid: 2 });
    const source = await db.dataSource.findUniqueOrThrow({ where: { key: "krisha-web" } });
    expect(source).toMatchObject({ kind: "WEB", isSynthetic: false });
    const owner = await db.listing.findFirstOrThrow({ where: { externalId: "1000000002" } });
    expect(owner).toMatchObject({ sellerType: "OWNER", district: "AUEZOV", url: "https://krisha.kz/a/show/1000000002" });
  });

  it("объявление, которого нет в выдаче 14 дней, — «устарело», а не «снято»; вернулось — снова активно", async () => {
    await run(siteServing(PAGE).source, DAY1);

    // Через неделю его нет в выдаче, но срок не вышел — остаётся активным.
    const week = await run(siteServing(pageWithout("1000000002")).source, new Date(DAY1.getTime() + 7 * DAY_MS));
    expect(week.deactivated).toBe(0);

    await run(siteServing(pageWithout("1000000002")).source, new Date(DAY1.getTime() + 15 * DAY_MS));
    const stale = await db.listing.findFirstOrThrow({ where: { externalId: "1000000002" } });
    expect(stale).toMatchObject({ status: "INACTIVE", deactivationReason: "STALE" });
    expect(await db.listing.findFirstOrThrow({ where: { externalId: "1000000001" } })).toMatchObject({ status: "ACTIVE" });

    await run(siteServing(PAGE).source, new Date(DAY1.getTime() + 16 * DAY_MS));
    const back = await db.listing.findFirstOrThrow({ where: { externalId: "1000000002" } });
    expect(back).toMatchObject({ status: "ACTIVE", deactivationReason: null, deactivatedAt: null });
  });

  it("пустая выдача ничего не помечает устаревшим", async () => {
    await run(siteServing(PAGE).source, DAY1);
    await run(siteServing(EMPTY_PAGE).source, new Date(DAY1.getTime() + 30 * DAY_MS));
    expect(await db.listing.count({ where: { status: "ACTIVE" } })).toBe(2);
  });

  it("защита SafeLine (HTTP 468): запуск падает сразу, без повторных запросов", async () => {
    const { source, fetchPage } = siteServing("", 468);
    const summary = await run(source, DAY1);

    expect(summary.status).toBe("FAILED");
    expect(summary.error).toMatch(/ограничил доступ/);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });
});

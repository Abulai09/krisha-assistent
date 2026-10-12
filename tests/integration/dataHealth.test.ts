import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { getDataHealth } from "@/server/services/dataHealthService";
import { resetDatabase } from "./helpers";

// SCHEDULED_SOURCES в тестах — по умолчанию «synthetic», интервал worker'а — 60 минут: норма — 3 часа.
const NOW = new Date("2026-10-12T12:00:00Z");
const HOUR = 3_600_000;

beforeEach(async () => {
  await resetDatabase();
});

async function source(lastSuccessAt: Date | null) {
  return db.dataSource.create({
    data: { key: "synthetic", name: "Синтетика", kind: "SYNTHETIC", isSynthetic: true, status: "CONNECTED", lastSuccessAt },
  });
}

describe("свежесть данных", () => {
  it("свежие данные и нет зависших запусков — всё в порядке", async () => {
    await source(new Date(NOW.getTime() - HOUR));
    expect(await getDataHealth(NOW)).toMatchObject({ ok: true, staleSources: [], stuckRuns: 0 });
  });

  it("источник не обновлялся дольше трёх интервалов — устарело", async () => {
    await source(new Date(NOW.getTime() - 4 * HOUR));
    const health = await getDataHealth(NOW);
    expect(health.ok).toBe(false);
    expect(health.staleSources.map((item) => item.key)).toEqual(["synthetic"]);
  });

  it("запуск идёт дольше часа — завис", async () => {
    const { id } = await source(new Date(NOW.getTime() - HOUR));
    await db.collectionRun.create({
      data: { sourceId: id, trigger: "SCHEDULED", status: "RUNNING", startedAt: new Date(NOW.getTime() - 2 * HOUR) },
    });
    expect(await getDataHealth(NOW)).toMatchObject({ ok: false, stuckRuns: 1 });
  });
});

import { describe, expect, it } from "vitest";
import { isPruneDue, RETENTION_DAYS, retentionCutoffs } from "@/domain/retention";

const NOW = new Date("2026-10-12T12:00:00Z");
const HOUR = 3_600_000;

describe("сроки хранения", () => {
  it("граница — ровно столько дней назад, сколько задано", () => {
    const cutoffs = retentionCutoffs(NOW);
    expect(cutoffs.inactiveListing).toEqual(new Date("2026-07-14T12:00:00Z"));
    expect(NOW.getTime() - cutoffs.auditLog.getTime()).toBe(RETENTION_DAYS.auditLog * 24 * HOUR);
  });

  it("журнал действий хранится дольше всего остального", () => {
    const longest = Math.max(...Object.values(RETENTION_DAYS));
    expect(RETENTION_DAYS.auditLog).toBe(longest);
  });

  it("чистка раз в сутки: первый раз — сразу, потом не чаще суток", () => {
    expect(isPruneDue(null, NOW)).toBe(true);
    expect(isPruneDue(new Date(NOW.getTime() - 23 * HOUR), NOW)).toBe(false);
    expect(isPruneDue(new Date(NOW.getTime() - 24 * HOUR), NOW)).toBe(true);
  });
});

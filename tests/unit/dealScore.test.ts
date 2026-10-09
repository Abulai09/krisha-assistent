import { describe, expect, it } from "vitest";
import { computeDealScore, riskLevel } from "@/domain/deals/dealScore";

const base = {
  discountBasisPoints: 1000n,
  confidence: 80,
  confidenceLevel: "HIGH" as const,
  daysSinceUpdate: 3,
  missingKeyFields: 0,
  warnings: [],
};

describe("Deal Score", () => {
  it("в диапазоне 0–100", () => {
    expect(computeDealScore({ ...base, discountBasisPoints: 9000n }).dealScore).toBeLessThanOrEqual(100);
    expect(
      computeDealScore({
        ...base,
        discountBasisPoints: -3000n,
        confidence: 0,
        warnings: ["SUSPICIOUSLY_LOW_PRICE", "CONTRADICTORY_DATA", "STALE_LISTING"],
      }).dealScore,
    ).toBeGreaterThanOrEqual(0);
  });

  it("большая скидка даёт больший балл", () => {
    const small = computeDealScore({ ...base, discountBasisPoints: 500n }).dealScore;
    const large = computeDealScore({ ...base, discountBasisPoints: 1200n }).dealScore;
    expect(large).toBeGreaterThan(small);
  });

  it("цена выше рынка не получает баллов за скидку", () => {
    const above = computeDealScore({ ...base, discountBasisPoints: -500n }).dealScore;
    const fair = computeDealScore({ ...base, discountBasisPoints: 0n }).dealScore;
    expect(above).toBe(fair);
  });

  it("низкая уверенность снижает балл", () => {
    const confident = computeDealScore(base).dealScore;
    const unsure = computeDealScore({ ...base, confidence: 30, confidenceLevel: "LOW" }).dealScore;
    expect(unsure).toBeLessThan(confident);
  });

  it("риски штрафуют балл", () => {
    const clean = computeDealScore(base).dealScore;
    const risky = computeDealScore({ ...base, warnings: ["POSSIBLE_DUPLICATE", "STALE_LISTING"] }).dealScore;
    expect(clean - risky).toBe(20);
  });

  it("свежесть и полнота данных учитываются", () => {
    const fresh = computeDealScore(base).dealScore;
    expect(computeDealScore({ ...base, daysSinceUpdate: 60 }).dealScore).toBeLessThan(fresh);
    expect(computeDealScore({ ...base, missingKeyFields: 3 }).dealScore).toBeLessThan(fresh);
  });
});

describe("уровень риска", () => {
  it("без предупреждений и с уверенной оценкой — низкий", () => {
    expect(riskLevel(0, "HIGH")).toBe("LOW");
  });
  it("низкая уверенность — минимум средний", () => {
    expect(riskLevel(0, "LOW")).toBe("MEDIUM");
  });
  it("подозрительная цена — высокий", () => {
    expect(riskLevel(20, "HIGH")).toBe("HIGH");
  });
});

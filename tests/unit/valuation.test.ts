import { describe, expect, it } from "vitest";
import { isEligibleComparable, similarity } from "@/domain/valuation/comparables";
import { computeConfidence } from "@/domain/valuation/confidence";
import { hasContradictions, valuateListing } from "@/domain/valuation/valuate";
import { comparablesWithPricePerSqm, makeListing, NOW } from "./fixtures";

const MARKET_PPSM = [940_000, 960_000, 980_000, 1_000_000, 1_000_000, 1_020_000, 1_040_000, 1_060_000, 1_000_000, 990_000];

describe("поиск аналогов", () => {
  const subject = makeListing();

  it("не смешивает синтетические и реальные данные", () => {
    expect(isEligibleComparable(subject, makeListing({ isSynthetic: false }), NOW)).toBe(false);
  });

  it("требует тот же район и ту же комнатность", () => {
    expect(isEligibleComparable(subject, makeListing({ district: "MEDEU" }), NOW)).toBe(false);
    expect(isEligibleComparable(subject, makeListing({ rooms: 3 }), NOW)).toBe(false);
  });

  it("5+ комнат сравниваются как одна группа", () => {
    const big = makeListing({ rooms: 6, area: 200 });
    expect(isEligibleComparable(big, makeListing({ rooms: 5, area: 190 }), NOW)).toBe(true);
  });

  it("отклоняет аналоги с площадью, отличающейся более чем на 30%", () => {
    expect(isEligibleComparable(subject, makeListing({ area: 70 }), NOW)).toBe(false);
    expect(isEligibleComparable(subject, makeListing({ area: 60 }), NOW)).toBe(true);
  });

  it("исключает дубликаты, неактивные, устаревшие и ту же квартиру", () => {
    expect(isEligibleComparable(subject, makeListing({ duplicateOfId: "X" }), NOW)).toBe(false);
    expect(isEligibleComparable(subject, makeListing({ isActive: false }), NOW)).toBe(false);
    expect(isEligibleComparable(subject, makeListing({ lastSeenAt: new Date("2025-12-01") }), NOW)).toBe(false);
    expect(isEligibleComparable(subject, makeListing({ fingerprint: subject.fingerprint }), NOW)).toBe(false);
    expect(isEligibleComparable(subject, subject, NOW)).toBe(false);
  });

  it("исключает некорректные цены (цена за м² вне диапазона)", () => {
    expect(isEligibleComparable(subject, makeListing({ priceKzt: 2_000_000n }), NOW)).toBe(false);
  });

  it("похожесть выше у более похожего аналога", () => {
    const close = makeListing({ area: 51, yearBuilt: 2016 });
    const far = makeListing({ area: 62, yearBuilt: 1975, buildingType: "PANEL", condition: "NEEDS_REPAIR" });
    expect(similarity(subject, close, NOW)).toBeGreaterThan(similarity(subject, far, NOW));
  });
});

describe("оценка рыночной стоимости", () => {
  it("недостаточно аналогов — не придумывает цену", () => {
    const subject = makeListing({ priceKzt: 45_000_000n });
    const result = valuateListing(subject, comparablesWithPricePerSqm([1_000_000, 1_010_000, 990_000]), NOW);
    expect(result.status).toBe("INSUFFICIENT_DATA");
    expect(result.marketValue).toBeNull();
    expect(result.dealScore).toBeNull();
    expect(result.explanation.negatives[0]).toContain("Недостаточно данных");
  });

  it("цена на ~10% ниже рынка — скидка и разница считаются корректно", () => {
    const subject = makeListing({ priceKzt: 45_000_000n });
    const result = valuateListing(subject, comparablesWithPricePerSqm(MARKET_PPSM), NOW);
    expect(result.status).toBe("OK");
    expect(result.estimatedPricePerSqm).toBe(1_000_000n);
    expect(result.marketValue).toBe(50_000_000n);
    expect(result.discountBasisPoints).toBe(1000n);
    expect(result.potentialDifference).toBe(5_000_000n);
    expect(result.comparableScope).toBe("SAME_COMPLEX");
    expect(result.marketValueLow! <= result.marketValue!).toBe(true);
    expect(result.marketValueHigh! >= result.marketValue!).toBe(true);
    expect(result.explanation.positives.some((text) => text.includes("ниже"))).toBe(true);
  });

  it("цена выше рынка — отрицательная скидка и низкий Deal Score", () => {
    const subject = makeListing({ priceKzt: 56_000_000n });
    const result = valuateListing(subject, comparablesWithPricePerSqm(MARKET_PPSM), NOW);
    expect(result.discountBasisPoints! < 0n).toBe(true);
    expect(result.potentialDifference! < 0n).toBe(true);
    expect(result.dealScore!).toBeLessThan(50);
  });

  it("выбросы не влияют на оценку", () => {
    const subject = makeListing({ priceKzt: 45_000_000n });
    const pool = comparablesWithPricePerSqm([...MARKET_PPSM, 3_000_000, 200_000]);
    const result = valuateListing(subject, pool, NOW);
    expect(result.estimatedPricePerSqm).toBe(1_000_000n);
    expect(result.comparables.filter((c) => c.excludedAsOutlier)).toHaveLength(2);
    expect(result.explanation.comparablesExcluded).toBe(2);
  });

  it("если в ЖК мало аналогов, расширяет поиск до микрорайона", () => {
    const subject = makeListing({ priceKzt: 45_000_000n });
    const pool = [
      ...comparablesWithPricePerSqm([1_000_000, 1_000_000]),
      ...comparablesWithPricePerSqm(MARKET_PPSM, { complexKey: "другой" }),
    ];
    const result = valuateListing(subject, pool, NOW);
    expect(result.comparableScope).toBe("SAME_MICRODISTRICT");
  });

  it("в микрорайоне не сравнивает новый монолит со старой панелькой", () => {
    const subject = makeListing({ complexKey: null, priceKzt: 45_000_000n });
    const oldPanels = comparablesWithPricePerSqm(MARKET_PPSM.map((p) => p * 0.7), {
      complexKey: null,
      buildingType: "PANEL",
      yearBuilt: 1975,
    });
    const newMonoliths = comparablesWithPricePerSqm(MARKET_PPSM, { complexKey: null });
    const result = valuateListing(subject, [...oldPanels, ...newMonoliths], NOW);
    expect(result.comparableScope).toBe("SAME_MICRODISTRICT");
    expect(result.estimatedPricePerSqm).toBe(1_000_000n);
  });

  it("при достатке аналогов сравнивает с квартирами того же класса состояния", () => {
    const subject = makeListing({ condition: "NEEDS_REPAIR", priceKzt: 40_000_000n });
    const renovated = comparablesWithPricePerSqm(MARKET_PPSM, { condition: "EXCELLENT" });
    const unrenovated = comparablesWithPricePerSqm(
      [790_000, 800_000, 810_000, 800_000, 820_000],
      { condition: "ROUGH_FINISH" },
    );
    const result = valuateListing(subject, [...renovated, ...unrenovated], NOW);
    expect(result.estimatedPricePerSqm).toBe(800_000n);
    expect(result.discountBasisPoints).toBe(0n);
  });

  it("если аналогов того же состояния мало — предупреждает в объяснении", () => {
    const subject = makeListing({ condition: "NEEDS_REPAIR", priceKzt: 40_000_000n });
    const result = valuateListing(subject, comparablesWithPricePerSqm(MARKET_PPSM, { condition: "GOOD" }), NOW);
    expect(result.explanation.caveats.some((text) => text.includes("другим уровнем ремонта"))).toBe(true);
  });

  it("подозрительно низкая цена помечается и повышает риск", () => {
    const subject = makeListing({ priceKzt: 30_000_000n });
    const result = valuateListing(subject, comparablesWithPricePerSqm(MARKET_PPSM), NOW);
    expect(result.warnings).toContain("SUSPICIOUSLY_LOW_PRICE");
    expect(result.riskLevel).toBe("HIGH");
  });

  it("отсутствие ключевых характеристик отражается в предупреждениях", () => {
    const subject = makeListing({ priceKzt: 45_000_000n, yearBuilt: null, condition: null });
    const result = valuateListing(subject, comparablesWithPricePerSqm(MARKET_PPSM), NOW);
    expect(result.warnings).toContain("MISSING_KEY_FIELDS");
    expect(result.explanation.missingFields).toEqual(expect.arrayContaining(["Год постройки", "Состояние"]));
  });

  it("невозможная цена за м² — объявление признаётся некорректным", () => {
    const subject = makeListing({ priceKzt: 3_000_000n, area: 120 });
    const result = valuateListing(subject, comparablesWithPricePerSqm(MARKET_PPSM), NOW);
    expect(result.status).toBe("INVALID_LISTING");
  });
});

describe("противоречивые данные", () => {
  it("этаж выше этажности", () => {
    expect(hasContradictions(makeListing({ floor: 15, floorsTotal: 9 }), NOW)).toBe(true);
  });
  it("жилая площадь больше общей", () => {
    expect(hasContradictions(makeListing({ area: 40, livingAreaCenti: 4500n }), NOW)).toBe(true);
  });
  it("корректные данные", () => {
    expect(hasContradictions(makeListing(), NOW)).toBe(false);
  });
});

describe("уверенность оценки", () => {
  const base = {
    comparablesCount: 12,
    scope: "SAME_COMPLEX" as const,
    meanSimilarity: 0.9,
    medianPricePerSqm: 1_000_000n,
    pricePerSqmLow: 980_000n,
    pricePerSqmHigh: 1_020_000n,
  };

  it("много согласованных аналогов из того же ЖК — высокая уверенность", () => {
    expect(computeConfidence(base).level).toBe("HIGH");
  });

  it("мало аналогов и большой разброс по району — низкая уверенность", () => {
    const result = computeConfidence({
      ...base,
      comparablesCount: 5,
      scope: "SAME_DISTRICT",
      meanSimilarity: 0.5,
      pricePerSqmLow: 800_000n,
      pricePerSqmHigh: 1_250_000n,
    });
    expect(result.level).toBe("LOW");
  });

  it("уверенность растёт с количеством аналогов", () => {
    expect(computeConfidence({ ...base, comparablesCount: 6 }).score).toBeLessThan(computeConfidence(base).score);
  });
});

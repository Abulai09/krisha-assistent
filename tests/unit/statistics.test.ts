import { describe, expect, it } from "vitest";
import { median, outlierBounds, quantile, weightedMedian, weightedQuantile } from "@/domain/valuation/statistics";

describe("median", () => {
  it("нечётное количество — центральное значение", () => {
    expect(median([3n, 1n, 2n])).toBe(2n);
  });
  it("чётное количество — округлённое среднее двух центральных", () => {
    expect(median([1n, 2n, 3n, 4n])).toBe(3n);
    expect(median([10n, 20n])).toBe(15n);
  });
  it("пустой набор — ошибка", () => {
    expect(() => median([])).toThrow();
  });
});

describe("weightedQuantile", () => {
  it("при равных весах взвешенная медиана совпадает с нижней медианой", () => {
    const items = [100n, 200n, 300n].map((value) => ({ value, weight: 1 }));
    expect(weightedMedian(items)).toBe(200n);
  });

  it("тяжёлый вес смещает медиану", () => {
    const items = [
      { value: 100n, weight: 1 },
      { value: 200n, weight: 1 },
      { value: 300n, weight: 5 },
    ];
    expect(weightedMedian(items)).toBe(300n);
  });

  it("возвращает одно из исходных значений", () => {
    const items = [500n, 700n, 900n, 1100n].map((value) => ({ value, weight: 0.7 }));
    expect([500n, 700n, 900n, 1100n]).toContain(weightedQuantile(items, 0.25));
    expect([500n, 700n, 900n, 1100n]).toContain(weightedQuantile(items, 0.75));
  });
});

describe("выявление выбросов", () => {
  it("quantile интерполирует линейно", () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
  });

  it("отсекает явно аномальные цены", () => {
    const values = [900_000, 950_000, 1_000_000, 1_020_000, 1_050_000, 1_080_000, 3_500_000, 150_000];
    const bounds = outlierBounds(values);
    expect(3_500_000).toBeGreaterThan(bounds.upper);
    expect(150_000).toBeLessThan(bounds.lower);
    for (const normal of [900_000, 1_000_000, 1_080_000]) {
      expect(normal).toBeGreaterThanOrEqual(bounds.lower);
      expect(normal).toBeLessThanOrEqual(bounds.upper);
    }
  });

  it("для малой выборки использует полосу ±45% от медианы", () => {
    const bounds = outlierBounds([1_000_000, 1_100_000, 2_000_000]);
    expect(2_000_000).toBeGreaterThan(bounds.upper);
  });
});

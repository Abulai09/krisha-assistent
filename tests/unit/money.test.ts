import { describe, expect, it } from "vitest";
import {
  basisPointsToPercentString,
  discountBasisPoints,
  marketValue,
  potentialDifference,
  pricePerSqm,
  roundDiv,
  toAreaCenti,
} from "@/domain/money";

describe("roundDiv", () => {
  it("округляет половину от нуля", () => {
    expect(roundDiv(5n, 2n)).toBe(3n);
    expect(roundDiv(-5n, 2n)).toBe(-3n);
    expect(roundDiv(4n, 3n)).toBe(1n);
    expect(roundDiv(-4n, 3n)).toBe(-1n);
  });

  it("не допускает деления на ноль", () => {
    expect(() => roundDiv(1n, 0n)).toThrow();
  });
});

describe("toAreaCenti", () => {
  it("переводит площадь в сотые доли м²", () => {
    expect(toAreaCenti("54.5")).toBe(5450n);
    expect(toAreaCenti("54,55")).toBe(5455n);
    expect(toAreaCenti(48)).toBe(4800n);
  });

  it("отклоняет некорректные значения", () => {
    expect(() => toAreaCenti("abc")).toThrow();
    expect(() => toAreaCenti("-5")).toThrow();
  });
});

describe("цена за квадратный метр", () => {
  it("pricePerSqm = цена / площадь", () => {
    expect(pricePerSqm(42_000_000n, toAreaCenti(60))).toBe(700_000n);
  });

  it("округляет до целого тенге", () => {
    expect(pricePerSqm(10_000_000n, toAreaCenti(30))).toBe(333_333n);
  });

  it("отклоняет нулевую площадь", () => {
    expect(() => pricePerSqm(1n, 0n)).toThrow();
  });
});

describe("расчёт выгоды (пример из ТЗ)", () => {
  const listingPrice = 42_000_000n;
  const market = 47_000_000n;

  it("процент ниже рынка: (47 − 42) / 47 × 100 = 10,64%", () => {
    const bp = discountBasisPoints(market, listingPrice);
    expect(bp).toBe(1064n);
    expect(basisPointsToPercentString(bp)).toBe("10.64");
  });

  it("потенциальная разница: 5 000 000 ₸", () => {
    expect(potentialDifference(market, listingPrice)).toBe(5_000_000n);
  });

  it("цена выше рынка даёт отрицательную скидку", () => {
    const bp = discountBasisPoints(40_000_000n, 44_000_000n);
    expect(bp).toBe(-1000n);
    expect(basisPointsToPercentString(bp)).toBe("-10.00");
    expect(potentialDifference(40_000_000n, 44_000_000n)).toBe(-4_000_000n);
  });

  it("marketValue = цена за м² × площадь", () => {
    expect(marketValue(783_333n, toAreaCenti(60))).toBe(46_999_980n);
    expect(marketValue(1_000_000n, toAreaCenti("47.25"))).toBe(47_250_000n);
  });
});

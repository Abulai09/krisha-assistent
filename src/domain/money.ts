// Денежная арифметика в целых числах.
// Цены — целые тенге (bigint). Площадь — сотые доли квадратного метра (bigint),
// чтобы цена за м² и скидка считались без ошибок плавающей точки.

const AREA_SCALE = 100n;
const BASIS_POINTS = 10_000n;

/** Деление с округлением «половина от нуля». */
export function roundDiv(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new RangeError("Деление на ноль");
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  const absRemainderTwice = 2n * (remainder < 0n ? -remainder : remainder);
  const absDenominator = denominator < 0n ? -denominator : denominator;
  if (absRemainderTwice < absDenominator) return quotient;
  const sameSign = numerator < 0n === denominator < 0n;
  return sameSign ? quotient + 1n : quotient - 1n;
}

/** "54.5" | 54.5 → 5450n (сотые доли м²). Не более двух знаков после точки. */
export function toAreaCenti(area: string | number): bigint {
  const text = typeof area === "number" ? area.toString() : area.trim();
  const match = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(text);
  if (!match) throw new RangeError(`Некорректная площадь: ${text}`);
  const whole = BigInt(match[1]);
  const fraction = BigInt((match[2] ?? "").padEnd(2, "0"));
  return whole * AREA_SCALE + fraction;
}

export function areaCentiToNumber(areaCenti: bigint): number {
  return Number(areaCenti) / Number(AREA_SCALE);
}

/** pricePerSqm = listingPrice / apartmentArea */
export function pricePerSqm(priceKzt: bigint, areaCenti: bigint): bigint {
  if (areaCenti <= 0n) throw new RangeError("Площадь должна быть положительной");
  return roundDiv(priceKzt * AREA_SCALE, areaCenti);
}

/** marketValue = estimatedPricePerSqm × apartmentArea */
export function marketValue(estimatedPricePerSqm: bigint, areaCenti: bigint): bigint {
  return roundDiv(estimatedPricePerSqm * areaCenti, AREA_SCALE);
}

/** potentialDifference = marketValue − listingPrice */
export function potentialDifference(market: bigint, listingPrice: bigint): bigint {
  return market - listingPrice;
}

/**
 * discountPercent = (marketValue − listingPrice) / marketValue × 100,
 * в базисных пунктах (1064n = 10,64%). Положительное значение — дешевле рынка.
 */
export function discountBasisPoints(market: bigint, listingPrice: bigint): bigint {
  if (market <= 0n) throw new RangeError("Рыночная стоимость должна быть положительной");
  return roundDiv((market - listingPrice) * BASIS_POINTS, market);
}

/** 1064n → "10.64" (для хранения в Decimal). */
export function basisPointsToPercentString(bp: bigint): string {
  const negative = bp < 0n;
  const abs = negative ? -bp : bp;
  const whole = abs / 100n;
  const fraction = (abs % 100n).toString().padStart(2, "0");
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

export function basisPointsToNumber(bp: bigint): number {
  return Number(bp) / 100;
}

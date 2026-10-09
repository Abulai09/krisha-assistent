import { roundDiv } from "../money";

export interface WeightedValue {
  value: bigint;
  weight: number;
}

/** Обычная медиана целых значений (для чётного количества — округлённое среднее двух центральных). */
export function median(values: bigint[]): bigint {
  if (values.length === 0) throw new RangeError("Медиана пустого набора не определена");
  const sorted = [...values].sort(compareBigInt);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle];
  return roundDiv(sorted[middle - 1] + sorted[middle], 2n);
}

/**
 * Взвешенный квантиль: значение, на котором накопленный вес достигает доли q.
 * Возвращает одно из исходных значений, без интерполяции — результат всегда
 * совпадает с реальной ценой одного из аналогов.
 */
export function weightedQuantile(items: WeightedValue[], q: number): bigint {
  if (items.length === 0) throw new RangeError("Квантиль пустого набора не определён");
  if (q < 0 || q > 1) throw new RangeError("q должен быть в диапазоне [0, 1]");
  const sorted = [...items].sort((a, b) => compareBigInt(a.value, b.value));
  const totalWeight = sorted.reduce((sum, item) => sum + Math.max(item.weight, 0), 0);
  if (totalWeight <= 0) return median(sorted.map((item) => item.value));

  const target = q * totalWeight;
  let cumulative = 0;
  for (const item of sorted) {
    cumulative += Math.max(item.weight, 0);
    if (cumulative >= target - 1e-9) return item.value;
  }
  return sorted[sorted.length - 1].value;
}

export const weightedMedian = (items: WeightedValue[]) => weightedQuantile(items, 0.5);

/** Квантиль с линейной интерполяцией (для границ выбросов, не для денег). */
export function quantile(values: number[], q: number): number {
  if (values.length === 0) throw new RangeError("Квантиль пустого набора не определён");
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

export interface OutlierBounds {
  lower: number;
  upper: number;
}

/**
 * Границы выбросов по правилу Тьюки (IQR × 1,5). Для малых выборок IQR ненадёжен,
 * поэтому дополнительно отсекаются значения дальше ±45% от медианы.
 */
export function outlierBounds(values: number[]): OutlierBounds {
  const mid = quantile(values, 0.5);
  const medianBand = { lower: mid * 0.55, upper: mid * 1.45 };
  if (values.length < 5) return medianBand;

  const q1 = quantile(values, 0.25);
  const q3 = quantile(values, 0.75);
  const iqr = q3 - q1;
  return {
    lower: Math.max(q1 - 1.5 * iqr, medianBand.lower),
    upper: Math.min(q3 + 1.5 * iqr, medianBand.upper),
  };
}

function compareBigInt(a: bigint, b: bigint): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

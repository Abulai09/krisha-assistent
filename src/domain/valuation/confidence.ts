import type { ComparableScope, ConfidenceLevel } from "./types";

export interface ConfidenceInput {
  comparablesCount: number;
  scope: ComparableScope;
  /** Средняя похожесть использованных аналогов, 0..1. */
  meanSimilarity: number;
  medianPricePerSqm: bigint;
  pricePerSqmLow: bigint;
  pricePerSqmHigh: bigint;
}

const SCOPE_RELIABILITY: Record<ComparableScope, number> = {
  SAME_COMPLEX: 1,
  SAME_MICRODISTRICT: 0.85,
  SAME_DISTRICT_SIMILAR_BUILDING: 0.65,
  SAME_DISTRICT: 0.45,
};

/** При таком количестве аналогов вклад «количества» в уверенность максимален. */
const FULL_CONFIDENCE_COMPARABLES = 12;
/** Межквартильный разброс цены за м² (относительно медианы), при котором вклад «разброса» равен нулю. */
const MAX_ACCEPTABLE_SPREAD = 0.3;

const WEIGHTS = { count: 0.3, spread: 0.3, scope: 0.25, similarity: 0.15 } as const;

export interface ConfidenceBreakdown {
  score: number;
  level: ConfidenceLevel;
  spread: number;
}

/**
 * Уверенность 0–100 складывается из четырёх понятных частей:
 * сколько аналогов, насколько согласованы их цены, насколько близка локация
 * и насколько аналоги похожи по характеристикам.
 */
export function computeConfidence(input: ConfidenceInput): ConfidenceBreakdown {
  const countScore = Math.min(input.comparablesCount / FULL_CONFIDENCE_COMPARABLES, 1);
  const spread = Number(input.pricePerSqmHigh - input.pricePerSqmLow) / Number(input.medianPricePerSqm);
  const spreadScore = 1 - Math.min(spread / MAX_ACCEPTABLE_SPREAD, 1);
  const scopeScore = SCOPE_RELIABILITY[input.scope];
  const similarityScore = Math.min(Math.max(input.meanSimilarity, 0), 1);

  const score = Math.round(
    100 *
      (WEIGHTS.count * countScore +
        WEIGHTS.spread * spreadScore +
        WEIGHTS.scope * scopeScore +
        WEIGHTS.similarity * similarityScore),
  );

  return { score, level: confidenceLevel(score), spread };
}

export function confidenceLevel(score: number): ConfidenceLevel {
  if (score >= 70) return "HIGH";
  if (score >= 45) return "MEDIUM";
  return "LOW";
}

import type { WarningCode } from "../valuation/warnings";
import type { ConfidenceLevel, RiskLevel } from "../valuation/types";

export interface DealScoreInput {
  /** Скидка относительно рынка в базисных пунктах (1000n = 10%). */
  discountBasisPoints: bigint;
  /** Уверенность оценки 0–100. */
  confidence: number;
  confidenceLevel: ConfidenceLevel;
  /** Сколько дней назад объявление обновлялось или было замечено. */
  daysSinceUpdate: number;
  /** Сколько ключевых характеристик неизвестно (из KEY_FIELDS_COUNT). */
  missingKeyFields: number;
  warnings: WarningCode[];
}

export const KEY_FIELDS_COUNT = 5;

/**
 * Веса Deal Score. Скидка важнее всего, но без уверенности она ничего не стоит.
 * Ликвидность не учитывается: обоснованных данных о ней (сроки продажи) нет.
 */
export const DEAL_SCORE_WEIGHTS = {
  discount: 0.55,
  confidence: 0.25,
  freshness: 0.1,
  completeness: 0.1,
} as const;

/** Скидка, начиная с которой вклад скидки максимален. Больше — уже не «лучше», а подозрительнее. */
export const FULL_SCORE_DISCOUNT_BP = 1500n;

/** Штрафы за выявленные риски (в баллах Deal Score). */
export const RISK_PENALTIES: Partial<Record<WarningCode, number>> = {
  SUSPICIOUSLY_LOW_PRICE: 20,
  CONTRADICTORY_DATA: 15,
  POSSIBLE_DUPLICATE: 10,
  STALE_LISTING: 10,
  FEW_COMPARABLES: 5,
  LOW_CONFIDENCE: 5,
  CONDITION_MISMATCH: 10,
};

export interface DealScoreResult {
  dealScore: number;
  riskLevel: RiskLevel;
  penalty: number;
}

export function computeDealScore(input: DealScoreInput): DealScoreResult {
  const discountComponent =
    input.discountBasisPoints <= 0n
      ? 0
      : Math.min(Number(input.discountBasisPoints) / Number(FULL_SCORE_DISCOUNT_BP), 1);
  const confidenceComponent = Math.min(Math.max(input.confidence, 0), 100) / 100;
  const freshnessComponent = input.daysSinceUpdate <= 7 ? 1 : input.daysSinceUpdate <= 30 ? 0.7 : 0.4;
  const completenessComponent = 1 - Math.min(input.missingKeyFields, KEY_FIELDS_COUNT) / KEY_FIELDS_COUNT;

  const base =
    100 *
    (DEAL_SCORE_WEIGHTS.discount * discountComponent +
      DEAL_SCORE_WEIGHTS.confidence * confidenceComponent +
      DEAL_SCORE_WEIGHTS.freshness * freshnessComponent +
      DEAL_SCORE_WEIGHTS.completeness * completenessComponent);

  const penalty = input.warnings.reduce((sum, code) => sum + (RISK_PENALTIES[code] ?? 0), 0);
  const dealScore = Math.min(100, Math.max(0, Math.round(base - penalty)));

  return { dealScore, riskLevel: riskLevel(penalty, input.confidenceLevel), penalty };
}

export function riskLevel(penalty: number, confidence: ConfidenceLevel): RiskLevel {
  const riskPoints = penalty + (confidence === "LOW" ? 10 : 0);
  if (riskPoints >= 20) return "HIGH";
  if (riskPoints >= 10) return "MEDIUM";
  return "LOW";
}

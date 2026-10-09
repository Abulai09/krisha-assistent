import { computeDealScore } from "../deals/dealScore";
import {
  discountBasisPoints,
  marketValue,
  potentialDifference,
  pricePerSqm,
} from "../money";
import {
  COMPARABLE_RULES,
  SCOPE_ORDER,
  ageInDays,
  conditionClass,
  hasSanePricePerSqm,
  isEligibleComparable,
  matchesScope,
  similarity,
} from "./comparables";
import { computeConfidence, type ConfidenceBreakdown } from "./confidence";
import { buildExplanationParts, missingFields, missingKeyFields, STANDARD_CAVEATS } from "./explanation";
import { outlierBounds, weightedMedian, weightedQuantile } from "./statistics";
import type {
  ComparableScope,
  ScoredComparable,
  ValuationExplanation,
  ValuationListing,
  ValuationResult,
} from "./types";
import type { WarningCode } from "./warnings";

export const VALUATION_METHOD = "comparables-weighted-median-v2";

const FEW_COMPARABLES_THRESHOLD = 8;
const SUSPICIOUS_DISCOUNT_BP = 2500n;
const STALE_LISTING_DAYS = 45;

interface ScopeAttempt {
  scope: ComparableScope;
  /** Аналоги отобраны в том же классе состояния (без ремонта / средний / с ремонтом). */
  conditionMatched: boolean;
  scored: ScoredComparable[];
  used: ScoredComparable[];
}

/**
 * Оценивает рыночную стоимость квартиры по сопоставимым объявлениям.
 *
 * 1. Отбираются аналоги: тот же набор данных, район, комнатность, площадь ±30%, свежие, не дубликаты.
 * 2. Перебираются уровни близости (ЖК → микрорайон → похожий дом в районе → район),
 *    берётся первый, где после удаления выбросов осталось не меньше 5 аналогов.
 *    Внутри уровня, если хватает аналогов, берутся квартиры того же класса состояния.
 * 3. Цена за м² = взвешенная медиана (вес — похожесть аналога), диапазон — 25–75 перцентили.
 */
export function valuateListing(subject: ValuationListing, pool: ValuationListing[], now: Date): ValuationResult {
  const ownPricePerSqm = pricePerSqm(subject.priceKzt, subject.areaCenti);
  const warnings = detectListingWarnings(subject, now);

  if (!hasSanePricePerSqm(subject)) {
    return emptyResult(subject, ownPricePerSqm, "INVALID_LISTING", [...warnings, "CONTRADICTORY_DATA"], [
      `Цена за м² (${ownPricePerSqm} ₸) вне правдоподобного диапазона для Алматы — вероятна ошибка в цене или площади.`,
    ]);
  }

  const eligible = pool.filter((candidate) => isEligibleComparable(subject, candidate, now));
  const attempt = selectComparables(subject, eligible, now);

  if (!attempt) {
    const bestCount = bestAttemptSize(subject, eligible, now);
    return emptyResult(subject, ownPricePerSqm, "INSUFFICIENT_DATA", warnings, [
      `Недостаточно данных для надёжной оценки: найдено ${bestCount} подходящих аналогов, нужно минимум ${COMPARABLE_RULES.minComparables}.`,
    ]);
  }

  const weighted = attempt.used.map((c) => ({ value: c.pricePerSqm, weight: c.similarity }));
  const estimatedPricePerSqm = weightedMedian(weighted);
  const pricePerSqmLow = weightedQuantile(weighted, 0.25);
  const pricePerSqmHigh = weightedQuantile(weighted, 0.75);

  const market = marketValue(estimatedPricePerSqm, subject.areaCenti);
  const discount = discountBasisPoints(market, subject.priceKzt);

  const confidence = computeConfidence({
    comparablesCount: attempt.used.length,
    scope: attempt.scope,
    meanSimilarity: attempt.used.reduce((sum, c) => sum + c.similarity, 0) / attempt.used.length,
    medianPricePerSqm: estimatedPricePerSqm,
    pricePerSqmLow,
    pricePerSqmHigh,
  });

  const conditionMismatch = subject.condition !== null && !attempt.conditionMatched;
  const allWarnings = [
    ...new Set([...warnings, ...valuationWarnings(attempt.used.length, discount, confidence, conditionMismatch)]),
  ];
  const missingKey = missingKeyFields(subject);
  const { dealScore, riskLevel } = computeDealScore({
    discountBasisPoints: discount,
    confidence: confidence.score,
    confidenceLevel: confidence.level,
    daysSinceUpdate: ageInDays(subject.sourceUpdatedAt ?? subject.publishedAt ?? subject.lastSeenAt, now),
    missingKeyFields: missingKey.length,
    warnings: allWarnings,
  });

  const usedIds = new Set(attempt.used.map((c) => c.listingId));
  const usedListings = eligible.filter((listing) => usedIds.has(listing.id));
  const parts = buildExplanationParts({
    subject,
    comparables: usedListings,
    scope: attempt.scope,
    discountBasisPoints: discount,
    confidenceLevel: confidence.level,
    conditionMatched: attempt.conditionMatched,
    now,
  });

  return {
    status: "OK",
    method: VALUATION_METHOD,
    listingPriceKzt: subject.priceKzt,
    pricePerSqm: ownPricePerSqm,
    estimatedPricePerSqm,
    marketValue: market,
    marketValueLow: marketValue(pricePerSqmLow, subject.areaCenti),
    marketValueHigh: marketValue(pricePerSqmHigh, subject.areaCenti),
    potentialDifference: potentialDifference(market, subject.priceKzt),
    discountBasisPoints: discount,
    comparableScope: attempt.scope,
    comparables: attempt.scored,
    confidence: confidence.score,
    confidenceLevel: confidence.level,
    dealScore,
    riskLevel,
    warnings: allWarnings,
    explanation: {
      scope: attempt.scope,
      comparablesUsed: attempt.used.length,
      comparablesExcluded: attempt.scored.length - attempt.used.length,
      medianPricePerSqm: estimatedPricePerSqm.toString(),
      pricePerSqmLow: pricePerSqmLow.toString(),
      pricePerSqmHigh: pricePerSqmHigh.toString(),
      ...parts,
      missingFields: missingFields(subject),
    },
  };
}

/**
 * Сначала все уровни близости с тем же классом состояния, затем — со смешанным.
 * Разница «без ремонта / с ремонтом» (до 25%) больше разницы между соседними ЖК (~10%),
 * поэтому похожий ремонт в районе точнее, чем другой ремонт в том же ЖК.
 */
function selectComparables(subject: ValuationListing, eligible: ValuationListing[], now: Date): ScopeAttempt | null {
  const conditionModes = conditionClass(subject.condition) === null ? [false] : [true, false];
  for (const requireSameCondition of conditionModes) {
    for (const scope of SCOPE_ORDER) {
      const attempt = attemptScope(scope, subject, eligible, now, requireSameCondition);
      if (attempt.used.length >= COMPARABLE_RULES.minComparables) return attempt;
    }
  }
  return null;
}

function attemptScope(
  scope: ComparableScope,
  subject: ValuationListing,
  eligible: ValuationListing[],
  now: Date,
  requireSameCondition: boolean,
): ScopeAttempt {
  const subjectClass = conditionClass(subject.condition);
  const conditionMatched = requireSameCondition && subjectClass !== null;
  const candidates = eligible.filter(
    (candidate) =>
      matchesScope(scope, subject, candidate) &&
      (!conditionMatched || conditionClass(candidate.condition) === subjectClass),
  );

  const ranked = candidates
    .map((candidate) => ({
      listingId: candidate.id,
      pricePerSqm: pricePerSqm(candidate.priceKzt, candidate.areaCenti),
      similarity: similarity(subject, candidate, now),
      excludedAsOutlier: false,
    }))
    .sort((a, b) => b.similarity - a.similarity || a.listingId.localeCompare(b.listingId))
    .slice(0, COMPARABLE_RULES.maxComparables);

  if (ranked.length === 0) return { scope, conditionMatched, scored: [], used: [] };

  const bounds = outlierBounds(ranked.map((c) => Number(c.pricePerSqm)));
  const scored = ranked.map((c) => {
    const value = Number(c.pricePerSqm);
    return { ...c, excludedAsOutlier: value < bounds.lower || value > bounds.upper };
  });
  return { scope, conditionMatched, scored, used: scored.filter((c) => !c.excludedAsOutlier) };
}

function bestAttemptSize(subject: ValuationListing, eligible: ValuationListing[], now: Date): number {
  return Math.max(0, ...SCOPE_ORDER.map((scope) => attemptScope(scope, subject, eligible, now, false).used.length));
}

/** Предупреждения, которые зависят только от самого объявления. */
export function detectListingWarnings(subject: ValuationListing, now: Date): WarningCode[] {
  const warnings: WarningCode[] = [];
  if (missingKeyFields(subject).length > 0) warnings.push("MISSING_KEY_FIELDS");

  const updatedAt = subject.sourceUpdatedAt ?? subject.publishedAt;
  if (updatedAt && ageInDays(updatedAt, now) > STALE_LISTING_DAYS) warnings.push("STALE_LISTING");

  if (subject.duplicateOfId !== null || subject.hasDuplicates) warnings.push("POSSIBLE_DUPLICATE");
  if (subject.priceChangeCount > 0) warnings.push("PRICE_CHANGED");
  if (hasContradictions(subject, now)) warnings.push("CONTRADICTORY_DATA");
  return warnings;
}

export function hasContradictions(subject: ValuationListing, now: Date): boolean {
  if (subject.floor !== null && subject.floorsTotal !== null && subject.floor > subject.floorsTotal) return true;
  if (subject.livingAreaCenti !== null && subject.livingAreaCenti > subject.areaCenti) return true;
  const partsArea = (subject.livingAreaCenti ?? 0n) + (subject.kitchenAreaCenti ?? 0n);
  if (partsArea > subject.areaCenti) return true;
  if (subject.yearBuilt !== null && subject.yearBuilt > now.getFullYear() + 5) return true;
  return false;
}

function valuationWarnings(
  used: number,
  discount: bigint,
  confidence: ConfidenceBreakdown,
  conditionMismatch: boolean,
): WarningCode[] {
  const warnings: WarningCode[] = [];
  if (used < FEW_COMPARABLES_THRESHOLD) warnings.push("FEW_COMPARABLES");
  if (conditionMismatch) warnings.push("CONDITION_MISMATCH");
  if (discount >= SUSPICIOUS_DISCOUNT_BP) warnings.push("SUSPICIOUSLY_LOW_PRICE");
  if (confidence.level === "LOW") warnings.push("LOW_CONFIDENCE");
  return warnings;
}

function emptyResult(
  subject: ValuationListing,
  ownPricePerSqm: bigint,
  status: "INSUFFICIENT_DATA" | "INVALID_LISTING",
  warnings: WarningCode[],
  reasons: string[],
): ValuationResult {
  const explanation: ValuationExplanation = {
    scope: null,
    comparablesUsed: 0,
    comparablesExcluded: 0,
    medianPricePerSqm: null,
    pricePerSqmLow: null,
    pricePerSqmHigh: null,
    positives: [],
    negatives: reasons,
    differences: [],
    missingFields: missingFields(subject),
    caveats: STANDARD_CAVEATS,
  };
  return {
    status,
    method: VALUATION_METHOD,
    listingPriceKzt: subject.priceKzt,
    pricePerSqm: ownPricePerSqm,
    estimatedPricePerSqm: null,
    marketValue: null,
    marketValueLow: null,
    marketValueHigh: null,
    potentialDifference: null,
    discountBasisPoints: null,
    comparableScope: null,
    comparables: [],
    confidence: null,
    confidenceLevel: null,
    dealScore: null,
    riskLevel: null,
    warnings: [...new Set(warnings)],
    explanation,
  };
}

import type { ApartmentCondition, BuildingType, District } from "../listing/enums";

/** Объявление в форме, нужной для оценки. Площадь — в сотых долях м². */
export interface ValuationListing {
  id: string;
  isSynthetic: boolean;
  isActive: boolean;
  priceKzt: bigint;
  areaCenti: bigint;
  livingAreaCenti: bigint | null;
  kitchenAreaCenti: bigint | null;
  rooms: number;
  district: District;
  microdistrict: string | null;
  complexKey: string | null;
  buildingType: BuildingType | null;
  yearBuilt: number | null;
  floor: number | null;
  floorsTotal: number | null;
  condition: ApartmentCondition | null;
  publishedAt: Date | null;
  sourceUpdatedAt: Date | null;
  lastSeenAt: Date;
  fingerprint: string;
  duplicateOfId: string | null;
  hasDuplicates: boolean;
  priceChangeCount: number;
}

export type ComparableScope =
  | "SAME_COMPLEX"
  | "SAME_MICRODISTRICT"
  | "SAME_DISTRICT_SIMILAR_BUILDING"
  | "SAME_DISTRICT";

export type ConfidenceLevel = "LOW" | "MEDIUM" | "HIGH";
export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";
export type ValuationStatus = "OK" | "INSUFFICIENT_DATA" | "INVALID_LISTING";

export interface ScoredComparable {
  listingId: string;
  pricePerSqm: bigint;
  similarity: number;
  excludedAsOutlier: boolean;
}

export interface ValuationExplanation {
  scope: ComparableScope | null;
  comparablesUsed: number;
  comparablesExcluded: number;
  /** Медиана и квартильный диапазон цены за м² у использованных аналогов (тенге, строкой). */
  medianPricePerSqm: string | null;
  pricePerSqmLow: string | null;
  pricePerSqmHigh: string | null;
  positives: string[];
  negatives: string[];
  differences: string[];
  missingFields: string[];
  caveats: string[];
}

export interface ValuationResult {
  status: ValuationStatus;
  method: string;
  listingPriceKzt: bigint;
  pricePerSqm: bigint | null;
  estimatedPricePerSqm: bigint | null;
  marketValue: bigint | null;
  marketValueLow: bigint | null;
  marketValueHigh: bigint | null;
  potentialDifference: bigint | null;
  /** Скидка в базисных пунктах: 1064n = 10,64% ниже рынка. */
  discountBasisPoints: bigint | null;
  comparableScope: ComparableScope | null;
  comparables: ScoredComparable[];
  confidence: number | null;
  confidenceLevel: ConfidenceLevel | null;
  dealScore: number | null;
  riskLevel: RiskLevel | null;
  warnings: string[];
  explanation: ValuationExplanation;
}

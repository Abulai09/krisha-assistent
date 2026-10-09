import { CONDITIONS } from "../listing/enums";
import { toLocationKey } from "../listing/normalize";
import { areaCentiToNumber, pricePerSqm } from "../money";
import type { ComparableScope, ValuationListing } from "./types";

export const COMPARABLE_RULES = {
  /** Минимум аналогов (после удаления выбросов) для надёжной оценки. */
  minComparables: 5,
  /** Сколько самых похожих аналогов берётся в расчёт. */
  maxComparables: 20,
  /** Допустимое отличие площади от оцениваемой квартиры. */
  maxAreaDifference: 0.3,
  /** Объявления, которые не видели дольше этого срока, не используются как аналоги. */
  maxComparableAgeDays: 180,
  /** Разумный диапазон цены за м² в Алматы; всё вне его — ошибка данных. */
  minPricePerSqm: 150_000n,
  maxPricePerSqm: 6_000_000n,
  /** Разница в годах постройки для уровня «похожий дом в районе». */
  maxYearDifference: 10,
} as const;

export const SCOPE_ORDER: ComparableScope[] = [
  "SAME_COMPLEX",
  "SAME_MICRODISTRICT",
  "SAME_DISTRICT_SIMILAR_BUILDING",
  "SAME_DISTRICT",
];

const DAY_MS = 24 * 60 * 60 * 1000;

/** 5 и более комнат сравниваются между собой как одна группа. */
export const roomsBucket = (rooms: number) => Math.min(rooms, 5);

export function hasSanePricePerSqm(listing: Pick<ValuationListing, "priceKzt" | "areaCenti">): boolean {
  const ppsm = pricePerSqm(listing.priceKzt, listing.areaCenti);
  return ppsm >= COMPARABLE_RULES.minPricePerSqm && ppsm <= COMPARABLE_RULES.maxPricePerSqm;
}

/**
 * Базовый отбор: те же «правила игры» (продажа квартир, тот же набор данных),
 * то же количество комнат, похожая площадь, свежие и не дублирующие объявления.
 */
export function isEligibleComparable(subject: ValuationListing, candidate: ValuationListing, now: Date): boolean {
  if (candidate.id === subject.id) return false;
  if (!candidate.isActive) return false;
  if (candidate.isSynthetic !== subject.isSynthetic) return false;
  if (candidate.duplicateOfId !== null) return false;
  if (candidate.fingerprint === subject.fingerprint) return false;
  if (candidate.district !== subject.district) return false;
  if (roomsBucket(candidate.rooms) !== roomsBucket(subject.rooms)) return false;
  if (relativeAreaDifference(subject, candidate) > COMPARABLE_RULES.maxAreaDifference) return false;
  if (ageInDays(candidate.lastSeenAt, now) > COMPARABLE_RULES.maxComparableAgeDays) return false;
  return hasSanePricePerSqm(candidate);
}

export function matchesScope(scope: ComparableScope, subject: ValuationListing, candidate: ValuationListing): boolean {
  switch (scope) {
    case "SAME_COMPLEX":
      return subject.complexKey !== null && candidate.complexKey === subject.complexKey;
    case "SAME_MICRODISTRICT": {
      // В одном микрорайоне соседствуют старые панельки и новые монолиты — сравниваем похожие дома.
      const subjectKey = toLocationKey(subject.microdistrict);
      const sameMicrodistrict = subjectKey !== null && toLocationKey(candidate.microdistrict) === subjectKey;
      return sameMicrodistrict && (!hasBuildingInfo(subject) || isSimilarBuilding(subject, candidate));
    }
    case "SAME_DISTRICT_SIMILAR_BUILDING":
      return isSimilarBuilding(subject, candidate);
    case "SAME_DISTRICT":
      // Даже на уровне района не смешиваем эпохи застройки, если год постройки известен.
      return subject.yearBuilt === null || (candidate.yearBuilt !== null && buildingEra(candidate.yearBuilt) === buildingEra(subject.yearBuilt));
  }
}

export type BuildingEra = "BEFORE_1991" | "1991_2010" | "AFTER_2010";

export function buildingEra(yearBuilt: number): BuildingEra {
  if (yearBuilt < 1991) return "BEFORE_1991";
  if (yearBuilt <= 2010) return "1991_2010";
  return "AFTER_2010";
}

/**
 * Класс состояния: квартиры без ремонта и с ремонтом различаются в цене на десятки процентов,
 * поэтому, если хватает аналогов, сравниваем внутри одного класса.
 */
export type ConditionClass = "NO_RENOVATION" | "STANDARD" | "RENOVATED";

export function conditionClass(condition: ValuationListing["condition"]): ConditionClass | null {
  switch (condition) {
    case "ROUGH_FINISH":
    case "NEEDS_REPAIR":
      return "NO_RENOVATION";
    case "AVERAGE":
      return "STANDARD";
    case "GOOD":
    case "EXCELLENT":
      return "RENOVATED";
    case null:
      return null;
  }
}

const hasBuildingInfo = (listing: ValuationListing) => listing.buildingType !== null && listing.yearBuilt !== null;

function isSimilarBuilding(subject: ValuationListing, candidate: ValuationListing): boolean {
  if (subject.buildingType === null || subject.yearBuilt === null) return false;
  if (candidate.buildingType !== subject.buildingType) return false;
  if (candidate.yearBuilt === null) return false;
  return Math.abs(candidate.yearBuilt - subject.yearBuilt) <= COMPARABLE_RULES.maxYearDifference;
}

const SIMILARITY_WEIGHTS = {
  area: 0.25,
  condition: 0.2,
  year: 0.15,
  buildingType: 0.15,
  freshness: 0.15,
  floor: 0.1,
} as const;

/** Неизвестная характеристика не наказывается и не поощряется. */
const UNKNOWN_SIMILARITY = 0.5;

/** Похожесть аналога на оцениваемую квартиру от 0 до 1. */
export function similarity(subject: ValuationListing, candidate: ValuationListing, now: Date): number {
  const area = 1 - Math.min(relativeAreaDifference(subject, candidate) / COMPARABLE_RULES.maxAreaDifference, 1);

  const year =
    subject.yearBuilt !== null && candidate.yearBuilt !== null
      ? 1 - Math.min(Math.abs(subject.yearBuilt - candidate.yearBuilt) / 15, 1)
      : UNKNOWN_SIMILARITY;

  const buildingType =
    subject.buildingType !== null && candidate.buildingType !== null
      ? subject.buildingType === candidate.buildingType
        ? 1
        : 0.3
      : UNKNOWN_SIMILARITY;

  const condition =
    subject.condition !== null && candidate.condition !== null
      ? 1 -
        Math.abs(CONDITIONS.indexOf(subject.condition) - CONDITIONS.indexOf(candidate.condition)) /
          (CONDITIONS.length - 1)
      : UNKNOWN_SIMILARITY;

  const subjectFloor = floorCategory(subject);
  const candidateFloor = floorCategory(candidate);
  const floor =
    subjectFloor !== null && candidateFloor !== null ? (subjectFloor === candidateFloor ? 1 : 0.6) : UNKNOWN_SIMILARITY;

  const freshness = 1 - Math.min(ageInDays(candidate.lastSeenAt, now) / COMPARABLE_RULES.maxComparableAgeDays, 1) * 0.5;

  const score =
    SIMILARITY_WEIGHTS.area * area +
    SIMILARITY_WEIGHTS.condition * condition +
    SIMILARITY_WEIGHTS.year * year +
    SIMILARITY_WEIGHTS.buildingType * buildingType +
    SIMILARITY_WEIGHTS.freshness * freshness +
    SIMILARITY_WEIGHTS.floor * floor;

  return Math.round(score * 10_000) / 10_000;
}

export type FloorCategory = "FIRST" | "LAST" | "MIDDLE";

export function floorCategory(listing: Pick<ValuationListing, "floor" | "floorsTotal">): FloorCategory | null {
  if (listing.floor === null || listing.floorsTotal === null) return null;
  if (listing.floor <= 1) return "FIRST";
  if (listing.floor >= listing.floorsTotal && listing.floorsTotal > 2) return "LAST";
  return "MIDDLE";
}

export function relativeAreaDifference(subject: ValuationListing, candidate: ValuationListing): number {
  const subjectArea = areaCentiToNumber(subject.areaCenti);
  return Math.abs(areaCentiToNumber(candidate.areaCenti) - subjectArea) / subjectArea;
}

export function ageInDays(date: Date, now: Date): number {
  return Math.max(0, (now.getTime() - date.getTime()) / DAY_MS);
}

import { CONDITION_LABELS, type ApartmentCondition } from "../listing/enums";
import { areaCentiToNumber, basisPointsToNumber } from "../money";
import { formatArea, formatPercent, pluralize } from "../format";
import { ageInDays, floorCategory } from "./comparables";
import type { ComparableScope, ConfidenceLevel, ValuationListing } from "./types";

export const KEY_FIELDS: { key: keyof ValuationListing; label: string }[] = [
  { key: "yearBuilt", label: "Год постройки" },
  { key: "buildingType", label: "Тип дома" },
  { key: "condition", label: "Состояние" },
  { key: "floor", label: "Этаж" },
  { key: "floorsTotal", label: "Этажность дома" },
];

const SECONDARY_FIELDS: { key: keyof ValuationListing; label: string }[] = [
  { key: "complexKey", label: "ЖК" },
  { key: "microdistrict", label: "Микрорайон" },
  { key: "livingAreaCenti", label: "Жилая площадь" },
];

export function missingKeyFields(listing: ValuationListing): string[] {
  return KEY_FIELDS.filter(({ key }) => listing[key] === null).map(({ label }) => label);
}

export function missingFields(listing: ValuationListing): string[] {
  return [...KEY_FIELDS, ...SECONDARY_FIELDS].filter(({ key }) => listing[key] === null).map(({ label }) => label);
}

export const SCOPE_LABELS: Record<ComparableScope, string> = {
  SAME_COMPLEX: "тот же ЖК",
  SAME_MICRODISTRICT: "тот же микрорайон",
  SAME_DISTRICT_SIMILAR_BUILDING: "тот же район, похожий дом",
  SAME_DISTRICT: "тот же район, та же эпоха застройки",
};

/** Всегда показываемые оговорки: оценка не является гарантией. */
export const STANDARD_CAVEATS = [
  "Оценка основана на ценах предложения из объявлений, а не на ценах совершённых сделок.",
  "Потенциальная разница — не прибыль: не учтены торг, расходы на сделку, ремонт, налоги и юридические риски.",
  "Юридическая чистота квартиры и надёжность продавца не проверялись.",
];

export interface ExplanationInput {
  subject: ValuationListing;
  comparables: ValuationListing[];
  scope: ComparableScope;
  discountBasisPoints: bigint;
  confidenceLevel: ConfidenceLevel;
  conditionMatched: boolean;
  now: Date;
}

export interface ExplanationParts {
  positives: string[];
  negatives: string[];
  differences: string[];
  caveats: string[];
}

export function buildExplanationParts(input: ExplanationInput): ExplanationParts {
  const { subject, comparables, scope, discountBasisPoints, confidenceLevel, conditionMatched, now } = input;
  const discount = basisPointsToNumber(discountBasisPoints);
  const positives: string[] = [];
  const negatives: string[] = [];

  if (discount > 0) {
    positives.push(`Цена на ${formatPercent(discount)} ниже расчётной рыночной стоимости.`);
  } else {
    negatives.push(
      discount === 0
        ? "Цена соответствует расчётной рыночной стоимости."
        : `Цена на ${formatPercent(-discount)} выше расчётной рыночной стоимости.`,
    );
  }

  if (scope === "SAME_COMPLEX") positives.push("Аналоги найдены в том же ЖК — это самое точное сравнение.");
  if (scope === "SAME_MICRODISTRICT") positives.push("Аналоги найдены в том же микрорайоне.");
  if (confidenceLevel === "HIGH") positives.push("Цены аналогов хорошо согласуются между собой.");

  const updatedAt = subject.sourceUpdatedAt ?? subject.publishedAt;
  if (updatedAt && ageInDays(updatedAt, now) <= 7) positives.push("Объявление обновлялось в последние 7 дней.");

  if (discount > 0 && (subject.condition === "GOOD" || subject.condition === "EXCELLENT")) {
    positives.push("Хорошее состояние при цене ниже рынка.");
  }
  if (subject.condition === "NEEDS_REPAIR" || subject.condition === "ROUGH_FINISH") {
    negatives.push("Потребуются вложения в ремонт — это может объяснять часть скидки.");
  }

  const floor = floorCategory(subject);
  if (floor === "FIRST") negatives.push("Первый этаж — такие квартиры обычно продаются дешевле.");
  if (floor === "LAST") negatives.push("Последний этаж — часть покупателей его избегает.");

  const caveats = [...STANDARD_CAVEATS];
  if (scope === "SAME_DISTRICT" || scope === "SAME_DISTRICT_SIMILAR_BUILDING") {
    caveats.push("Аналоги подобраны в пределах района — различия между микрорайонами внутри района не учтены.");
  }

  if (subject.condition === null) {
    caveats.push("Состояние квартиры неизвестно — аналоги подобраны без учёта ремонта.");
  } else if (!conditionMatched) {
    caveats.push("Аналогов с таким же состоянием недостаточно — в сравнение вошли квартиры с другим уровнем ремонта.");
  }

  return { positives, negatives, differences: describeDifferences(subject, comparables), caveats };
}

function describeDifferences(subject: ValuationListing, comparables: ValuationListing[]): string[] {
  const differences: string[] = [];
  if (comparables.length === 0) return differences;

  const subjectArea = areaCentiToNumber(subject.areaCenti);
  const medianArea = medianNumber(comparables.map((c) => areaCentiToNumber(c.areaCenti)));
  const areaDiff = (subjectArea - medianArea) / medianArea;
  if (Math.abs(areaDiff) >= 0.1) {
    differences.push(
      `Площадь на ${formatPercent(Math.abs(areaDiff) * 100)} ${areaDiff > 0 ? "больше" : "меньше"}, чем у аналогов (медиана ${formatArea(medianArea)}).`,
    );
  }

  const years = comparables.map((c) => c.yearBuilt).filter((y): y is number => y !== null);
  if (subject.yearBuilt !== null && years.length > 0) {
    const medianYear = Math.round(medianNumber(years));
    const diff = subject.yearBuilt - medianYear;
    if (Math.abs(diff) >= 5) {
      const years = Math.abs(diff);
      differences.push(
        `Дом ${diff > 0 ? "новее" : "старше"} аналогов на ${years} ${pluralize(years, ["год", "года", "лет"])} (медиана — ${medianYear}).`,
      );
    }
  }

  const typicalCondition = mostCommon(comparables.map((c) => c.condition).filter((c): c is ApartmentCondition => c !== null));
  if (subject.condition !== null && typicalCondition !== null && typicalCondition !== subject.condition) {
    differences.push(
      `Состояние — «${CONDITION_LABELS[subject.condition]}», у большинства аналогов — «${CONDITION_LABELS[typicalCondition]}».`,
    );
  }

  return differences;
}

function medianNumber(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function mostCommon<T>(values: T[]): T | null {
  const counts = new Map<T, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  let best: T | null = null;
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

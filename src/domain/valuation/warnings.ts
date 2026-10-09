// Коды предупреждений хранятся в БД (Valuation.warnings), тексты — только здесь.

export const WARNING_CODES = [
  "FEW_COMPARABLES",
  "SUSPICIOUSLY_LOW_PRICE",
  "MISSING_KEY_FIELDS",
  "STALE_LISTING",
  "POSSIBLE_DUPLICATE",
  "PRICE_CHANGED",
  "CONTRADICTORY_DATA",
  "LOW_CONFIDENCE",
  "CONDITION_MISMATCH",
] as const;
export type WarningCode = (typeof WARNING_CODES)[number];

export const WARNING_LABELS: Record<WarningCode, string> = {
  FEW_COMPARABLES: "Мало аналогов",
  SUSPICIOUSLY_LOW_PRICE: "Необычно низкая цена",
  MISSING_KEY_FIELDS: "Нет важных характеристик",
  STALE_LISTING: "Объявление давно не обновлялось",
  POSSIBLE_DUPLICATE: "Возможный дубликат",
  PRICE_CHANGED: "Цена менялась",
  CONTRADICTORY_DATA: "Противоречивые данные",
  LOW_CONFIDENCE: "Низкая уверенность оценки",
  CONDITION_MISMATCH: "Аналоги с другим ремонтом",
};

export const WARNING_DESCRIPTIONS: Record<WarningCode, string> = {
  FEW_COMPARABLES: "Аналогов меньше 8 — медиана может заметно сдвинуться от одного нового объявления.",
  SUSPICIOUSLY_LOW_PRICE:
    "Цена ниже рынка на 25% и более. Так бывает при ошибке в объявлении, проблемах с документами, долях, обременениях или мошенничестве.",
  MISSING_KEY_FIELDS: "Часть характеристик неизвестна, поэтому сравнение с аналогами менее точное.",
  STALE_LISTING: "Объявление не обновлялось более 45 дней — цена или статус могли измениться.",
  POSSIBLE_DUPLICATE: "Найдено другое объявление с теми же параметрами квартиры.",
  PRICE_CHANGED: "Цена объявления менялась — смотрите историю цены.",
  CONTRADICTORY_DATA: "Характеристики противоречат друг другу (например, этаж выше этажности дома).",
  LOW_CONFIDENCE: "Аналоги сильно отличаются по цене или по параметрам — оценка приблизительная.",
  CONDITION_MISMATCH:
    "Не нашлось достаточно аналогов с таким же уровнем ремонта. Разница в ремонте может давать до 20–25% в цене, поэтому скидка может быть кажущейся.",
};

export function isWarningCode(value: string): value is WarningCode {
  return (WARNING_CODES as readonly string[]).includes(value);
}

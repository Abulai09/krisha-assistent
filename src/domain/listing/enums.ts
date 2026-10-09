// Справочники предметной области и их русские названия.
// Значения совпадают с enum'ами Prisma, но домен от Prisma не зависит.

export const DISTRICTS = [
  "ALATAU",
  "ALMALY",
  "AUEZOV",
  "BOSTANDYK",
  "ZHETYSU",
  "MEDEU",
  "NAURYZBAY",
  "TURKSIB",
] as const;
export type District = (typeof DISTRICTS)[number];

export const DISTRICT_LABELS: Record<District, string> = {
  ALATAU: "Алатауский",
  ALMALY: "Алмалинский",
  AUEZOV: "Ауэзовский",
  BOSTANDYK: "Бостандыкский",
  ZHETYSU: "Жетысуский",
  MEDEU: "Медеуский",
  NAURYZBAY: "Наурызбайский",
  TURKSIB: "Турксибский",
};

export const BUILDING_TYPES = ["PANEL", "BRICK", "MONOLITH", "OTHER"] as const;
export type BuildingType = (typeof BUILDING_TYPES)[number];

export const BUILDING_TYPE_LABELS: Record<BuildingType, string> = {
  PANEL: "Панельный",
  BRICK: "Кирпичный",
  MONOLITH: "Монолитный",
  OTHER: "Иной",
};

// Порядок важен: используется для оценки «насколько отличается состояние».
export const CONDITIONS = ["ROUGH_FINISH", "NEEDS_REPAIR", "AVERAGE", "GOOD", "EXCELLENT"] as const;
export type ApartmentCondition = (typeof CONDITIONS)[number];

export const CONDITION_LABELS: Record<ApartmentCondition, string> = {
  ROUGH_FINISH: "Черновая отделка",
  NEEDS_REPAIR: "Требует ремонта",
  AVERAGE: "Среднее",
  GOOD: "Хорошее",
  EXCELLENT: "Свежий ремонт",
};

export const SELLER_TYPES = ["OWNER", "AGENT", "DEVELOPER"] as const;
export type SellerType = (typeof SELLER_TYPES)[number];

export const SELLER_TYPE_LABELS: Record<SellerType, string> = {
  OWNER: "Собственник",
  AGENT: "Агент",
  DEVELOPER: "Застройщик",
};

/** Варианты написания из внешних источников → код. Ключи в нижнем регистре. */
export const DISTRICT_ALIASES: Record<string, District> = Object.fromEntries(
  DISTRICTS.flatMap((code) => {
    const label = DISTRICT_LABELS[code].toLowerCase();
    return [
      [code.toLowerCase(), code],
      [label, code],
      [`${label} район`, code],
      [`${label} р-н`, code],
    ];
  }),
);

export const BUILDING_TYPE_ALIASES: Record<string, BuildingType> = {
  panel: "PANEL",
  панельный: "PANEL",
  панель: "PANEL",
  brick: "BRICK",
  кирпичный: "BRICK",
  кирпич: "BRICK",
  monolith: "MONOLITH",
  монолитный: "MONOLITH",
  монолит: "MONOLITH",
  other: "OTHER",
  иной: "OTHER",
  другой: "OTHER",
};

export const CONDITION_ALIASES: Record<string, ApartmentCondition> = {
  rough_finish: "ROUGH_FINISH",
  "черновая отделка": "ROUGH_FINISH",
  черновая: "ROUGH_FINISH",
  "свободная планировка": "ROUGH_FINISH",
  needs_repair: "NEEDS_REPAIR",
  "требует ремонта": "NEEDS_REPAIR",
  average: "AVERAGE",
  среднее: "AVERAGE",
  "не новый, но аккуратный ремонт": "AVERAGE",
  good: "GOOD",
  хорошее: "GOOD",
  excellent: "EXCELLENT",
  "свежий ремонт": "EXCELLENT",
};

export const SELLER_TYPE_ALIASES: Record<string, SellerType> = {
  owner: "OWNER",
  собственник: "OWNER",
  хозяин: "OWNER",
  agent: "AGENT",
  агент: "AGENT",
  риелтор: "AGENT",
  developer: "DEVELOPER",
  застройщик: "DEVELOPER",
};

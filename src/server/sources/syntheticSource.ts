import type { ApartmentCondition, BuildingType, District, SellerType } from "@/domain/listing/enums";
import type { RawListingInput } from "@/domain/listing/rawListingSchema";
import type { FetchContext, ListingSource, SourceStatus } from "./types";

/**
 * Генератор СИНТЕТИЧЕСКИХ объявлений для разработки и демонстрации.
 * Это не реальные квартиры: у них нет ссылок, ЖК имеют префикс «Тест-ЖК», а источник помечен isSynthetic.
 *
 * Генерация детерминирована (seed), но зависит от даты запуска: объявления появляются, снимаются
 * и снижают цену со временем. Так можно проверить историю цен, деактивацию и повторные запуски.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const EPOCH = Date.UTC(2026, 8, 1);
const TOTAL_LISTINGS = 1200;

const DISTRICT_PROFILES: Record<District, { basePricePerSqm: number; weight: number; microdistricts: string[] }> = {
  ALATAU: { basePricePerSqm: 520_000, weight: 9, microdistricts: ["Шанырак-2", "Улжан-1", "Алгабас"] },
  ALMALY: { basePricePerSqm: 1_000_000, weight: 13, microdistricts: ["Тастак-1", "Алмалы", "Центр"] },
  AUEZOV: { basePricePerSqm: 720_000, weight: 16, microdistricts: ["Аксай-1", "Жетысу-2", "Мамыр-4"] },
  BOSTANDYK: { basePricePerSqm: 1_100_000, weight: 18, microdistricts: ["Орбита-1", "Казахфильм", "Коктем-1"] },
  ZHETYSU: { basePricePerSqm: 650_000, weight: 9, microdistricts: ["Кулагер", "Айнабулак-3", "Жулдыз-1"] },
  MEDEU: { basePricePerSqm: 1_150_000, weight: 14, microdistricts: ["Самал-2", "Достык", "Горный Гигант"] },
  NAURYZBAY: { basePricePerSqm: 640_000, weight: 11, microdistricts: ["Калкаман-2", "Шугыла", "Таусамалы"] },
  TURKSIB: { basePricePerSqm: 600_000, weight: 10, microdistricts: ["Жулдыз-2", "Дорожник", "Кайрат"] },
};

const COMPLEX_WORDS = ["Береке", "Нурлы", "Алтын", "Самал", "Арман", "Достар", "Жулдыз", "Шапагат"];
const COMPLEXES_PER_DISTRICT = 3;

const CONDITION_FACTORS: Record<ApartmentCondition, number> = {
  ROUGH_FINISH: 0.86,
  NEEDS_REPAIR: 0.88,
  AVERAGE: 0.97,
  GOOD: 1.03,
  EXCELLENT: 1.1,
};

const BUILDING_FACTORS: Record<BuildingType, number> = { PANEL: 0.93, BRICK: 1, MONOLITH: 1.05, OTHER: 0.95 };

const ROOM_AREAS: Record<number, { mean: number; spread: number }> = {
  1: { mean: 40, spread: 8 },
  2: { mean: 60, spread: 12 },
  3: { mean: 84, spread: 14 },
  4: { mean: 112, spread: 18 },
  5: { mean: 150, spread: 25 },
};

/** Детерминированный генератор псевдослучайных чисел (mulberry32). */
function createRng(seed: number) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
  return {
    next,
    between: (min: number, max: number) => min + next() * (max - min),
    int: (min: number, max: number) => Math.floor(min + next() * (max - min + 1)),
    pick: <T>(weighted: [T, number][]): T => {
      const total = weighted.reduce((sum, [, w]) => sum + w, 0);
      let roll = next() * total;
      for (const [value, weight] of weighted) {
        roll -= weight;
        if (roll <= 0) return value;
      }
      return weighted[weighted.length - 1][0];
    },
  };
}

interface ComplexProfile {
  name: string;
  microdistrict: string;
  buildingType: BuildingType;
  yearBuilt: number;
  floorsTotal: number;
  priceFactor: number;
}

function complexFor(district: District, index: number): ComplexProfile {
  const districtIndex = Object.keys(DISTRICT_PROFILES).indexOf(district);
  const rng = createRng(10_000 + districtIndex * 100 + index);
  const profile = DISTRICT_PROFILES[district];
  return {
    name: `Тест-ЖК «${COMPLEX_WORDS[(districtIndex + index * 3) % COMPLEX_WORDS.length]} ${districtIndex + 1}-${index + 1}»`,
    microdistrict: profile.microdistricts[index % profile.microdistricts.length],
    buildingType: rng.pick<BuildingType>([["MONOLITH", 6], ["BRICK", 3], ["PANEL", 1]]),
    yearBuilt: rng.int(2008, 2025),
    floorsTotal: rng.int(9, 22),
    priceFactor: rng.between(0.92, 1.12),
  };
}

interface ListingSpec {
  index: number;
  activeFromDay: number;
  activeToDay: number;
  priceDropDay: number | null;
  priceDropFactor: number;
  basePriceKzt: number;
  raw: Omit<RawListingInput, "priceKzt" | "updatedAt">;
}

function buildSpec(index: number): ListingSpec {
  const rng = createRng(index * 7919 + 17);
  const district = rng.pick(Object.entries(DISTRICT_PROFILES).map(([d, p]) => [d as District, p.weight]));
  const profile = DISTRICT_PROFILES[district];

  const inComplex = rng.next() < 0.75;
  const complex = inComplex ? complexFor(district, rng.int(0, COMPLEXES_PER_DISTRICT - 1)) : null;
  const buildingType: BuildingType =
    complex?.buildingType ?? rng.pick<BuildingType>([["PANEL", 5], ["BRICK", 4], ["MONOLITH", 1], ["OTHER", 1]]);
  const yearBuilt = complex?.yearBuilt ?? rng.int(1962, 2005);
  const floorsTotal = complex?.floorsTotal ?? rng.pick([[5, 5], [9, 4], [12, 2], [4, 1]] as [number, number][]);
  const microdistrict = complex?.microdistrict ?? rng.pick(profile.microdistricts.map((m) => [m, 1] as [string, number]));

  const rooms = rng.pick<number>([[1, 30], [2, 35], [3, 25], [4, 8], [5, 2]]);
  const areaProfile = ROOM_AREAS[rooms];
  const totalArea = Math.round(rng.between(areaProfile.mean - areaProfile.spread, areaProfile.mean + areaProfile.spread) * 10) / 10;
  const floor = rng.int(1, floorsTotal);
  const condition = rng.pick<ApartmentCondition>([
    ["ROUGH_FINISH", inComplex && yearBuilt >= 2022 ? 4 : 0.5],
    ["NEEDS_REPAIR", inComplex ? 0.5 : 3],
    ["AVERAGE", 4],
    ["GOOD", 5],
    ["EXCELLENT", 3],
  ]);
  const sellerType = rng.pick<SellerType>([["OWNER", 5], ["AGENT", 4], ["DEVELOPER", inComplex && yearBuilt >= 2023 ? 2 : 0]]);

  const ageFactor = yearBuilt >= 2015 ? 1.06 : yearBuilt >= 2000 ? 1 : yearBuilt >= 1980 ? 0.94 : 0.9;
  const floorFactor = floor === 1 ? 0.94 : floor === floorsTotal && floorsTotal > 2 ? 0.97 : 1;
  const marketNoise = rng.between(0.94, 1.06);
  const dealRoll = rng.next();
  // Небольшая доля намеренно «выгодных», «подозрительных» и «завышенных» цен — чтобы рейтинг было что показывать.
  const dealFactor =
    dealRoll < 0.07 ? rng.between(0.82, 0.91) : dealRoll < 0.08 ? rng.between(0.6, 0.7) : dealRoll < 0.12 ? rng.between(1.12, 1.2) : 1;

  const pricePerSqm =
    profile.basePricePerSqm *
    (complex?.priceFactor ?? 1) *
    CONDITION_FACTORS[condition] *
    BUILDING_FACTORS[buildingType] *
    ageFactor *
    floorFactor *
    marketNoise *
    dealFactor;
  const basePriceKzt = Math.round((pricePerSqm * totalArea) / 100_000) * 100_000;

  const activeFromDay = rng.int(-150, 120);
  const activeToDay = activeFromDay + rng.int(60, 240);
  const hasDrop = rng.next() < 0.3;

  // Часть объявлений намеренно неполная или противоречивая — так выглядят реальные данные.
  const dropYear = rng.next() < 0.12;
  const dropCondition = rng.next() < 0.1;
  const dropBuilding = rng.next() < 0.05;
  const contradictory = rng.next() < 0.005;

  return {
    index,
    activeFromDay,
    activeToDay,
    priceDropDay: hasDrop ? activeFromDay + rng.int(10, 50) : null,
    priceDropFactor: rng.between(0.93, 0.97),
    basePriceKzt,
    raw: {
      externalId: `SYN-${String(index).padStart(5, "0")}`,
      url: null,
      city: "Алматы",
      dealType: "sale",
      propertyType: "apartment",
      publishedAt: new Date(EPOCH + activeFromDay * DAY_MS).toISOString(),
      totalArea,
      livingArea: rng.next() < 0.6 ? Math.round(totalArea * rng.between(0.5, 0.65) * 10) / 10 : null,
      kitchenArea: rng.next() < 0.6 ? Math.round(rng.between(7, 16) * 10) / 10 : null,
      rooms,
      district,
      microdistrict,
      address: complex ? null : `Тестовая ул., ${rng.int(1, 250)}`,
      complexName: complex?.name ?? null,
      buildingType: dropBuilding ? null : buildingType,
      yearBuilt: dropYear ? null : yearBuilt,
      floor: contradictory ? floorsTotal + 3 : floor,
      floorsTotal,
      condition: dropCondition ? null : condition,
      ceilingHeight: rng.next() < 0.5 ? Math.round(rng.between(2.6, 3.2) * 100) / 100 : null,
      sellerType,
      furnished: rng.next() < 0.4 ? rng.next() < 0.5 : null,
      description: "Синтетическое тестовое объявление. Не является реальным предложением о продаже.",
    },
  };
}

/** Повторная публикация той же квартиры другим продавцом — для проверки поиска дубликатов. */
function withDuplicates(specs: ListingSpec[]): ListingSpec[] {
  const result = [...specs];
  for (let i = 0; i < specs.length; i += 47) {
    const original = specs[i];
    const rng = createRng(original.index * 31 + 5);
    result.push({
      ...original,
      index: TOTAL_LISTINGS + i,
      activeFromDay: original.activeFromDay + rng.int(1, 20),
      basePriceKzt: Math.round((original.basePriceKzt * rng.between(0.98, 1.03)) / 100_000) * 100_000,
      raw: { ...original.raw, externalId: `SYN-D${String(original.index).padStart(5, "0")}`, sellerType: "AGENT" },
    });
  }
  return result;
}

const SPECS = withDuplicates(Array.from({ length: TOTAL_LISTINGS }, (_, index) => buildSpec(index)));

export function generateSyntheticListings(now: Date): RawListingInput[] {
  const day = Math.floor((now.getTime() - EPOCH) / DAY_MS);
  return SPECS.filter((spec) => spec.activeFromDay <= day && day < spec.activeToDay).map((spec) => {
    const dropped = spec.priceDropDay !== null && day >= spec.priceDropDay;
    const priceKzt = dropped
      ? Math.round((spec.basePriceKzt * spec.priceDropFactor) / 100_000) * 100_000
      : spec.basePriceKzt;
    const updatedDay = dropped ? spec.priceDropDay! : spec.activeFromDay;
    return { ...spec.raw, priceKzt, updatedAt: new Date(EPOCH + updatedDay * DAY_MS).toISOString() };
  });
}

export class SyntheticSource implements ListingSource {
  readonly key = "synthetic";
  readonly name = "Синтетические тестовые данные";
  readonly kind = "SYNTHETIC" as const;
  readonly isSynthetic = true;
  readonly providesFullSnapshot = true;

  async checkStatus(): Promise<SourceStatus> {
    return {
      availability: "CONNECTED",
      message: "Генератор тестовых данных. Объявления вымышлены и не являются реальными предложениями.",
    };
  }

  async fetchListings(context: FetchContext): Promise<unknown[]> {
    return generateSyntheticListings(context.now);
  }
}

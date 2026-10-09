import { createHash } from "node:crypto";
import type { ValidRawListing } from "./rawListingSchema";
import type { ApartmentCondition, BuildingType, District, SellerType } from "./enums";

/** Объявление в том виде, в котором оно сохраняется в БД. Неизвестные значения — null. */
export interface NormalizedListing {
  externalId: string;
  url: string | null;
  publishedAt: Date | null;
  sourceUpdatedAt: Date | null;
  priceKzt: bigint;
  totalArea: string;
  livingArea: string | null;
  kitchenArea: string | null;
  rooms: number;
  district: District;
  microdistrict: string | null;
  address: string | null;
  complexName: string | null;
  complexKey: string | null;
  buildingType: BuildingType | null;
  yearBuilt: number | null;
  floor: number | null;
  floorsTotal: number | null;
  condition: ApartmentCondition | null;
  ceilingHeight: string | null;
  sellerType: SellerType | null;
  furnished: boolean | null;
  description: string | null;
  fingerprint: string;
  contentHash: string;
}

const collapseSpaces = (value: string) => value.replace(/\s+/g, " ").trim();

/** «ЖК "Алтын Булак"» → "алтын булак". Нужен, чтобы разные написания одного ЖК совпадали. */
export function toComplexKey(complexName: string | null): string | null {
  if (!complexName) return null;
  const key = collapseSpaces(
    complexName
      .toLowerCase()
      .replace(/ё/g, "е")
      .replace(/["«»“”'`]/g, " ")
      .replace(/^\s*(жк|жилой комплекс)\s+/u, " "),
  );
  return key.length > 0 ? key : null;
}

export function toLocationKey(value: string | null): string | null {
  if (!value) return null;
  const key = collapseSpaces(value.toLowerCase().replace(/ё/g, "е").replace(/[.,]/g, " "));
  return key.length > 0 ? key : null;
}

/**
 * Отпечаток квартиры: одинаковый у объявлений об одной и той же квартире
 * (повторная публикация, разные продавцы). Если локация неизвестна,
 * отпечаток уникален — иначе разные квартиры ошибочно склеились бы в дубликаты.
 */
export function buildFingerprint(input: {
  sourceKey: string;
  externalId: string;
  district: District;
  complexKey: string | null;
  microdistrict: string | null;
  address: string | null;
  rooms: number;
  totalArea: number;
  floor: number | null;
  floorsTotal: number | null;
}): string {
  const locationKey = input.complexKey ?? toLocationKey(input.address) ?? null;
  if (!locationKey || input.floor === null) {
    return `uniq:${input.sourceKey}:${input.externalId}`;
  }
  const roundedArea = Math.round(input.totalArea * 2) / 2;
  const parts = [
    input.district,
    locationKey,
    toLocationKey(input.microdistrict) ?? "",
    input.rooms,
    roundedArea,
    input.floor,
    input.floorsTotal ?? "",
  ];
  return `fp:${createHash("sha1").update(parts.join("|")).digest("hex").slice(0, 20)}`;
}

const decimalString = (value: number | null) => (value === null ? null : value.toFixed(2));

export function normalizeListing(raw: ValidRawListing, sourceKey: string): NormalizedListing {
  const complexName = raw.complexName ? collapseSpaces(raw.complexName) : null;
  const complexKey = toComplexKey(complexName);
  const microdistrict = raw.microdistrict ? collapseSpaces(raw.microdistrict) : null;
  const address = raw.address ? collapseSpaces(raw.address) : null;

  const withoutHashes = {
    externalId: raw.externalId,
    url: raw.url,
    publishedAt: raw.publishedAt,
    sourceUpdatedAt: raw.updatedAt,
    priceKzt: BigInt(raw.priceKzt),
    totalArea: raw.totalArea.toFixed(2),
    livingArea: decimalString(raw.livingArea),
    kitchenArea: decimalString(raw.kitchenArea),
    rooms: raw.rooms,
    district: raw.district,
    microdistrict,
    address,
    complexName,
    complexKey,
    buildingType: raw.buildingType,
    yearBuilt: raw.yearBuilt,
    floor: raw.floor,
    floorsTotal: raw.floorsTotal,
    condition: raw.condition,
    ceilingHeight: decimalString(raw.ceilingHeight),
    sellerType: raw.sellerType,
    furnished: raw.furnished,
    description: raw.description,
  };

  const fingerprint = buildFingerprint({
    sourceKey,
    externalId: raw.externalId,
    district: raw.district,
    complexKey,
    microdistrict,
    address,
    rooms: raw.rooms,
    totalArea: raw.totalArea,
    floor: raw.floor,
    floorsTotal: raw.floorsTotal,
  });

  return { ...withoutHashes, fingerprint, contentHash: hashContent(withoutHashes) };
}

/** Хеш содержимого: если он не изменился, объявление не перезаписывается. */
export function hashContent(content: Record<string, unknown>): string {
  const stable = Object.keys(content)
    .sort()
    .map((key) => {
      const value = content[key];
      const serialized =
        value instanceof Date ? value.toISOString() : typeof value === "bigint" ? value.toString() : value;
      return [key, serialized];
    });
  return createHash("sha256").update(JSON.stringify(stable)).digest("hex");
}

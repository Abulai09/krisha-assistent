import { z } from "zod";
import { CONDITIONS, DISTRICTS } from "@/domain/listing/enums";

// Фильтры каталога приходят из URL (?district=...&rooms=...). URL — внешний ввод,
// поэтому всё проверяется; некорректное значение просто игнорируется, а не ломает страницу.

export const DEFAULT_MIN_DISCOUNT = 8;
export const CATALOG_PAGE_SIZE = 24;

const blankToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : Array.isArray(value) ? value[0] : value;

/** «30 000 000», «35,5» → число: люди пишут пробелы между разрядами и запятую вместо точки. */
const normalizeNumber = (value: unknown) => {
  const raw = blankToUndefined(value);
  return typeof raw === "string" ? raw.replace(/[\s\u00a0]/g, "").replace(",", ".") : raw;
};

const optionalNumber = (min: number, max: number) =>
  z.preprocess(normalizeNumber, z.coerce.number().min(min).max(max).optional()).catch(undefined);

/** Порог, с которого число — уже тенге, а не миллионы: квартир дороже 10 млрд ₸ не бывает. */
const PRICE_IN_KZT_FROM = 10_000;

/** Цена в миллионах тенге. Введённую в тенге (30 000 000) переводим, а не выбрасываем молча. */
const optionalPriceMillions = z
  .preprocess(
    normalizeNumber,
    z.coerce
      .number()
      .min(0)
      .transform((value) => (value >= PRICE_IN_KZT_FROM ? value / 1_000_000 : value))
      .pipe(z.number().max(PRICE_IN_KZT_FROM))
      .optional(),
  )
  .catch(undefined);

const optionalEnum = <T extends readonly [string, ...string[]]>(values: T) =>
  z.preprocess(blankToUndefined, z.enum(values).optional()).catch(undefined);

export const catalogFiltersSchema = z.object({
  mode: z.preprocess(blankToUndefined, z.enum(["deal", "discount"]).default("deal")).catch("deal"),
  district: optionalEnum(DISTRICTS),
  rooms: optionalEnum(["1", "2", "3", "4", "5"] as const),
  /** Цена в миллионах тенге — так её вводят люди. */
  priceMin: optionalPriceMillions,
  priceMax: optionalPriceMillions,
  areaMin: optionalNumber(0, 1_000),
  areaMax: optionalNumber(0, 1_000),
  /** "any" — показать все объявления, включая без оценки. По умолчанию — от 8%. */
  discount: z
    .preprocess(blankToUndefined, z.union([z.literal("any"), z.coerce.number().min(-100).max(100)]).optional())
    .catch(undefined),
  scoreMin: optionalNumber(0, 100),
  condition: optionalEnum(CONDITIONS),
  complex: z.preprocess(blankToUndefined, z.string().trim().max(150).optional()).catch(undefined),
  floor: optionalEnum(["not_first", "not_last", "middle"] as const),
  yearMin: optionalNumber(1900, 2100),
  yearMax: optionalNumber(1900, 2100),
  confidence: optionalEnum(["MEDIUM", "HIGH"] as const),
  risk: optionalEnum(["LOW", "MEDIUM"] as const),
  published: optionalEnum(["1", "7", "30", "90"] as const),
  page: z.preprocess(blankToUndefined, z.coerce.number().int().min(1).max(1_000).default(1)).catch(1),
});

export type CatalogFilters = z.infer<typeof catalogFiltersSchema>;

export function parseCatalogFilters(searchParams: Record<string, string | string[] | undefined>): CatalogFilters {
  const filters = catalogFiltersSchema.parse(searchParams);
  // «от 50 до 30» — почти всегда перепутанные поля, а не желание увидеть пустой список.
  for (const [min, max] of RANGES) {
    const low = filters[min];
    const high = filters[max];
    if (low !== undefined && high !== undefined && low > high) {
      filters[min] = high;
      filters[max] = low;
    }
  }
  return filters;
}

const RANGES = [
  ["priceMin", "priceMax"],
  ["areaMin", "areaMax"],
  ["yearMin", "yearMax"],
] as const;

/** Минимальная скидка с учётом значения по умолчанию; null — фильтр по скидке выключен. */
export function effectiveMinDiscount(filters: CatalogFilters): number | null {
  if (filters.discount === "any") return null;
  return filters.discount ?? DEFAULT_MIN_DISCOUNT;
}

/** Собирает query string, пропуская пустые значения и значения по умолчанию. */
export function toCatalogQuery(filters: Partial<Record<keyof CatalogFilters, string | number | undefined>>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === "") continue;
    if (key === "mode" && value === "deal") continue;
    if (key === "page" && Number(value) === 1) continue;
    params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

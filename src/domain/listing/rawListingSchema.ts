import { z } from "zod";
import {
  BUILDING_TYPE_ALIASES,
  CONDITION_ALIASES,
  DISTRICT_ALIASES,
  SELLER_TYPE_ALIASES,
} from "./enums";

// Формат входящего объявления от любого источника (CSV, JSON, будущий API).
// Внешним данным не доверяем: всё проверяется и приводится к строгим типам.

export const LISTING_LIMITS = {
  minPriceKzt: 1_000_000,
  maxPriceKzt: 10_000_000_000,
  minArea: 10,
  maxArea: 1_000,
  maxRooms: 20,
  minYear: 1900,
  maxYearAhead: 5,
  maxFloor: 200,
  maxTextLength: 5_000,
} as const;

const ALMATY_NAMES = new Set(["алматы", "almaty", "алма-ата", "г. алматы"]);

/** "" / "  " / undefined → null, чтобы CSV-пропуски не превращались в 0 или "". */
const emptyToNull = (value: unknown) => {
  if (value === undefined || value === null) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  return value;
};

const optional = <T extends z.ZodType>(schema: T) => z.preprocess(emptyToNull, schema.nullable());

const numberLike = z.union([z.number(), z.string().trim()]).transform((value, ctx) => {
  const parsed = typeof value === "number" ? value : Number(value.replace(/\s/g, "").replace(",", "."));
  if (!Number.isFinite(parsed)) {
    ctx.addIssue({ code: "custom", message: "Ожидалось число" });
    return z.NEVER;
  }
  return parsed;
});

const intInRange = (min: number, max: number) =>
  numberLike.pipe(z.number().int("Ожидалось целое число").min(min).max(max));

const areaInRange = numberLike.pipe(
  z
    .number()
    .min(LISTING_LIMITS.minArea, `Площадь меньше ${LISTING_LIMITS.minArea} м²`)
    .max(LISTING_LIMITS.maxArea, `Площадь больше ${LISTING_LIMITS.maxArea} м²`)
    .transform((value) => Math.round(value * 100) / 100),
);

const boundedText = (max = 255) => z.string().trim().max(max);

const enumFromAliases = <T extends string>(aliases: Record<string, T>, label: string) =>
  z
    .string()
    .trim()
    .transform((value, ctx) => {
      const code = aliases[value.toLowerCase()];
      if (!code) {
        ctx.addIssue({ code: "custom", message: `Неизвестное значение поля «${label}»: ${value}` });
        return z.NEVER;
      }
      return code;
    });

const dateLike = z.union([z.string().trim(), z.date()]).transform((value, ctx) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    ctx.addIssue({ code: "custom", message: "Некорректная дата" });
    return z.NEVER;
  }
  return date;
});

const booleanLike = z.union([z.boolean(), z.string().trim()]).transform((value, ctx) => {
  if (typeof value === "boolean") return value;
  const normalized = value.toLowerCase();
  if (["true", "1", "да", "yes"].includes(normalized)) return true;
  if (["false", "0", "нет", "no"].includes(normalized)) return false;
  ctx.addIssue({ code: "custom", message: "Ожидалось да/нет" });
  return z.NEVER;
});

const httpUrl = z
  .string()
  .trim()
  .max(2_000)
  .refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === "https:" || url.protocol === "http:";
    } catch {
      return false;
    }
  }, "Ссылка должна начинаться с http:// или https://");

export const rawListingSchema = z
  .object({
    externalId: z.preprocess(
      (value) => (typeof value === "number" ? String(value) : value),
      z.string().trim().min(1, "Нет идентификатора объявления").max(100),
    ),
    url: optional(httpUrl),
    city: optional(boundedText(100)),
    dealType: optional(boundedText(30)),
    propertyType: optional(boundedText(30)),
    publishedAt: optional(dateLike),
    updatedAt: optional(dateLike),
    priceKzt: intInRange(LISTING_LIMITS.minPriceKzt, LISTING_LIMITS.maxPriceKzt),
    totalArea: areaInRange,
    livingArea: optional(areaInRange),
    kitchenArea: optional(numberLike.pipe(z.number().min(2).max(200))),
    rooms: intInRange(1, LISTING_LIMITS.maxRooms),
    district: enumFromAliases(DISTRICT_ALIASES, "Район"),
    microdistrict: optional(boundedText(120)),
    address: optional(boundedText(255)),
    complexName: optional(boundedText(150)),
    buildingType: optional(enumFromAliases(BUILDING_TYPE_ALIASES, "Тип дома")),
    yearBuilt: optional(
      intInRange(LISTING_LIMITS.minYear, new Date().getFullYear() + LISTING_LIMITS.maxYearAhead),
    ),
    floor: optional(intInRange(-2, LISTING_LIMITS.maxFloor)),
    floorsTotal: optional(intInRange(1, LISTING_LIMITS.maxFloor)),
    condition: optional(enumFromAliases(CONDITION_ALIASES, "Состояние")),
    ceilingHeight: optional(numberLike.pipe(z.number().min(2).max(8))),
    sellerType: optional(enumFromAliases(SELLER_TYPE_ALIASES, "Продавец")),
    furnished: optional(booleanLike),
    description: optional(z.string().trim().max(LISTING_LIMITS.maxTextLength)),
  })
  .superRefine((listing, ctx) => {
    if (listing.city && !ALMATY_NAMES.has(listing.city.toLowerCase())) {
      ctx.addIssue({ code: "custom", path: ["city"], message: "Поддерживается только Алматы" });
    }
    if (listing.dealType && !["sale", "продажа"].includes(listing.dealType.toLowerCase())) {
      ctx.addIssue({ code: "custom", path: ["dealType"], message: "Поддерживается только продажа (не аренда)" });
    }
    if (listing.propertyType && !["apartment", "квартира"].includes(listing.propertyType.toLowerCase())) {
      ctx.addIssue({ code: "custom", path: ["propertyType"], message: "Поддерживаются только квартиры" });
    }
  });

export type RawListingInput = z.input<typeof rawListingSchema>;
export type ValidRawListing = z.output<typeof rawListingSchema>;

export interface ListingValidationError {
  externalId: string | null;
  issues: string[];
}

export function validateRawListing(
  input: unknown,
): { ok: true; listing: ValidRawListing } | { ok: false; error: ListingValidationError } {
  const result = rawListingSchema.safeParse(input);
  if (result.success) return { ok: true, listing: result.data };

  const externalId =
    input && typeof input === "object" && "externalId" in input ? String(input.externalId ?? "") || null : null;
  return {
    ok: false,
    error: {
      externalId,
      issues: result.error.issues.map((issue) =>
        issue.path.length > 0 ? `${issue.path.join(".")}: ${issue.message}` : issue.message,
      ),
    },
  };
}

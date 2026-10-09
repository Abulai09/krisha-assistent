import { describe, expect, it } from "vitest";
import { assignDuplicates } from "@/domain/listing/duplicates";
import { normalizeListing, toComplexKey } from "@/domain/listing/normalize";
import { validateRawListing } from "@/domain/listing/rawListingSchema";

const validRaw = {
  externalId: "A-1",
  url: "https://example.com/a/1",
  priceKzt: "42 000 000",
  totalArea: "60,5",
  rooms: "2",
  district: "Бостандыкский район",
  complexName: "ЖК «Алтын Булак»",
  buildingType: "монолитный",
  yearBuilt: "2018",
  floor: "5",
  floorsTotal: "12",
  condition: "свежий ремонт",
  furnished: "да",
  livingArea: "",
};

function normalize(input: Record<string, unknown>) {
  const result = validateRawListing(input);
  if (!result.ok) throw new Error(result.error.issues.join("; "));
  return normalizeListing(result.listing, "test");
}

describe("валидация входящих объявлений", () => {
  it("принимает корректное объявление и приводит типы", () => {
    const listing = normalize(validRaw);
    expect(listing.priceKzt).toBe(42_000_000n);
    expect(listing.totalArea).toBe("60.50");
    expect(listing.rooms).toBe(2);
    expect(listing.district).toBe("BOSTANDYK");
    expect(listing.buildingType).toBe("MONOLITH");
    expect(listing.condition).toBe("EXCELLENT");
    expect(listing.furnished).toBe(true);
  });

  it("пустые значения становятся null, а не выдумываются", () => {
    const listing = normalize({ ...validRaw, yearBuilt: "", condition: undefined });
    expect(listing.yearBuilt).toBeNull();
    expect(listing.condition).toBeNull();
    expect(listing.livingArea).toBeNull();
  });

  it.each([
    [{ priceKzt: "0" }, "priceKzt"],
    [{ totalArea: "abc" }, "totalArea"],
    [{ district: "Несуществующий" }, "district"],
    [{ externalId: "" }, "externalId"],
    [{ url: "javascript:alert(1)" }, "url"],
    [{ city: "Астана" }, "city"],
    [{ dealType: "аренда" }, "dealType"],
    [{ propertyType: "комната" }, "propertyType"],
  ])("отклоняет некорректные данные: %o", (patch, field) => {
    const result = validateRawListing({ ...validRaw, ...patch });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.issues.join(" ")).toContain(field);
  });

  it("не принимает объявление без обязательных полей", () => {
    const result = validateRawListing({ externalId: "X" });
    expect(result.ok).toBe(false);
  });
});

describe("нормализация", () => {
  it("разные написания ЖК дают один ключ", () => {
    expect(toComplexKey("ЖК «Алтын Булак»")).toBe("алтын булак");
    expect(toComplexKey('жк "Алтын  Булак"')).toBe("алтын булак");
    expect(toComplexKey("  ")).toBeNull();
  });

  it("одинаковое содержимое — одинаковый хеш; изменение цены — другой", () => {
    const a = normalize(validRaw);
    const b = normalize(validRaw);
    const c = normalize({ ...validRaw, priceKzt: 41_000_000 });
    expect(a.contentHash).toBe(b.contentHash);
    expect(a.contentHash).not.toBe(c.contentHash);
  });

  it("одна квартира в разных объявлениях — одинаковый отпечаток", () => {
    const a = normalize(validRaw);
    const b = normalize({ ...validRaw, externalId: "B-2", priceKzt: 43_000_000, totalArea: "60.6" });
    expect(a.fingerprint).toBe(b.fingerprint);
  });

  it("без локации отпечаток уникален (не склеивает разные квартиры)", () => {
    const base = { ...validRaw, complexName: null, address: null };
    const a = normalize(base);
    const b = normalize({ ...base, externalId: "B-2" });
    expect(a.fingerprint).not.toBe(b.fingerprint);
  });
});

describe("обработка дубликатов", () => {
  const day = (n: number) => new Date(Date.UTC(2026, 8, n));

  it("оригинал — самое раннее объявление, остальные — дубликаты", () => {
    const result = assignDuplicates([
      { id: "b", fingerprint: "fp:1", firstSeenAt: day(5), isSynthetic: false },
      { id: "a", fingerprint: "fp:1", firstSeenAt: day(1), isSynthetic: false },
      { id: "c", fingerprint: "fp:2", firstSeenAt: day(1), isSynthetic: false },
    ]);
    expect(result.get("a")).toBeNull();
    expect(result.get("b")).toBe("a");
    expect(result.get("c")).toBeNull();
  });

  it("уникальные отпечатки и разные наборы данных не склеиваются", () => {
    const result = assignDuplicates([
      { id: "a", fingerprint: "uniq:s:1", firstSeenAt: day(1), isSynthetic: false },
      { id: "b", fingerprint: "fp:1", firstSeenAt: day(1), isSynthetic: true },
      { id: "c", fingerprint: "fp:1", firstSeenAt: day(2), isSynthetic: false },
    ]);
    expect([...result.values()].every((value) => value === null)).toBe(true);
  });
});

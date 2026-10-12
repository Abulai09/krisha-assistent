import { describe, expect, it } from "vitest";
import { parseCatalogFilters } from "@/lib/validation/catalogFilters";

const price = (params: Record<string, string>) => {
  const { priceMin, priceMax } = parseCatalogFilters(params);
  return { priceMin, priceMax };
};

describe("фильтры каталога: ввод людей", () => {
  it("цена в миллионах — как есть", () => {
    expect(price({ priceMin: "30", priceMax: "50" })).toEqual({ priceMin: 30, priceMax: 50 });
  });

  it("цена, введённая в тенге, переводится в миллионы, а не выбрасывается", () => {
    expect(price({ priceMin: "25000000", priceMax: "30 000 000" })).toEqual({ priceMin: 25, priceMax: 30 });
  });

  it("запятая и пробелы не ломают число", () => {
    expect(price({ priceMin: " 20 ", priceMax: "35,5" })).toEqual({ priceMin: 20, priceMax: 35.5 });
    expect(parseCatalogFilters({ areaMin: "45,5" }).areaMin).toBe(45.5);
  });

  it("перепутанные «от» и «до» меняются местами", () => {
    expect(price({ priceMin: "50", priceMax: "30" })).toEqual({ priceMin: 30, priceMax: 50 });
    const { yearMin, yearMax } = parseCatalogFilters({ yearMin: "2020", yearMax: "2000" });
    expect({ yearMin, yearMax }).toEqual({ yearMin: 2000, yearMax: 2020 });
  });

  it("мусор и отрицательные значения игнорируются", () => {
    expect(price({ priceMin: "дорого", priceMax: "-5" })).toEqual({ priceMin: undefined, priceMax: undefined });
  });
});

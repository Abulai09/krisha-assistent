import { describe, expect, it } from "vitest";
import { detectFormat, parseCsv, parseImportFile } from "@/server/sources/importFile";

const LIMITS = { maxBytes: 1024 * 1024, maxRows: 100 };

describe("разбор CSV", () => {
  it("поддерживает кавычки, запятые и переносы внутри значений", () => {
    const rows = parseCsv('externalId,complexName,description\n1,"ЖК ""Нурлы""","Первая строка\nвторая, с запятой"\n');
    expect(rows).toHaveLength(1);
    expect(rows[0].complexName).toBe('ЖК "Нурлы"');
    expect(rows[0].description).toBe("Первая строка\nвторая, с запятой");
  });

  it("определяет разделитель «;» (экспорт из Excel)", () => {
    const rows = parseCsv("externalId;priceKzt\r\nA;42000000\r\n");
    expect(rows[0]).toMatchObject({ externalId: "A", priceKzt: "42000000" });
  });

  it("отбрасывает опасные ключи (защита от prototype pollution)", () => {
    const rows = parseCsv("externalId,__proto__\nA,polluted\n");
    expect(Object.keys(rows[0])).toEqual(["externalId"]);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("отклоняет повторяющиеся колонки и незакрытые кавычки", () => {
    expect(() => parseCsv("a,a\n1,2\n")).toThrow(/повторяются/);
    expect(() => parseCsv('a\n"oops\n')).toThrow(/кавычка/);
  });
});

describe("разбор файла импорта", () => {
  it("JSON: массив или { listings: [...] }", () => {
    expect(parseImportFile('[{"externalId":"A"}]', "json", LIMITS)).toHaveLength(1);
    expect(parseImportFile('{"listings":[{"externalId":"A"},{"externalId":"B"}]}', "json", LIMITS)).toHaveLength(2);
  });

  it("JSON: ключ __proto__ не попадает в запись", () => {
    const [row] = parseImportFile('[{"externalId":"A","__proto__":{"isAdmin":true}}]', "json", LIMITS);
    expect(Object.keys(row)).toEqual(["externalId"]);
    expect(({} as Record<string, unknown>).isAdmin).toBeUndefined();
  });

  it("отклоняет некорректный JSON, пустой файл, лишние строки и большой размер", () => {
    expect(() => parseImportFile("{oops", "json", LIMITS)).toThrow(/JSON/);
    expect(() => parseImportFile("[]", "json", LIMITS)).toThrow(/нет объявлений/);
    expect(() => parseImportFile("[1]", "json", LIMITS)).toThrow(/не является объектом/);
    const many = JSON.stringify(Array.from({ length: 101 }, (_, i) => ({ externalId: String(i) })));
    expect(() => parseImportFile(many, "json", LIMITS)).toThrow(/Слишком много/);
    expect(() => parseImportFile("x".repeat(2000), "csv", { maxBytes: 1000, maxRows: 10 })).toThrow(/большой/);
  });

  it("формат определяется по расширению, остальные файлы отклоняются", () => {
    expect(detectFormat("data.CSV")).toBe("csv");
    expect(detectFormat("data.json")).toBe("json");
    expect(() => detectFormat("data.xlsx")).toThrow();
    expect(() => detectFormat("evil.json.exe")).toThrow();
  });
});

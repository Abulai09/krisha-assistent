import { describe, expect, it } from "vitest";
import { formatBytes } from "@/domain/format";
import { storageUsage } from "@/domain/storage";

const MB = 1024 * 1024;

describe("заполненность базы", () => {
  it("до 70% — норма, с 70% — предупреждение, с 90% — критично", () => {
    expect(storageUsage(25 * MB, 500 * MB)).toEqual({ percent: 5, level: "ok" });
    expect(storageUsage(350 * MB, 500 * MB)).toEqual({ percent: 70, level: "warning" });
    expect(storageUsage(450 * MB, 500 * MB)).toEqual({ percent: 90, level: "critical" });
  });

  it("сверх лимита процент больше 100", () => {
    expect(storageUsage(600 * MB, 500 * MB).percent).toBe(120);
  });
});

describe("размер в байтах", () => {
  it("переводит в КБ/МБ/ГБ с одним знаком", () => {
    expect(formatBytes(512)).toBe("512 Б");
    expect(formatBytes(1536)).toBe("1,5 КБ");
    expect(formatBytes(25.34 * MB)).toBe("25,3 МБ");
    expect(formatBytes(500 * MB)).toBe("500 МБ");
    expect(formatBytes(2 * 1024 * MB)).toBe("2 ГБ");
  });
});

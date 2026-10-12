import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { pgConnectionConfig } from "@/lib/pgConfig";

describe("настройки подключения к БД", () => {
  it("без sslrootcert адрес передаётся как есть", () => {
    const url = "postgresql://u:p@localhost:5434/db?schema=public";
    expect(pgConnectionConfig(url)).toEqual({ connectionString: url });
  });

  it("сертификат читается от корня проекта и проверяет сервер; ssl-параметры убираются из адреса", () => {
    const readFile = vi.fn(() => "-----BEGIN CERTIFICATE-----");
    const config = pgConnectionConfig(
      "postgresql://u:p@pooler.example.com:5432/postgres?schema=deal_finder&sslmode=verify-full&sslrootcert=certs/ca.crt",
      readFile,
    );

    expect(readFile).toHaveBeenCalledWith(path.resolve(process.cwd(), "certs/ca.crt"));
    expect(config.ssl).toEqual({ ca: "-----BEGIN CERTIFICATE-----", rejectUnauthorized: true });
    expect(config.connectionString).toBe("postgresql://u:p@pooler.example.com:5432/postgres?schema=deal_finder");
  });

  it("нет файла сертификата — понятная ошибка, а не подключение без проверки", () => {
    expect(() => pgConnectionConfig("postgresql://u:p@h/db?sslmode=verify-full&sslrootcert=certs/missing.crt")).toThrow(
      /ENOENT/,
    );
  });
});

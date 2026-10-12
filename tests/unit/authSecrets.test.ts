import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { verifySitePassword } from "@/server/auth/session";
import { credentialsMatch } from "@/server/auth/credentials";

describe("общий пароль сайта", () => {
  it("принимает только точное совпадение", () => {
    expect(verifySitePassword("ADMIN2399", "ADMIN2399")).toBe(true);
    expect(verifySitePassword("admin2399", "ADMIN2399")).toBe(false);
    expect(verifySitePassword("", "ADMIN2399")).toBe(false);
    expect(verifySitePassword("x".repeat(1000), "ADMIN2399")).toBe(false);
  });
});

describe("личный пароль администратора", () => {
  it("в хеше нет самого пароля, и проверка находит только верный пароль", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(hash).not.toContain("correct");
    expect(await verifyPassword("correct horse battery", hash)).toBe(true);
    expect(await verifyPassword("correct horse batterY", hash)).toBe(false);
  });

  it("одинаковые пароли дают разные хеши (соль)", async () => {
    expect(await hashPassword("same-password-123")).not.toBe(await hashPassword("same-password-123"));
  });

  it("короткий пароль не принимается, пустой хеш или мусор — не пускают", async () => {
    await expect(hashPassword("short")).rejects.toThrow("от 12");
    expect(await verifyPassword("anything-long-enough", null)).toBe(false);
    expect(await verifyPassword("anything-long-enough", "plain-text")).toBe(false);
  });
});

describe("какой пароль подходит к аккаунту", () => {
  const SITE = "ADMIN2399";

  it("администратору — только личный пароль, общий не подходит", async () => {
    const admin = { role: "ADMIN", passwordHash: await hashPassword("admin-personal-pass") };
    expect(await credentialsMatch(admin, "admin-personal-pass", SITE)).toBe(true);
    expect(await credentialsMatch(admin, SITE, SITE)).toBe(false);
  });

  it("обычному пользователю и новому логину — общий пароль", async () => {
    expect(await credentialsMatch({ role: "USER", passwordHash: null }, SITE, SITE)).toBe(true);
    expect(await credentialsMatch(null, SITE, SITE)).toBe(true);
    expect(await credentialsMatch({ role: "USER", passwordHash: null }, "wrong", SITE)).toBe(false);
    expect(await credentialsMatch({ role: "USER", passwordHash: null }, SITE, null)).toBe(false);
  });

  it("неизвестная роль или личный пароль у USER — отказ, а не вход по общему паролю", async () => {
    expect(await credentialsMatch({ role: undefined as unknown as string, passwordHash: "x" }, SITE, SITE)).toBe(false);
    expect(await credentialsMatch({ role: "USER", passwordHash: "scrypt$..." }, SITE, SITE)).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { LoginRateLimiter, verifySitePassword } from "@/server/auth/session";
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

describe("ограничение попыток входа", () => {
  const NOW = new Date("2026-10-01T12:00:00Z").getTime();

  it("блокирует после N неудач и разблокирует после окна", () => {
    const limiter = new LoginRateLimiter(3, 60_000);
    for (let i = 0; i < 3; i++) limiter.recordFailure("ip", NOW + i);
    expect(limiter.isBlocked("ip", NOW + 10)).toBe(true);
    expect(limiter.isBlocked("other-ip", NOW + 10)).toBe(false);
    expect(limiter.isBlocked("ip", NOW + 61_000)).toBe(false);
  });

  it("успешный вход сбрасывает счётчик", () => {
    const limiter = new LoginRateLimiter(2, 60_000);
    limiter.recordFailure("ip", 1);
    limiter.recordFailure("ip", 2);
    limiter.reset("ip");
    expect(limiter.isBlocked("ip", 3)).toBe(false);
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

import { describe, expect, it } from "vitest";
import {
  createSessionValue,
  LoginRateLimiter,
  SESSION_TTL_MS,
  verifyAdminToken,
  verifySessionValue,
} from "@/server/auth/session";

const SECRET = "s".repeat(40);
const NOW = new Date("2026-10-01T12:00:00Z");

describe("токен администратора", () => {
  it("принимает только точное совпадение", () => {
    expect(verifyAdminToken("correct-token-123456", "correct-token-123456")).toBe(true);
    expect(verifyAdminToken("correct-token-12345", "correct-token-123456")).toBe(false);
    expect(verifyAdminToken("", "correct-token-123456")).toBe(false);
    expect(verifyAdminToken("x".repeat(1000), "correct-token-123456")).toBe(false);
  });
});

describe("сессия администратора", () => {
  it("подписанная сессия действительна до истечения срока", () => {
    const { value } = createSessionValue(SECRET, NOW);
    expect(verifySessionValue(value, SECRET, NOW)).toBe(true);
    expect(verifySessionValue(value, SECRET, new Date(NOW.getTime() + SESSION_TTL_MS + 1))).toBe(false);
  });

  it("подделка срока или подписи отклоняется", () => {
    const { value } = createSessionValue(SECRET, NOW);
    const [version, , nonce, signature] = value.split(".");
    const extended = `${version}.${NOW.getTime() + 10 * SESSION_TTL_MS}.${nonce}.${signature}`;
    expect(verifySessionValue(extended, SECRET, NOW)).toBe(false);
    expect(verifySessionValue(`${value}x`, SECRET, NOW)).toBe(false);
  });

  it("сессия, подписанная другим секретом, недействительна", () => {
    const { value } = createSessionValue("other-secret".repeat(4), NOW);
    expect(verifySessionValue(value, SECRET, NOW)).toBe(false);
  });

  it("мусор вместо cookie не ломает проверку", () => {
    for (const junk of [undefined, "", "a.b.c", "v1.notanumber.n.s", "x".repeat(500)]) {
      expect(verifySessionValue(junk, SECRET, NOW)).toBe(false);
    }
  });
});

describe("ограничение попыток входа", () => {
  it("блокирует после N неудач и разблокирует после окна", () => {
    const limiter = new LoginRateLimiter(3, 60_000);
    const start = NOW.getTime();
    for (let i = 0; i < 3; i++) limiter.recordFailure("ip", start + i);
    expect(limiter.isBlocked("ip", start + 10)).toBe(true);
    expect(limiter.isBlocked("other-ip", start + 10)).toBe(false);
    expect(limiter.isBlocked("ip", start + 61_000)).toBe(false);
  });

  it("успешный вход сбрасывает счётчик", () => {
    const limiter = new LoginRateLimiter(2, 60_000);
    limiter.recordFailure("ip", 1);
    limiter.recordFailure("ip", 2);
    limiter.reset("ip");
    expect(limiter.isBlocked("ip", 3)).toBe(false);
  });
});

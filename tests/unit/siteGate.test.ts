import { describe, expect, it, vi } from "vitest";
import { ApprovalCache, canEnter, isPublicPath, type GateInput } from "@/server/auth/siteGate";
import { ADMIN_SESSION_TTL_MS, createUserSessionValue, USER_SESSION_TTL_MS, verifyUserSessionValue } from "@/server/auth/session";

const SECRET = "s".repeat(40);
const NOW = new Date("2026-10-12T12:00:00Z");

describe("сессия пользователя", () => {
  it("хранит id пользователя и истекает через 30 дней", () => {
    const { value } = createUserSessionValue(SECRET, "user1", NOW);
    expect(verifyUserSessionValue(value, SECRET, NOW)).toBe("user1");
    expect(verifyUserSessionValue(value, SECRET, new Date(NOW.getTime() + USER_SESSION_TTL_MS + 1))).toBeNull();
  });

  it("подменить id пользователя или подпись нельзя", () => {
    const { value } = createUserSessionValue(SECRET, "user1", NOW);
    expect(verifyUserSessionValue(value.replace("user1", "user2"), SECRET, NOW)).toBeNull();
    expect(verifyUserSessionValue(value, "x".repeat(40), NOW)).toBeNull();
  });

  it("сессия администратора короче — 12 часов", () => {
    const { value } = createUserSessionValue(SECRET, "admin1", NOW, ADMIN_SESSION_TTL_MS);
    expect(verifyUserSessionValue(value, SECRET, new Date(NOW.getTime() + ADMIN_SESSION_TTL_MS - 1))).toBe("admin1");
    expect(verifyUserSessionValue(value, SECRET, new Date(NOW.getTime() + ADMIN_SESSION_TTL_MS + 1))).toBeNull();
  });

  it("мусор вместо cookie не ломает проверку", () => {
    for (const junk of [undefined, "", "a.b.c", "u1.id.notanumber.sig", "x".repeat(500)]) {
      expect(verifyUserSessionValue(junk, SECRET, NOW)).toBeNull();
    }
  });
});

describe("кого пускать на сайт", () => {
  const userCookie = createUserSessionValue(SECRET, "user1", NOW).value;
  const base: GateInput = {
    pathname: "/listings",
    userCookie: undefined,
    sessionSecret: SECRET,
    now: NOW,
    isApproved: async () => true,
  };

  it("вход и регистрация открыты всем, «Управление» — нет", async () => {
    for (const path of ["/login", "/register/"]) expect(await canEnter({ ...base, pathname: path })).toBe(true);
    expect(await canEnter({ ...base, pathname: "/admin" })).toBe(false);
    expect(isPublicPath("/")).toBe(false);
    expect(isPublicPath("/login-fake")).toBe(false);
  });

  it("без входа остальные страницы закрыты", async () => {
    expect(await canEnter(base)).toBe(false);
    expect(await canEnter({ ...base, pathname: "/" })).toBe(false);
  });

  it("одобренный пользователь проходит, ожидающий или заблокированный — нет", async () => {
    expect(await canEnter({ ...base, userCookie })).toBe(true);
    expect(await canEnter({ ...base, userCookie, isApproved: async () => false })).toBe(false);
  });
});

describe("кэш статуса пользователя", () => {
  it("не ходит в базу повторно до истечения срока, потом перечитывает", async () => {
    const load = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const cache = new ApprovalCache(load, 30_000);
    expect(await cache.isApproved("u", 0)).toBe(true);
    expect(await cache.isApproved("u", 29_999)).toBe(true);
    expect(load).toHaveBeenCalledTimes(1);
    expect(await cache.isApproved("u", 30_000)).toBe(false);
  });
});

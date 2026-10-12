import { describe, expect, it, vi } from "vitest";
import { AccessCache, canEnter, isPublicPath, type GateInput } from "@/server/auth/siteGate";
import { ADMIN_SESSION_TTL_MS, createUserSessionValue, USER_SESSION_TTL_MS, verifyUserSessionValue } from "@/server/auth/session";

const SECRET = "s".repeat(40);
const NOW = new Date("2026-10-12T12:00:00Z");

describe("сессия пользователя", () => {
  it("хранит id пользователя и истекает через 30 дней", () => {
    const { value } = createUserSessionValue(SECRET, { userId: "user1", sessionVersion: 3 }, NOW);
    expect(verifyUserSessionValue(value, SECRET, NOW)).toEqual({ userId: "user1", sessionVersion: 3 });
    expect(verifyUserSessionValue(value, SECRET, new Date(NOW.getTime() + USER_SESSION_TTL_MS + 1))).toBeNull();
  });

  it("подменить id пользователя, версию сессий или подпись нельзя", () => {
    const { value } = createUserSessionValue(SECRET, { userId: "user1", sessionVersion: 3 }, NOW);
    expect(verifyUserSessionValue(value.replace("user1", "user2"), SECRET, NOW)).toBeNull();
    expect(verifyUserSessionValue(value.replace("user1.3.", "user1.4."), SECRET, NOW)).toBeNull();
    expect(verifyUserSessionValue(value, "x".repeat(40), NOW)).toBeNull();
  });

  it("сессия администратора короче — 12 часов", () => {
    const { value } = createUserSessionValue(SECRET, { userId: "admin1", sessionVersion: 0 }, NOW, ADMIN_SESSION_TTL_MS);
    expect(verifyUserSessionValue(value, SECRET, new Date(NOW.getTime() + ADMIN_SESSION_TTL_MS - 1))?.userId).toBe("admin1");
    expect(verifyUserSessionValue(value, SECRET, new Date(NOW.getTime() + ADMIN_SESSION_TTL_MS + 1))).toBeNull();
  });

  it("мусор вместо cookie не ломает проверку", () => {
    for (const junk of [undefined, "", "a.b.c", "u1.user1.1234567890123.sig", "u2.user1.x.1234567890123.sig", "x".repeat(500)]) {
      expect(verifyUserSessionValue(junk, SECRET, NOW)).toBeNull();
    }
  });
});

describe("кого пускать на сайт", () => {
  const userCookie = createUserSessionValue(SECRET, { userId: "user1", sessionVersion: 2 }, NOW).value;
  const base: GateInput = {
    pathname: "/listings",
    userCookie: undefined,
    sessionSecret: SECRET,
    now: NOW,
    loadAccess: async () => ({ approved: true, sessionVersion: 2 }),
  };

  it("вход и регистрация открыты всем, «Управление» — нет", async () => {
    for (const path of ["/login", "/register/"]) expect(await canEnter({ ...base, pathname: path })).toBe(true);
    expect(await canEnter({ ...base, pathname: "/admin" })).toBe(false);
    expect(await canEnter({ ...base, pathname: "/api/health" })).toBe(true);
    expect(isPublicPath("/")).toBe(false);
    expect(isPublicPath("/login-fake")).toBe(false);
  });

  it("без входа остальные страницы закрыты", async () => {
    expect(await canEnter(base)).toBe(false);
    expect(await canEnter({ ...base, pathname: "/" })).toBe(false);
  });

  it("одобренный пользователь проходит, ожидающий или заблокированный — нет", async () => {
    expect(await canEnter({ ...base, userCookie })).toBe(true);
    expect(await canEnter({ ...base, userCookie, loadAccess: async () => ({ approved: false, sessionVersion: 2 }) })).toBe(false);
    expect(await canEnter({ ...base, userCookie, loadAccess: async () => null })).toBe(false);
  });

  it("после выхода или смены пароля (версия сессий выросла) старая cookie не пускает", async () => {
    expect(await canEnter({ ...base, userCookie, loadAccess: async () => ({ approved: true, sessionVersion: 3 }) })).toBe(false);
  });
});

describe("кэш статуса пользователя", () => {
  it("не ходит в базу повторно до истечения срока, потом перечитывает", async () => {
    const load = vi.fn().mockResolvedValueOnce({ approved: true, sessionVersion: 0 }).mockResolvedValueOnce(null);
    const cache = new AccessCache(load, 30_000);
    expect(await cache.get("u", 0)).toEqual({ approved: true, sessionVersion: 0 });
    expect(await cache.get("u", 29_999)).toEqual({ approved: true, sessionVersion: 0 });
    expect(load).toHaveBeenCalledTimes(1);
    expect(await cache.get("u", 30_000)).toBeNull();
  });
});

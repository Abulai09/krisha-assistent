import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetDatabase } from "./helpers";

// Регистрация и вход по общему паролю на настоящей тестовой базе. cookies() подменён хранилищем в памяти.

const jar = vi.hoisted(() => {
  process.env.SITE_PASSWORD = "shared-test-password";
  process.env.SESSION_SECRET = "integration-session-secret-0123456789";
  return new Map<string, string>();
});

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => jar.set(name, value),
    delete: (name: string) => jar.delete(name),
  }),
  headers: async () => new Headers(),
}));

const { currentUser, register, userLogin, userLogout } = await import("@/server/auth/user");
const { db } = await import("@/lib/db");
const { MAX_FAILURES } = await import("@/server/auth/loginThrottle");
const { listUsers, setUserStatus, deleteUser, upsertAdmin } = await import("@/server/services/userService");
const { currentAdmin } = await import("@/server/auth/admin");

const PASSWORD = "shared-test-password";

beforeEach(async () => {
  await resetDatabase();
  jar.clear();
});

describe("пользователи", () => {
  it("заявка → одобрение → вход → блокировка", async () => {
    expect(await register({ login: "ivan", name: "Иван", password: PASSWORD })).toMatchObject({ ok: true });

    expect(await userLogin({ login: "ivan", password: PASSWORD })).toEqual({
      ok: false,
      error: "Заявка ещё не одобрена администратором.",
    });
    expect(jar.size).toBe(0);

    const [user] = await listUsers();
    await setUserStatus(user.id, "APPROVED");
    expect(await userLogin({ login: "ivan", password: PASSWORD })).toMatchObject({ ok: true });
    expect((await currentUser())?.login).toBe("ivan");

    await setUserStatus(user.id, "BLOCKED");
    expect(await currentUser()).toBeNull();
    expect(await userLogin({ login: "ivan", password: PASSWORD })).toEqual({ ok: false, error: "Администратор закрыл вам доступ." });
  });

  it("с неверным общим паролем аккаунт не создаётся, а о логинах ничего не сообщается", async () => {
    expect(await register({ login: "petr", name: "Пётр", password: "wrong" })).toEqual({
      ok: false,
      error: "Неверный пароль. Заявка не создана.",
    });
    expect(await listUsers()).toHaveLength(0);
    expect(await userLogin({ login: "nobody", password: "wrong" })).toEqual({ ok: false, error: "Неверный логин или пароль." });
  });

  it("администратор входит только личным паролем; общий пароль к нему не подходит", async () => {
    expect(await upsertAdmin({ login: "boss", name: "Владелец", password: "admin-personal-pass" })).toBe("created");

    expect(await userLogin({ login: "boss", password: PASSWORD })).toEqual({ ok: false, error: "Неверный логин или пароль." });
    expect(jar.size).toBe(0);

    expect(await userLogin({ login: "boss", password: "admin-personal-pass" })).toMatchObject({ ok: true });
    expect((await currentAdmin())?.login).toBe("boss");
    expect(await currentAdmin()).not.toHaveProperty("passwordHash");
  });

  it("обычный пользователь не становится администратором, а администратора не заблокировать из панели", async () => {
    await register({ login: "ivan", name: "Иван", password: PASSWORD });
    await expect(upsertAdmin({ login: "ivan", name: "Иван", password: "admin-personal-pass" })).rejects.toThrow("занят");

    await upsertAdmin({ login: "boss", name: "Владелец", password: "admin-personal-pass" });
    const admin = (await listUsers()).find((user) => user.role === "ADMIN")!;
    await expect(setUserStatus(admin.id, "BLOCKED")).rejects.toThrow("администратор");
    await expect(deleteUser(admin.id)).rejects.toThrow("администратор");

    const [user] = (await listUsers()).filter((item) => item.role === "USER");
    await setUserStatus(user.id, "APPROVED");
    await userLogin({ login: "ivan", password: PASSWORD });
    expect(await currentAdmin()).toBeNull();
  });

  it("занятый логин не регистрируется второй раз", async () => {
    await register({ login: "ivan", name: "Иван", password: PASSWORD });
    await expect(register({ login: "ivan", name: "Другой Иван", password: PASSWORD })).rejects.toThrow("Этот логин уже занят.");
  });

  it("выход завершает сессию на всех устройствах: старая cookie больше не пускает", async () => {
    await upsertAdmin({ login: "boss", name: "Владелец", password: "admin-personal-pass" });
    await userLogin({ login: "boss", password: "admin-personal-pass" });
    const stolenCookie = jar.get("user_session")!;

    await userLogout();
    jar.set("user_session", stolenCookie);
    expect(await currentUser()).toBeNull();
  });

  it("смена пароля администратора завершает его прежние сессии", async () => {
    await upsertAdmin({ login: "boss", name: "Владелец", password: "admin-personal-pass" });
    await userLogin({ login: "boss", password: "admin-personal-pass" });
    await upsertAdmin({ login: "boss", name: "Владелец", password: "new-admin-password" });
    expect(await currentUser()).toBeNull();
  });

  it("после серии неверных паролей адрес блокируется, а неудачи администратора попадают в журнал", async () => {
    await upsertAdmin({ login: "boss", name: "Владелец", password: "admin-personal-pass" });
    for (let i = 0; i < MAX_FAILURES; i++) await userLogin({ login: "boss", password: "guess-" + i });

    const blocked = await userLogin({ login: "boss", password: "admin-personal-pass" });
    expect(blocked.ok).toBe(false);
    expect(blocked.ok ? "" : blocked.error).toContain("Слишком много");
    expect(await db.auditLog.count({ where: { action: "ADMIN_LOGIN_FAILED" } })).toBe(MAX_FAILURES);
  });
});

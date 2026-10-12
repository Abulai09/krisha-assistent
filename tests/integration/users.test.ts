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

const { currentUser, register, userLogin } = await import("@/server/auth/user");
const { listUsers, setUserStatus } = await import("@/server/services/userService");

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

  it("без верного пароля нельзя ни зарегистрироваться, ни узнать, есть ли логин", async () => {
    expect(await register({ login: "petr", name: "Пётр", password: "wrong" })).toEqual({ ok: false, error: "Неверный пароль." });
    expect(await listUsers()).toHaveLength(0);
    expect(await userLogin({ login: "nobody", password: "wrong" })).toEqual({ ok: false, error: "Неверный пароль." });
  });

  it("занятый логин не регистрируется второй раз", async () => {
    await register({ login: "ivan", name: "Иван", password: PASSWORD });
    await expect(register({ login: "ivan", name: "Другой Иван", password: PASSWORD })).rejects.toThrow("Этот логин уже занят.");
  });
});

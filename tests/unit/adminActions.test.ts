import { beforeEach, describe, expect, it, vi } from "vitest";

// Server Action — публичный POST-эндпоинт: его можно вызвать напрямую, минуя страницу.
// Проверяем, что каждое действие само требует вошедшего пользователя с ролью ADMIN.

const mocks = vi.hoisted(() => {
  process.env.DATABASE_URL = "postgresql://unused";
  return {
    user: null as null | { id: string; role: "USER" | "ADMIN" },
    enqueueManualRun: vi.fn(),
    acceptImportUpload: vi.fn(),
    setUserStatus: vi.fn(),
    deleteUser: vi.fn(),
    deleteRow: vi.fn(),
  };
});

vi.mock("@/server/auth/user", () => ({ currentUser: async () => mocks.user }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/services/runQueueService", () => ({
  enqueueManualRun: mocks.enqueueManualRun,
  RunQueueError: class RunQueueError extends Error {},
}));
vi.mock("@/server/services/userService", () => ({
  setUserStatus: mocks.setUserStatus,
  deleteUser: mocks.deleteUser,
  UserError: class UserError extends Error {},
}));
vi.mock("@/server/services/dbBrowserService", () => ({
  deleteRow: mocks.deleteRow,
  isTableName: (name: string) => ["Listing", "User"].includes(name),
  DbBrowserError: class DbBrowserError extends Error {},
}));
vi.mock("@/server/services/importUploadService", () => ({ acceptImportUpload: mocks.acceptImportUpload }));

const { deleteRowAction, enqueueRunAction, uploadImportAction, userAction } = await import("@/app/admin/actions");

const IDLE = { status: "idle" } as const;
const NOT_ADMIN = { status: "error", message: "Нужен вход администратора — войдите снова." };

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

function uploadForm() {
  const data = new FormData();
  data.set("file", new File(["externalId\nA\n"], "a.csv", { type: "text/csv" }));
  return data;
}

beforeEach(() => {
  mocks.user = null;
  mocks.enqueueManualRun.mockReset().mockResolvedValue({ id: "run" });
  mocks.acceptImportUpload.mockReset().mockResolvedValue({ runId: "run", total: 1, valid: 1, invalid: 0, sampleErrors: [] });
  mocks.setUserStatus.mockReset().mockResolvedValue(undefined);
  mocks.deleteUser.mockReset().mockResolvedValue(undefined);
  mocks.deleteRow.mockReset().mockResolvedValue(undefined);
});

describe("Server Actions «Управления»", () => {
  it("без входа ни одно действие не выполняется", async () => {
    expect(await enqueueRunAction(IDLE, form({ source: "synthetic" }))).toEqual(NOT_ADMIN);
    expect((await uploadImportAction(IDLE, uploadForm())).status).toBe("error");
    expect(await userAction(IDLE, form({ userId: "user1", action: "approve" }))).toEqual(NOT_ADMIN);
    expect(await deleteRowAction(IDLE, form({ table: "Listing", id: "x" }))).toEqual(NOT_ADMIN);
    expect(mocks.enqueueManualRun).not.toHaveBeenCalled();
    expect(mocks.acceptImportUpload).not.toHaveBeenCalled();
    expect(mocks.setUserStatus).not.toHaveBeenCalled();
    expect(mocks.deleteRow).not.toHaveBeenCalled();
  });

  it("обычный одобренный пользователь — не администратор", async () => {
    mocks.user = { id: "user1", role: "USER" };
    expect(await deleteRowAction(IDLE, form({ table: "Listing", id: "x" }))).toEqual(NOT_ADMIN);
    expect(await userAction(IDLE, form({ userId: "user2", action: "delete" }))).toEqual(NOT_ADMIN);
    expect(mocks.deleteRow).not.toHaveBeenCalled();
    expect(mocks.deleteUser).not.toHaveBeenCalled();
  });

  it("администратор ставит обновление в очередь и одобряет пользователя", async () => {
    mocks.user = { id: "admin1", role: "ADMIN" };
    expect((await enqueueRunAction(IDLE, form({ source: "synthetic" }))).status).toBe("success");
    expect(mocks.enqueueManualRun).toHaveBeenCalledWith("synthetic");
    expect(await userAction(IDLE, form({ userId: "user1", action: "approve" }))).toEqual({ status: "success", message: "Доступ открыт." });
    expect(mocks.setUserStatus).toHaveBeenCalledWith("user1", "APPROVED");
  });

  it("администратор удаляет строку только из известной таблицы", async () => {
    mocks.user = { id: "admin1", role: "ADMIN" };
    expect((await deleteRowAction(IDLE, form({ table: "Listing", id: "abc" }))).status).toBe("success");
    expect(mocks.deleteRow).toHaveBeenCalledWith("Listing", "abc");

    mocks.deleteRow.mockClear();
    expect(await deleteRowAction(IDLE, form({ table: "pg_catalog.pg_user", id: "abc" }))).toEqual({
      status: "error",
      message: "Некорректный запрос.",
    });
    expect(mocks.deleteRow).not.toHaveBeenCalled();
  });

  it("некорректные данные формы отклоняются даже у администратора", async () => {
    mocks.user = { id: "admin1", role: "ADMIN" };
    expect(await enqueueRunAction(IDLE, new FormData())).toEqual({ status: "error", message: "Некорректный запрос." });
    expect(mocks.enqueueManualRun).not.toHaveBeenCalled();
  });
});

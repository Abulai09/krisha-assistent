import { beforeEach, describe, expect, it, vi } from "vitest";

// Server Action — публичный POST-эндпоинт: его можно вызвать напрямую, минуя страницу.
// Проверяем, что каждое действие само требует сессию администратора.

const mocks = vi.hoisted(() => {
  process.env.DATABASE_URL = "postgresql://unused";
  process.env.ADMIN_TOKEN = "unit-test-admin-token-1234";
  process.env.SESSION_SECRET = "unit-test-session-secret-0123456789abcdef";
  return {
    cookieValue: undefined as string | undefined,
    enqueueManualRun: vi.fn(),
    acceptImportUpload: vi.fn(),
  };
});

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => (mocks.cookieValue === undefined ? undefined : { value: mocks.cookieValue }),
    set: vi.fn(),
    delete: vi.fn(),
  }),
  headers: async () => new Headers(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/services/runQueueService", () => ({
  enqueueManualRun: mocks.enqueueManualRun,
  RunQueueError: class RunQueueError extends Error {},
}));
vi.mock("@/server/services/importUploadService", () => ({ acceptImportUpload: mocks.acceptImportUpload }));

const { enqueueRunAction, uploadImportAction } = await import("@/app/admin/actions");
const { createSessionValue } = await import("@/server/auth/session");

const IDLE = { status: "idle" } as const;

function runForm() {
  const form = new FormData();
  form.set("source", "synthetic");
  return form;
}

function uploadForm() {
  const form = new FormData();
  form.set("file", new File(["externalId\nA\n"], "a.csv", { type: "text/csv" }));
  return form;
}

beforeEach(() => {
  mocks.cookieValue = undefined;
  mocks.enqueueManualRun.mockReset().mockResolvedValue({ id: "run" });
  mocks.acceptImportUpload.mockReset().mockResolvedValue({ runId: "run", total: 1, valid: 1, invalid: 0, sampleErrors: [] });
});

describe("Server Actions админки", () => {
  it("без сессии ручной запуск отклоняется и очередь не трогается", async () => {
    const result = await enqueueRunAction(IDLE, runForm());
    expect(result).toEqual({ status: "error", message: "Сессия истекла — войдите снова." });
    expect(mocks.enqueueManualRun).not.toHaveBeenCalled();
  });

  it("без сессии загрузка файла отклоняется", async () => {
    const result = await uploadImportAction(IDLE, uploadForm());
    expect(result.status).toBe("error");
    expect(mocks.acceptImportUpload).not.toHaveBeenCalled();
  });

  it("поддельная cookie не даёт доступа", async () => {
    mocks.cookieValue = `v1.${Date.now() + 3_600_000}.nonce.forged-signature`;
    await enqueueRunAction(IDLE, runForm());
    expect(mocks.enqueueManualRun).not.toHaveBeenCalled();
  });

  it("сессия, подписанная чужим секретом, не даёт доступа", async () => {
    mocks.cookieValue = createSessionValue("attacker-secret-attacker-secret-0000", new Date()).value;
    await uploadImportAction(IDLE, uploadForm());
    expect(mocks.acceptImportUpload).not.toHaveBeenCalled();
  });

  it("с действующей сессией действие выполняется", async () => {
    mocks.cookieValue = createSessionValue(process.env.SESSION_SECRET!, new Date()).value;
    const result = await enqueueRunAction(IDLE, runForm());
    expect(result.status).toBe("success");
    expect(mocks.enqueueManualRun).toHaveBeenCalledWith("synthetic");
  });

  it("некорректные данные формы отклоняются даже с сессией", async () => {
    mocks.cookieValue = createSessionValue(process.env.SESSION_SECRET!, new Date()).value;
    const result = await enqueueRunAction(IDLE, new FormData());
    expect(result).toEqual({ status: "error", message: "Некорректный запрос." });
    expect(mocks.enqueueManualRun).not.toHaveBeenCalled();
  });
});

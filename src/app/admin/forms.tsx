"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { enqueueRunAction, loginAction, uploadImportAction, userAction, type ActionState } from "./actions";

const IDLE: ActionState = { status: "idle" };

function ActionMessage({ state }: { state: ActionState }) {
  if (state.status === "idle") return null;
  return (
    <p role={state.status === "error" ? "alert" : "status"} className={cn("text-sm", state.status === "error" ? "text-destructive" : "text-positive")}>
      {state.message}
    </p>
  );
}

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, IDLE);
  return (
    <form action={action} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="token">Токен администратора</Label>
        <Input id="token" name="token" type="password" autoComplete="current-password" required aria-describedby="token-hint" />
        <p id="token-hint" className="text-xs text-muted-foreground">
          Значение переменной ADMIN_TOKEN из файла .env.
        </p>
      </div>
      <ActionMessage state={state} />
      <Button type="submit" disabled={pending}>
        {pending ? "Проверяем…" : "Войти"}
      </Button>
    </form>
  );
}

export function RunSourceButton({ sourceKey, disabledReason }: { sourceKey: string; disabledReason?: string }) {
  const [state, action, pending] = useActionState(enqueueRunAction, IDLE);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="source" value={sourceKey} />
      <Button type="submit" variant="outline" size="sm" disabled={pending || Boolean(disabledReason)}>
        {pending ? "Ставим в очередь…" : "Обновить сейчас"}
      </Button>
      {disabledReason && <p className="text-xs text-muted-foreground">{disabledReason}</p>}
      <ActionMessage state={state} />
    </form>
  );
}

export function UploadImportForm({ maxMb }: { maxMb: number }) {
  const [state, action, pending] = useActionState(uploadImportAction, IDLE);
  return (
    <form action={action} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="file">Файл CSV или JSON</Label>
        <Input id="file" name="file" type="file" accept=".csv,.json,text/csv,application/json" required aria-describedby="file-hint" />
        <p id="file-hint" className="text-xs text-muted-foreground">
          До {maxMb} МБ, кодировка UTF-8. Формат колонок — в docs/data-sources.md. Загружайте только данные, на использование
          которых у вас есть права.
        </p>
      </div>
      <ActionMessage state={state} />
      <Button type="submit" disabled={pending}>
        {pending ? "Проверяем файл…" : "Загрузить и импортировать"}
      </Button>
    </form>
  );
}

type UserStatusValue = "PENDING" | "APPROVED" | "BLOCKED";

/** Кнопки управления доступом пользователя. Удаление — только у заблокированных, чтобы не удалить случайно. */
export function UserActions({ userId, status }: { userId: string; status: UserStatusValue }) {
  const [state, action, pending] = useActionState(userAction, IDLE);
  return (
    <form action={action} className="space-y-1">
      <input type="hidden" name="userId" value={userId} />
      <div className="flex flex-wrap gap-2">
        {status !== "APPROVED" && (
          <Button type="submit" name="action" value="approve" size="sm" disabled={pending}>
            {status === "PENDING" ? "Одобрить" : "Разблокировать"}
          </Button>
        )}
        {status !== "BLOCKED" && (
          <Button type="submit" name="action" value="block" variant="outline" size="sm" disabled={pending}>
            {status === "PENDING" ? "Отклонить" : "Заблокировать"}
          </Button>
        )}
        {status === "BLOCKED" && (
          <Button type="submit" name="action" value="delete" variant="ghost" size="sm" disabled={pending}>
            Удалить
          </Button>
        )}
      </div>
      {state.status === "error" && <ActionMessage state={state} />}
    </form>
  );
}

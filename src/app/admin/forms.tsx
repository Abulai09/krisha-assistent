"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { deleteRowAction, enqueueRunAction, userAction, type ActionState } from "./actions";

const IDLE: ActionState = { status: "idle" };

function ActionMessage({ state }: { state: ActionState }) {
  if (state.status === "idle") return null;
  return (
    <p role={state.status === "error" ? "alert" : "status"} className={cn("text-sm", state.status === "error" ? "text-destructive" : "text-positive")}>
      {state.message}
    </p>
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

/** Удаление строки в два нажатия: без всплывающих окон браузера и без случайного удаления одним кликом. */
export function DeleteRowButton({ table, id }: { table: string; id: string }) {
  const [state, action, pending] = useActionState(deleteRowAction, IDLE);
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return (
      <div className="space-y-1">
        <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(true)}>
          Удалить
        </Button>
        {state.status === "error" && <ActionMessage state={state} />}
      </div>
    );
  }
  return (
    <form action={action} className="flex items-center gap-1 whitespace-nowrap">
      <input type="hidden" name="table" value={table} />
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="destructive" size="sm" disabled={pending}>
        {pending ? "Удаляем…" : "Точно удалить"}
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)}>
        Отмена
      </Button>
      {state.status === "error" && <ActionMessage state={state} />}
    </form>
  );
}

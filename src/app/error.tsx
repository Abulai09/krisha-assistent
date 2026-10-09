"use client";

import { Button } from "@/components/ui/button";

/** Ошибка при отрисовке страницы (например, БД недоступна). Детали — в логах сервера, не в браузере. */
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-12 text-center">
      <p className="font-medium">Не удалось загрузить данные</p>
      <p className="max-w-md text-sm text-muted-foreground">
        Возможно, база данных временно недоступна. Попробуйте ещё раз через несколько секунд. Если ошибка повторяется,
        проверьте, что PostgreSQL запущен (<code className="font-mono">docker compose up -d</code>).
      </p>
      <Button onClick={reset}>Повторить</Button>
    </div>
  );
}

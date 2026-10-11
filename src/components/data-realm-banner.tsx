import { connection } from "next/server";
import Link from "next/link";
import { FlaskConical } from "lucide-react";
import { getActiveRealm } from "@/server/services/dataRealmService";

/**
 * Постоянное напоминание, что показаны синтетические данные.
 * Заметное (на каждой странице), но спокойное — не мешает пользоваться интерфейсом.
 */
export async function DataRealmBanner() {
  await connection();
  const realm = await getActiveRealm();
  if (realm !== "synthetic") return null;

  return (
    <div role="note" className="border-b border-warning/30 bg-warning-muted">
      <div className="mx-auto flex max-w-7xl items-start gap-2 px-4 py-2 text-sm">
        <FlaskConical className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
        <p>
          <span className="font-medium">Демо-режим:</span> показаны тестовые объявления, а не реальные квартиры.{" "}
          <Link href="/methodology#data" className="underline underline-offset-2">
            Подробнее
          </Link>
        </p>
      </div>
    </div>
  );
}

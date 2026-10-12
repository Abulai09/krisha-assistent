"use client";

import { useLinkStatus } from "next/link";
import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Индикатор «переход начался» внутри <Link>. Каталог грузится с сервера, и без отклика кажется,
 * что нажатие не сработало. Место под значок занято всегда — при появлении ничего не сдвигается.
 */
export function LinkPending({ className }: { className?: string }) {
  const { pending } = useLinkStatus();
  return (
    <LoaderCircle
      aria-hidden="true"
      className={cn("size-3.5 shrink-0 animate-spin transition-opacity", pending ? "opacity-100" : "opacity-0", className)}
    />
  );
}

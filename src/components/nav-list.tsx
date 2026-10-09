import Link from "next/link";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", label: "Обзор" },
  { href: "/listings", label: "Квартиры" },
  { href: "/analytics", label: "Аналитика" },
  { href: "/methodology", label: "Как считаем" },
  { href: "/admin", label: "Управление" },
] as const;

function isActive(href: string, pathname: string | null) {
  if (pathname === null) return false;
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

/** Навигация; activePath = null — до того, как известен текущий URL (без подсветки). */
export function NavList({ activePath }: { activePath: string | null }) {
  return (
    <nav aria-label="Основная навигация" className="-mx-2 order-last flex w-full items-center gap-1 overflow-x-auto [scrollbar-width:none] sm:order-none sm:w-auto sm:flex-1">
      {NAV_ITEMS.map((item) => {
        const active = isActive(item.href, activePath);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-md px-2 py-1.5 text-sm whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground",
              item.href === "/admin" && "sm:ml-auto",
              active && "bg-muted font-medium text-foreground",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

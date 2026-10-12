import Link from "next/link";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/admin", label: "Пользователи и обновления" },
  { href: "/admin/db", label: "База данных" },
] as const;

export function AdminTabs({ active }: { active: (typeof TABS)[number]["href"] }) {
  return (
    <nav aria-label="Разделы управления" className="-mx-1 mb-6 flex gap-1 overflow-x-auto border-b [scrollbar-width:none]">
      {TABS.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={tab.href === active ? "page" : undefined}
          className={cn(
            "-mb-px border-b-2 border-transparent px-3 py-2 text-sm whitespace-nowrap text-muted-foreground hover:text-foreground",
            tab.href === active && "border-foreground font-medium text-foreground",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}

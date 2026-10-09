import Link from "next/link";
import { Suspense } from "react";
import { NavList } from "./nav-list";
import { SiteNav } from "./site-nav";

export function SiteHeader() {
  return (
    <header className="border-b bg-background">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <Link href="/" className="font-semibold tracking-tight">
          Almaty Deal Finder
        </Link>
        <Suspense fallback={<NavList activePath={null} />}>
          <SiteNav />
        </Suspense>
      </div>
    </header>
  );
}

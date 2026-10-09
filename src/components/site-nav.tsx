"use client";

import { usePathname } from "next/navigation";
import { NavList } from "./nav-list";

export function SiteNav() {
  return <NavList activePath={usePathname()} />;
}

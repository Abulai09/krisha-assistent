"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** <details>, который сам раскрывается на широком экране. Без JS работает как обычный <details>. */
export function FiltersDisclosure({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (ref.current && window.matchMedia("(min-width: 1024px)").matches) ref.current.open = true;
  }, []);
  return (
    <details ref={ref} className={className}>
      {children}
    </details>
  );
}

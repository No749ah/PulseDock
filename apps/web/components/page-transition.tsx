"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/**
 * PageTransition — fades the page content in on every route change.
 * CSS-only, no external deps, works with App Router.
 * Wraps children in a div that animates opacity/transform on mount and pathname change.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Reset animation
    el.style.animation = "none";
    // Trigger reflow
    void el.offsetHeight;
    el.style.animation = "";
  }, [pathname]);

  return (
    <div ref={ref} className="page-transition-root">
      {children}
    </div>
  );
}

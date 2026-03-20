"use client";

import { useEffect, useRef, useState } from "react";

interface LazyWidgetProps {
  children: React.ReactNode;
  /** Placeholder height (px) shown before widget enters viewport */
  placeholderHeight?: number;
  /** Root margin — how far before entering viewport to start rendering (default: 200px) */
  rootMargin?: string;
}

/**
 * Defers rendering of a widget until it is near the viewport.
 * Uses IntersectionObserver with a generous rootMargin so widgets
 * are rendered slightly before they scroll into view — no visible
 * pop-in for the user, but JS hydration is deferred for off-screen content.
 *
 * Falls back to immediate render when IntersectionObserver is unavailable
 * (SSR or older browsers).
 */
export function LazyWidget({
  children,
  placeholderHeight = 80,
  rootMargin = "400px",
}: LazyWidgetProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // If IntersectionObserver not available, render immediately
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }

    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin, threshold: 0 }
    );

    observer.observe(el);

    return () => observer.disconnect();
  }, [rootMargin]);

  if (visible) return <>{children}</>;

  return (
    <div
      ref={ref}
      style={{ minHeight: placeholderHeight }}
      className="rounded-xl border border-border bg-surface animate-pulse"
      aria-hidden="true"
    />
  );
}

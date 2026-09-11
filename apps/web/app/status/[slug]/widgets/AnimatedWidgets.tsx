"use client";

import { useEffect, useRef, useState } from "react";

// ── Count-up animation hook ────────────────────────────────────────────────
function useCountUp(
  target: number,
  options: { duration?: number; decimals?: number } = {}
): string {
  const { duration = 1200, decimals = 0 } = options;
  const [value, setValue] = useState(0);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);
  const fromRef = useRef(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mq.matches) {
      setValue(target);
      return;
    }
    fromRef.current = value;
    startRef.current = null;
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    function step(ts: number) {
      if (startRef.current === null) startRef.current = ts;
      const elapsed = ts - (startRef.current as number);
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(fromRef.current + (target - fromRef.current) * eased);
      if (progress < 1) rafRef.current = requestAnimationFrame(step);
    }
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration]);

  return value.toFixed(decimals);
}

// ── AnimatedNumber — renders an animated number as a span ─────────────────
export function AnimatedNumber({
  value,
  decimals = 2,
  duration = 1200,
  suffix = "",
  className = "",
}: {
  value: number;
  decimals?: number;
  duration?: number;
  suffix?: string;
  className?: string;
}) {
  const animated = useCountUp(value, { duration, decimals });
  return (
    <span className={className}>
      {animated}{suffix}
    </span>
  );
}

// ── AnimatedUptimeCard — single rolling uptime card with count-up ──────────
export function AnimatedUptimeCard({
  card,
  uptimeColor,
  uptimeBg,
  uptimeBorder,
}: {
  card: { label: string; days: number; uptimePct: number; total: number };
  uptimeColor: (pct: number) => string;
  uptimeBg: (pct: number) => string;
  uptimeBorder: (pct: number) => string;
}) {
  const animated = useCountUp(card.uptimePct, {
    duration: 1200,
    decimals: card.uptimePct >= 99.9 ? 2 : 1,
  });
  return (
    <div
      className={`rounded-lg border ${uptimeBorder(card.uptimePct)} ${uptimeBg(card.uptimePct)} p-3 text-center`}
    >
      <div className={`text-xl font-bold tabular-nums ${uptimeColor(card.uptimePct)}`}>
        {animated}%
      </div>
      <div className="text-xs text-text-secondary mt-0.5 font-medium">{card.label}</div>
      {card.total > 0 && (
        <div className="text-[10px] text-text-muted mt-0.5">{card.total} checks</div>
      )}
    </div>
  );
}

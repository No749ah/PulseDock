"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

const RANGES = [
  { label: "24h", value: "24h" },
  { label: "7d", value: "7d" },
  { label: "30d", value: "30d" },
  { label: "90d", value: "90d" },
] as const;

interface RangePickerProps {
  slug: string;
  currentRange: string;
}

export function RangePicker({ slug, currentRange }: RangePickerProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleSelect = useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value === "7d") {
        params.delete("range"); // 7d is default — clean URL
      } else {
        params.set("range", value);
      }
      const qs = params.toString();
      router.push(`/status/${slug}${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [router, searchParams, slug]
  );

  return (
    <div className="flex items-center gap-1 no-print" aria-label="Select time range">
      {RANGES.map((r) => (
        <button
          key={r.value}
          onClick={() => handleSelect(r.value)}
          aria-pressed={currentRange === r.value}
          className={`rounded-full px-3 py-1 text-[11px] font-medium transition-colors ${
            currentRange === r.value
              ? "bg-accent text-white"
              : "bg-surface text-text-secondary hover:text-text-primary hover:bg-surface-elevated"
          }`}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}

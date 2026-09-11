"use client";

import { useState, useRef, useEffect } from "react";
import { HelpCircle } from "lucide-react";

interface HelpTooltipProps {
  content: string;
  side?: "top" | "bottom" | "left" | "right";
  className?: string;
}

/**
 * A small ? icon that shows a tooltip on hover/focus.
 * Uses CSS-based positioning — no external deps.
 */
export function HelpTooltip({ content, side = "top", className }: HelpTooltipProps) {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);

  // Close on escape
  useEffect(() => {
    if (!visible) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setVisible(false); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [visible]);

  const positionClasses: Record<string, string> = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
    left: "right-full top-1/2 -translate-y-1/2 mr-2",
    right: "left-full top-1/2 -translate-y-1/2 ml-2",
  };

  return (
    <span className={`relative inline-flex items-center ${className ?? ""}`}>
      <button
        ref={ref}
        type="button"
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onFocus={() => setVisible(true)}
        onBlur={() => setVisible(false)}
        onClick={() => setVisible((v) => !v)}
        aria-label="Help"
        className="rounded-full text-text-secondary/50 hover:text-text-secondary transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <HelpCircle className="w-3.5 h-3.5" />
      </button>

      {visible && (
        <div
          role="tooltip"
          className={`absolute z-50 w-64 rounded-xl border border-border bg-surface-elevated shadow-xl shadow-black/30 px-3 py-2 text-xs text-text-secondary leading-relaxed pointer-events-none ${positionClasses[side]}`}
        >
          {content}
        </div>
      )}
    </span>
  );
}

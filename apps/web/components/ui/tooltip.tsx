"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { HelpCircle } from "lucide-react";

interface TooltipProps {
  content: React.ReactNode;
  children?: React.ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  className?: string;
  maxWidth?: number;
  /** If true, shows a ? icon button as the trigger */
  help?: boolean;
}

/**
 * Lightweight tooltip component — no external dependencies.
 * Usage:
 *   <Tooltip content="Description here">
 *     <button>Hover me</button>
 *   </Tooltip>
 *
 *   <Tooltip help content="What this feature does" />
 */
export function Tooltip({ content, children, side = "top", className = "", maxWidth = 240, help = false }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const show = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setVisible(true), 120);
  }, []);

  const hide = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setVisible(false), 80);
  }, []);

  useEffect(() => {
    if (!visible || !triggerRef.current || !tooltipRef.current) return;
    const trigger = triggerRef.current.getBoundingClientRect();
    const tip = tooltipRef.current.getBoundingClientRect();
    const gap = 6;

    let x = 0;
    let y = 0;

    switch (side) {
      case "top":
        x = trigger.left + trigger.width / 2 - tip.width / 2;
        y = trigger.top - tip.height - gap;
        break;
      case "bottom":
        x = trigger.left + trigger.width / 2 - tip.width / 2;
        y = trigger.bottom + gap;
        break;
      case "left":
        x = trigger.left - tip.width - gap;
        y = trigger.top + trigger.height / 2 - tip.height / 2;
        break;
      case "right":
        x = trigger.right + gap;
        y = trigger.top + trigger.height / 2 - tip.height / 2;
        break;
    }

    // Clamp to viewport
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    x = Math.max(8, Math.min(x, vw - tip.width - 8));
    y = Math.max(8, Math.min(y, vh - tip.height - 8));

    setPos({ x, y });
  }, [visible, side]);

  useEffect(() => () => clearTimeout(timer.current), []);

  const trigger = help ? (
    <button
      type="button"
      className="inline-flex items-center justify-center w-4 h-4 rounded-full text-text-muted hover:text-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      aria-label="Help"
    >
      <HelpCircle className="w-3.5 h-3.5" />
    </button>
  ) : children;

  return (
    <div
      ref={triggerRef}
      className={`inline-flex ${className}`}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {trigger}
      {visible && (
        <div
          ref={tooltipRef}
          role="tooltip"
          style={{
            position: "fixed",
            left: pos.x,
            top: pos.y,
            maxWidth,
            zIndex: 9999,
          }}
          className="pointer-events-none rounded-lg border border-border bg-surface-elevated px-2.5 py-1.5 text-xs text-text-primary shadow-xl shadow-black/30 leading-relaxed"
          onMouseEnter={show}
          onMouseLeave={hide}
        >
          {content}
          {/* Arrow */}
          {side === "top" && (
            <div className="absolute left-1/2 -translate-x-1/2 -bottom-[5px] w-2 h-2 rotate-45 bg-surface-elevated border-r border-b border-border" />
          )}
          {side === "bottom" && (
            <div className="absolute left-1/2 -translate-x-1/2 -top-[5px] w-2 h-2 rotate-45 bg-surface-elevated border-l border-t border-border" />
          )}
        </div>
      )}
    </div>
  );
}

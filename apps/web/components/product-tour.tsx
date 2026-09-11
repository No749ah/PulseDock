"use client";

import { useState, useEffect, useCallback } from "react";
import { X, ArrowRight, ArrowLeft } from "lucide-react";

export interface TourStep {
  /** CSS selector for the element to highlight. If null, shows a centered modal. */
  target?: string;
  title: string;
  content: string;
  /** Which side to show the tooltip relative to target */
  placement?: "top" | "bottom" | "left" | "right";
}

interface ProductTourProps {
  steps: TourStep[];
  storageKey: string;
  /** Show tour automatically on first visit */
  autoStart?: boolean;
  /** Callback when tour is dismissed or completed */
  onDone?: () => void;
}

const PADDING = 12; // px around highlighted element

function getRect(selector: string): DOMRect | null {
  try {
    const el = document.querySelector(selector);
    return el ? el.getBoundingClientRect() : null;
  } catch {
    return null;
  }
}

export function ProductTour({ steps, storageKey, autoStart = true, onDone }: ProductTourProps) {
  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const current = steps[step];

  const updateRect = useCallback(() => {
    if (current?.target) {
      setRect(getRect(current.target));
    } else {
      setRect(null);
    }
  }, [current]);

  // Auto-start on first visit
  useEffect(() => {
    if (!autoStart) return;
    const seen = localStorage.getItem(storageKey);
    if (!seen) {
      // Small delay so DOM is ready
      const t = setTimeout(() => setActive(true), 800);
      return () => clearTimeout(t);
    }
  }, [autoStart, storageKey]);

  // Update rect on step change + window resize
  useEffect(() => {
    if (!active) return;
    updateRect();
    window.addEventListener("resize", updateRect);
    window.addEventListener("scroll", updateRect, true);
    return () => {
      window.removeEventListener("resize", updateRect);
      window.removeEventListener("scroll", updateRect, true);
    };
  }, [active, updateRect]);

  function dismiss() {
    localStorage.setItem(storageKey, "true");
    setActive(false);
    onDone?.();
  }

  function next() {
    if (step + 1 >= steps.length) {
      dismiss();
    } else {
      setStep((s) => s + 1);
    }
  }

  function prev() {
    if (step > 0) setStep((s) => s - 1);
  }

  // Escape key
  useEffect(() => {
    if (!active) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, step]);

  if (!active) return null;

  const hasTarget = current?.target && rect;

  // Compute tooltip position
  let tooltipStyle: React.CSSProperties = {};
  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;

  if (hasTarget && rect) {
    const placement = current.placement ?? "bottom";
    const TOOLTIP_W = 320;
    const TOOLTIP_H = 180;

    if (placement === "bottom") {
      tooltipStyle = {
        top: rect.bottom + PADDING + 8,
        left: Math.max(8, Math.min(rect.left + rect.width / 2 - TOOLTIP_W / 2, vw - TOOLTIP_W - 8)),
      };
    } else if (placement === "top") {
      tooltipStyle = {
        top: rect.top - TOOLTIP_H - PADDING - 8,
        left: Math.max(8, Math.min(rect.left + rect.width / 2 - TOOLTIP_W / 2, vw - TOOLTIP_W - 8)),
      };
    } else if (placement === "right") {
      tooltipStyle = {
        top: Math.max(8, rect.top + rect.height / 2 - TOOLTIP_H / 2),
        left: rect.right + PADDING + 8,
      };
    } else {
      tooltipStyle = {
        top: Math.max(8, rect.top + rect.height / 2 - TOOLTIP_H / 2),
        left: Math.max(8, rect.left - TOOLTIP_W - PADDING - 8),
      };
    }
  } else {
    // Centered
    tooltipStyle = {
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
    };
  }

  return (
    <>
      {/* Backdrop with cutout hole */}
      <div
        className="fixed inset-0 z-[9998] pointer-events-auto"
        onClick={dismiss}
        aria-hidden="true"
        style={{
          background: hasTarget && rect
            ? `radial-gradient(ellipse at ${rect.left + rect.width / 2}px ${rect.top + rect.height / 2}px, transparent ${Math.max(rect.width, rect.height) / 2 + PADDING}px, rgba(0,0,0,0.65) ${Math.max(rect.width, rect.height) / 2 + PADDING + 40}px)`
            : "rgba(0,0,0,0.65)",
        }}
      />

      {/* Highlight ring around target */}
      {hasTarget && rect && (
        <div
          className="fixed z-[9999] pointer-events-none rounded-xl border-2 border-accent/80 shadow-[0_0_0_4px_rgba(88,166,255,0.15)]"
          style={{
            top: rect.top - PADDING,
            left: rect.left - PADDING,
            width: rect.width + PADDING * 2,
            height: rect.height + PADDING * 2,
            transition: "all 0.25s cubic-bezier(0.4,0,0.2,1)",
          }}
        />
      )}

      {/* Tooltip card */}
      <div
        className="fixed z-[10000] w-80 rounded-2xl border border-border bg-surface shadow-2xl shadow-black/50 p-5"
        style={tooltipStyle}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Tour step ${step + 1} of ${steps.length}: ${current.title}`}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-semibold text-accent uppercase tracking-wider">
                Step {step + 1} / {steps.length}
              </span>
            </div>
            <h3 className="text-sm font-bold text-text-primary">{current.title}</h3>
          </div>
          <button
            onClick={dismiss}
            className="rounded-lg p-1 text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors shrink-0"
            aria-label="Close tour"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-text-secondary leading-relaxed mb-4">{current.content}</p>

        {/* Progress dots */}
        <div className="flex items-center gap-1.5 mb-4">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`rounded-full transition-all ${i === step ? "w-4 h-1.5 bg-accent" : "w-1.5 h-1.5 bg-border"}`}
            />
          ))}
        </div>

        {/* Navigation */}
        <div className="flex items-center gap-2">
          {step > 0 && (
            <button
              onClick={prev}
              className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-all"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back
            </button>
          )}
          <button
            onClick={dismiss}
            className="ml-auto text-xs text-text-secondary/60 hover:text-text-secondary transition-colors"
          >
            Skip tour
          </button>
          <button
            onClick={next}
            className="flex items-center gap-1.5 rounded-xl bg-accent hover:bg-accent/90 active:scale-95 text-bg px-4 py-2 text-xs font-semibold transition-all"
          >
            {step + 1 >= steps.length ? "Done ✓" : (
              <>Next <ArrowRight className="w-3.5 h-3.5" /></>
            )}
          </button>
        </div>
      </div>
    </>
  );
}

/** Hook to programmatically start a tour */
export function useStartTour(storageKey: string) {
  function startTour() {
    localStorage.removeItem(storageKey);
    window.location.reload();
  }
  return startTour;
}

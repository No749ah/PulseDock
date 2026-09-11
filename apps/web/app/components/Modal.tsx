"use client";

import { X } from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useId, useRef, useState } from "react";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  actions?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}

const sizes = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-2xl",
  xl: "max-w-3xl",
};

/** Focusable element selector for focus-trap */
const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  actions,
  size = "md",
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Animation state: visible = mounted, phase = 'enter' | 'exit'
  const [visible, setVisible] = useState(false);
  const [phase, setPhase] = useState<'enter' | 'exit'>('enter');

  useEffect(() => {
    if (isOpen) {
      setVisible(true);
      setPhase('enter');
    } else if (visible) {
      setPhase('exit');
      const t = setTimeout(() => setVisible(false), 200);
      return () => clearTimeout(t);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const stableOnClose = useCallback(() => onCloseRef.current(), []);

  const justOpened = useRef(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        stableOnClose();
        return;
      }

      // Enter → click the last (primary) non-disabled button in the footer actions.
      // Skip if user is in a textarea (multi-line input) or already on a button.
      if (e.key === "Enter" && dialogRef.current) {
        const tag = (document.activeElement?.tagName ?? "").toLowerCase();
        if (tag === "textarea") return; // let Enter create newlines
        if (tag === "button" || tag === "a") return; // let native click handle it

        // Find the footer actions container and click the last button (= primary action)
        const footer = dialogRef.current.querySelector('[data-modal-actions]');
        if (footer) {
          const buttons = footer.querySelectorAll<HTMLButtonElement>('button:not([disabled])');
          const primary = buttons[buttons.length - 1]; // last button = primary by convention
          if (primary) {
            e.preventDefault();
            primary.click();
            return;
          }
        }
      }

      // Focus trap: Tab / Shift+Tab stays within modal
      if (e.key === "Tab" && dialogRef.current) {
        const focusable = Array.from(
          dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)
        ).filter((el) => el.offsetParent !== null);
        if (focusable.length === 0) { e.preventDefault(); return; }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const currentIdx = focusable.indexOf(document.activeElement as HTMLElement);
        e.preventDefault();
        if (e.shiftKey) {
          const prev = currentIdx <= 0 ? last : focusable[currentIdx - 1];
          prev.focus();
        } else {
          const next = currentIdx < 0 || currentIdx >= focusable.length - 1 ? first : focusable[currentIdx + 1];
          next.focus();
        }
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
      justOpened.current = true;
      requestAnimationFrame(() => {
        if (justOpened.current && dialogRef.current) {
          justOpened.current = false;
          const first = dialogRef.current.querySelector<HTMLElement>(FOCUSABLE);
          first?.focus();
        }
      });
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "unset";
    };
  }, [isOpen, stableOnClose]);

  if (!visible) return null;

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 modal-${phase}`}>
      {/* Backdrop */}
      <div
        className="modal-backdrop absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`modal-panel relative bg-surface border border-border rounded-2xl shadow-2xl ${sizes[size]} w-full`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 id={titleId} className="text-lg font-semibold">{title}</h2>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text-secondary transition-colors"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 max-h-[75vh] overflow-y-auto">{children}</div>

        {/* Footer — data-modal-actions is used by Enter key handler */}
        {actions && (
          <div data-modal-actions className="flex items-center justify-end gap-3 p-6 border-t border-border">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}

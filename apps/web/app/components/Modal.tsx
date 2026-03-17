"use client";

import { X } from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useId, useRef } from "react";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  actions?: ReactNode;
  size?: "sm" | "md" | "lg";
}

const sizes = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-2xl",
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
  // Stable ref for onClose so the effect doesn't re-run on every render
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const stableOnClose = useCallback(() => onCloseRef.current(), []);

  // Track whether the modal just opened (for initial focus only)
  const justOpened = useRef(false);

  // Escape key + body scroll lock + focus trap
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        stableOnClose();
        return;
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
      // Focus the first focusable element ONLY when the modal first opens
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`relative bg-surface border border-border rounded-2xl shadow-2xl ${sizes[size]} w-full`}
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

        {/* Footer */}
        {actions && (
          <div className="flex items-center justify-end gap-3 p-6 border-t border-border">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}

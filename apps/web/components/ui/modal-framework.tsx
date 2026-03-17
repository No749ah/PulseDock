'use client';

import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useId, useRef } from 'react';
import { Button } from '../../app/components/Button';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function AppModal({
  opened,
  onClose,
  title,
  children,
}: {
  opened: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const stableOnClose = useCallback(() => onCloseRef.current(), []);
  const justOpened = useRef(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        stableOnClose();
        return;
      }
      // Enter → click the last non-disabled button in the modal (primary action)
      if (e.key === 'Enter' && dialogRef.current) {
        const tag = (document.activeElement?.tagName ?? '').toLowerCase();
        if (tag !== 'textarea' && tag !== 'button' && tag !== 'a') {
          const buttons = dialogRef.current.querySelectorAll<HTMLButtonElement>('button:not([disabled])');
          // Skip the close X button (first button) — pick the last one as primary
          const primary = buttons.length > 1 ? buttons[buttons.length - 1] : null;
          if (primary) {
            e.preventDefault();
            primary.click();
            return;
          }
        }
      }
      if (e.key === 'Tab' && dialogRef.current) {
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
    if (opened) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
      justOpened.current = true;
      requestAnimationFrame(() => {
        if (justOpened.current && dialogRef.current) {
          justOpened.current = false;
          dialogRef.current.querySelector<HTMLElement>(FOCUSABLE)?.focus();
        }
      });
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
    };
  }, [opened, stableOnClose]);

  if (!opened) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />

      {/* Modal */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative bg-surface border border-border rounded-lg shadow-2xl w-full max-w-md"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
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
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

export function ConfirmModal({
  opened,
  onClose,
  title,
  message,
  onConfirm,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  confirmColor = 'red',
}: {
  opened: boolean;
  onClose: () => void;
  title: string;
  message: ReactNode;
  onConfirm: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmColor?: string;
}) {
  return (
    <AppModal opened={opened} onClose={onClose} title={title}>
      <div className="mb-4">{message}</div>
      <div className="flex gap-3 justify-end">
        <Button variant="secondary" onClick={onClose}>
          {cancelLabel}
        </Button>
        <Button
          variant={confirmColor === 'red' ? 'primary' : 'secondary'}
          onClick={onConfirm}
        >
          {confirmLabel}
        </Button>
      </div>
    </AppModal>
  );
}

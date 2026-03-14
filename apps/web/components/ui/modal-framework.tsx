'use client';

import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useId, useRef } from 'react';
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

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!opened) return;
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key === 'Tab' && dialogRef.current) {
        const focusable = Array.from(
          dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)
        ).filter((el) => el.offsetParent !== null);
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) { e.preventDefault(); last.focus(); }
        } else {
          if (document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
      }
    };
    if (opened) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
      requestAnimationFrame(() => {
        dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
      });
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
    };
  }, [opened, onClose]);

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

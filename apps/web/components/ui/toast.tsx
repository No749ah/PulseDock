'use client';

import {
  createContext,
  useCallback,
  useContext,
  useReducer,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  message: string;
  variant: ToastVariant;
  durationMs?: number;
}

// ─── State / Reducer ──────────────────────────────────────────────────────────

type Action =
  | { type: 'ADD'; toast: Toast }
  | { type: 'REMOVE'; id: string };

function reducer(state: Toast[], action: Action): Toast[] {
  switch (action.type) {
    case 'ADD':
      return [...state, action.toast];
    case 'REMOVE':
      return state.filter((t) => t.id !== action.id);
  }
}

// ─── Context ──────────────────────────────────────────────────────────────────

interface ToastContextValue {
  toasts: Toast[];
  toast: (message: string, variant?: ToastVariant, durationMs?: number) => void;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, dispatch] = useReducer(reducer, []);

  const dismiss = useCallback((id: string) => {
    dispatch({ type: 'REMOVE', id });
  }, []);

  const toast = useCallback(
    (message: string, variant: ToastVariant = 'info', durationMs = 4000) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      dispatch({ type: 'ADD', toast: { id, message, variant, durationMs } });
    },
    [],
  );

  return (
    <ToastContext.Provider value={{ toasts, toast, dismiss }}>
      {children}
      <ToastStack toasts={toasts} dismiss={dismiss} />
    </ToastContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be inside <ToastProvider>');

  return {
    toast: ctx.toast,
    success: (msg: string, ms?: number) => ctx.toast(msg, 'success', ms),
    error: (msg: string, ms?: number) => ctx.toast(msg, 'error', ms ?? 6000),
    warning: (msg: string, ms?: number) => ctx.toast(msg, 'warning', ms),
    info: (msg: string, ms?: number) => ctx.toast(msg, 'info', ms),
    dismiss: ctx.dismiss,
  };
}

// ─── Toast Item ───────────────────────────────────────────────────────────────

const VARIANT_STYLES: Record<ToastVariant, { bg: string; border: string; icon: string; Icon: typeof CheckCircle2 }> = {
  success: {
    bg: 'bg-[#0a1a0e]',
    border: 'border-success/25',
    icon: 'text-success',
    Icon: CheckCircle2,
  },
  error: {
    bg: 'bg-[#1a0808]',
    border: 'border-danger/25',
    icon: 'text-danger',
    Icon: AlertCircle,
  },
  warning: {
    bg: 'bg-[#1a1200]',
    border: 'border-warning/25',
    icon: 'text-warning',
    Icon: AlertTriangle,
  },
  info: {
    bg: 'bg-surface-elevated',
    border: 'border-border',
    icon: 'text-accent',
    Icon: Info,
  },
};

function ToastItem({ toast, dismiss }: { toast: Toast; dismiss: (id: string) => void }) {
  const { bg, border, icon, Icon } = VARIANT_STYLES[toast.variant];
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [exiting, setExiting] = useState(false);

  const handleDismiss = useCallback(() => {
    setExiting(true);
    // Wait for exit animation before removing
    setTimeout(() => dismiss(toast.id), 200);
  }, [toast.id, dismiss]);

  useEffect(() => {
    const ms = toast.durationMs ?? 4000;
    if (ms > 0) {
      timerRef.current = setTimeout(() => handleDismiss(), ms);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [toast.id, toast.durationMs, handleDismiss]);

  return (
    <div
      role="alert"
      aria-live="polite"
      className={`
        flex items-start gap-3 px-4 py-3 rounded-xl border shadow-lg
        backdrop-blur-sm min-w-[280px] max-w-sm
        ${bg} ${border}
        ${exiting ? 'toast-exiting' : 'animate-[toast-in_0.25s_cubic-bezier(0.22,1,0.36,1)]'}
      `}
    >
      <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${icon}`} aria-hidden="true" />
      <p className="text-sm text-text-primary flex-1 leading-snug">{toast.message}</p>
      <button
        onClick={handleDismiss}
        aria-label="Dismiss notification"
        className="shrink-0 p-0.5 rounded text-text-secondary hover:text-text-primary transition-colors focus:outline-none focus:ring-2 focus:ring-accent"
      >
        <X className="w-3.5 h-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}

// ─── Stack ────────────────────────────────────────────────────────────────────

function ToastStack({ toasts, dismiss }: { toasts: Toast[]; dismiss: (id: string) => void }) {
  if (toasts.length === 0) return null;

  return (
    <div
      aria-label="Notifications"
      className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none"
    >
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto">
          <ToastItem toast={t} dismiss={dismiss} />
        </div>
      ))}
    </div>
  );
}

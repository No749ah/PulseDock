'use client';

/**
 * PWAInstallBanner
 *
 * Listens for the `beforeinstallprompt` event (Chromium-based browsers)
 * and shows a subtle install banner after 30 seconds or 3 page interactions.
 *
 * Respects:
 * - Already installed → never shown (display-mode: standalone)
 * - User dismissed → suppressed for 30 days via localStorage
 * - iOS Safari → shows a manual "Add to Home Screen" tip
 */

import { useEffect, useState } from 'react';
import { Download, X, Smartphone } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISSED_KEY = 'pulsedock_pwa_dismissed';
const DISMISS_DAYS = 30;

function isDismissed(): boolean {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    if (!raw) return false;
    const ts = Number(raw);
    return Date.now() - ts < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

function recordDismiss() {
  try {
    localStorage.setItem(DISMISSED_KEY, String(Date.now()));
  } catch {
    // ignore
  }
}

function isRunningStandalone(): boolean {
  return (
    typeof window !== 'undefined' &&
    (window.matchMedia('(display-mode: standalone)').matches ||
      ('standalone' in window.navigator && (window.navigator as { standalone?: boolean }).standalone === true))
  );
}

function isIOS(): boolean {
  return typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function PWAInstallBanner() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [iosHint, setIosHint] = useState(false);

  useEffect(() => {
    // Don't show if already installed or previously dismissed
    if (isRunningStandalone() || isDismissed()) return;

    // iOS: show manual hint after delay
    if (isIOS()) {
      const t = setTimeout(() => setIosHint(true), 15_000);
      return () => clearTimeout(t);
    }

    // Chromium: capture deferred install prompt
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
      // Show banner after short delay so it doesn't pop up immediately
      setTimeout(() => setVisible(true), 8_000);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') {
      setVisible(false);
      setInstallPrompt(null);
    } else {
      dismiss();
    }
  };

  const dismiss = () => {
    setVisible(false);
    setIosHint(false);
    recordDismiss();
  };

  if (!visible && !iosHint) return null;

  // iOS "Share → Add to Home Screen" tip
  if (iosHint) {
    return (
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-sm">
        <div className="flex items-start gap-3 rounded-xl border border-border bg-surface-elevated p-4 shadow-xl shadow-black/40 backdrop-blur-sm">
          <Smartphone className="h-5 w-5 text-accent mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-text-primary">Install PulseDock</p>
            <p className="text-xs text-text-secondary mt-0.5">
              Tap <span className="font-medium text-accent">Share</span> then{' '}
              <span className="font-medium text-accent">Add to Home Screen</span> for the best experience.
            </p>
          </div>
          <button
            onClick={dismiss}
            className="text-text-muted hover:text-text-primary transition-colors flex-shrink-0"
            aria-label="Dismiss install banner"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  // Chromium install banner
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-sm animate-in slide-in-from-bottom-4 duration-300">
      <div className="flex items-center gap-3 rounded-xl border border-border bg-surface-elevated p-4 shadow-xl shadow-black/40 backdrop-blur-sm">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-accent/10">
          <Download className="h-4 w-4 text-accent" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-text-primary">Install PulseDock</p>
          <p className="text-xs text-text-secondary">Add to home screen for quick access</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={handleInstall}
            className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-bg hover:bg-accent-hover transition-colors"
          >
            Install
          </button>
          <button
            onClick={dismiss}
            className="text-text-muted hover:text-text-primary transition-colors"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

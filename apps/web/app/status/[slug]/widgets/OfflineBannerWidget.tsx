"use client";

import { useEffect, useState } from "react";

interface OfflineBannerWidgetProps {
  message?: string;
  bgColor?: string;
  textColor?: string;
  isOffline?: boolean;
}

export function OfflineBannerWidget({
  message = "Service monitoring is temporarily unavailable",
  bgColor,
  textColor,
  isOffline: isOfflineProp,
}: OfflineBannerWidgetProps) {
  const [offline, setOffline] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    function handleOffline() {
      setOffline(true);
      setDismissed(false);
    }
    function handleOnline() {
      setOffline(false);
      setDismissed(false);
    }

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setOffline(true);
    }

    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, []);

  const shouldShow = (isOfflineProp !== undefined ? isOfflineProp : offline) && !dismissed;

  if (!shouldShow) return null;

  const bannerStyle = bgColor || textColor
    ? { backgroundColor: bgColor, color: textColor }
    : undefined;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={
        bannerStyle
          ? "flex items-center justify-between gap-3 rounded-xl border border-current/20 px-4 py-3 text-sm font-medium shadow-lg print:hidden"
          : "flex items-center justify-between gap-3 rounded-xl border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm font-medium text-yellow-400 shadow-lg print:hidden"
      }
      style={bannerStyle}
    >
      <div className="flex items-center gap-2.5">
        <svg
          className="h-4 w-4 shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
        <span>{message}</span>
      </div>
      <button
        onClick={() => setDismissed(true)}
        aria-label="Dismiss offline banner"
        className="shrink-0 rounded p-0.5 opacity-70 hover:opacity-100 transition-opacity focus:outline-none focus:ring-2 focus:ring-current"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";

export function OfflineBanner() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    function handleOffline() { setOffline(true); }
    function handleOnline() { setOffline(false); }

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);

    // Check initial state
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setOffline(true);
    }

    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 flex items-center gap-2 rounded-xl border border-yellow-500/40 bg-yellow-500/10 px-4 py-2.5 text-sm font-medium text-yellow-400 shadow-lg shadow-black/30 backdrop-blur-sm print:hidden"
    >
      <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M1 6s4-4 11-4 11 4 11 4" />
        <path d="M1 10s4-4 11-4 11 4 11 4" />
        <line x1="8.56" y1="2.75" x2="19.28" y2="2.75" />
        <line x1="1" y1="1" x2="23" y2="23" />
      </svg>
      You are offline — data may be stale
    </div>
  );
}

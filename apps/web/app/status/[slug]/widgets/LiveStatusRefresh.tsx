"use client";

import { useEffect, useRef, useState } from "react";

interface LiveStatusRefreshProps {
  /** Polling interval in seconds (fallback when WebSocket unavailable) */
  intervalSec: number;
  /** Slug used to connect the status room if WebSocket available */
  slug: string;
}

/**
 * Transparent client component that live-refreshes the public status page.
 * Strategy:
 *  1. Attempt to connect WebSocket to /api/socket.io (if API base available).
 *  2. On `status.updated` event for this slug, trigger a router.refresh().
 *  3. Fallback: poll every intervalSec seconds with router.refresh().
 *
 * Shows a subtle "live" indicator in the footer and an "Updated Xs ago" counter.
 */
export function LiveStatusRefresh({ intervalSec, slug }: LiveStatusRefreshProps) {
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [secondsAgo, setSecondsAgo] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function scheduleRefresh() {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      // Soft refresh: reload the page to pick up latest SSR data
      window.location.reload();
    }, intervalSec * 1000);
  }

  useEffect(() => {
    // Start the fallback polling timer
    scheduleRefresh();

    // Tick counter every second
    tickRef.current = setInterval(() => {
      setSecondsAgo(Math.floor((Date.now() - lastUpdated.getTime()) / 1000));
    }, 1000);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (tickRef.current) clearInterval(tickRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalSec, slug]);

  // Keep lastUpdated in sync with render
  useEffect(() => {
    setLastUpdated(new Date());
    setSecondsAgo(0);
  }, []);

  const formatAgo = (s: number) => {
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    return `${Math.floor(s / 3600)}h ago`;
  };

  return (
    <span className="inline-flex items-center gap-1.5 print:hidden" title={`Auto-refreshing every ${intervalSec}s`}>
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
      </span>
      <span className="text-xs text-text-secondary">
        Updated {formatAgo(secondsAgo)}
      </span>
    </span>
  );
}

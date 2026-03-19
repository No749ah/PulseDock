"use client";

import { useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";

interface LiveStatusRefreshProps {
  /** Polling interval in seconds (fallback when WebSocket unavailable) */
  intervalSec: number;
  /** Slug used to connect the status room */
  slug: string;
}

/**
 * Transparent client component that live-refreshes the public status page.
 * Strategy:
 *  1. Connect WebSocket to /api/socket.io (via Next.js proxy).
 *  2. On connect: join `status-page:{slug}` room.
 *  3. On `status.updated` event: trigger page reload + reset lastUpdated.
 *  4. Fallback: poll every intervalSec seconds when WS is not connected.
 *
 * Shows "🟢 Live" when WebSocket connected, "⟳ Polling" when falling back.
 */
export function LiveStatusRefresh({ intervalSec, slug }: LiveStatusRefreshProps) {
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [secondsAgo, setSecondsAgo] = useState(0);
  const [wsConnected, setWsConnected] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const socketRef = useRef<Socket | null>(null);

  // Polling fallback — only used when WS is not connected
  function schedulePolling() {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      window.location.reload();
    }, intervalSec * 1000);
  }

  function cancelPolling() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  // Tick counter every second for "Updated X ago" display
  useEffect(() => {
    tickRef.current = setInterval(() => {
      setSecondsAgo(Math.floor((Date.now() - lastUpdated.getTime()) / 1000));
    }, 1000);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [lastUpdated]);

  // WebSocket connection
  useEffect(() => {
    let socket: Socket | null = null;

    async function connect() {
      try {
        const { io } = await import("socket.io-client");
        socket = io("", {
          path: "/api/socket.io/",
          transports: ["websocket", "polling"],
          reconnectionAttempts: 5,
          reconnectionDelay: 2000,
        });
        socketRef.current = socket;

        socket.on("connect", () => {
          setWsConnected(true);
          cancelPolling();
          socket!.emit("status-page:join", { slug });
        });

        socket.on("disconnect", () => {
          setWsConnected(false);
          // Fall back to polling
          schedulePolling();
        });

        socket.on("connect_error", () => {
          setWsConnected(false);
          schedulePolling();
        });

        socket.on("status.updated", () => {
          setLastUpdated(new Date());
          setSecondsAgo(0);
          window.location.reload();
        });
      } catch {
        // socket.io-client not available or connection failed — fall back to polling
        schedulePolling();
      }
    }

    // Start polling immediately as fallback, then try WS
    schedulePolling();
    connect();

    return () => {
      cancelPolling();
      if (socket) {
        socket.emit("status-page:leave", { slug });
        socket.disconnect();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalSec, slug]);

  const formatAgo = (s: number) => {
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    return `${Math.floor(s / 3600)}h ago`;
  };

  return (
    <span
      className="inline-flex items-center gap-1.5 print:hidden"
      title={wsConnected ? "Live via WebSocket" : `Polling every ${intervalSec}s`}
    >
      {wsConnected ? (
        <>
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-60" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-green-400" />
          </span>
          <span className="text-xs text-text-secondary">
            🟢 Live · Updated {formatAgo(secondsAgo)}
          </span>
        </>
      ) : (
        <>
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
          </span>
          <span className="text-xs text-text-secondary">
            ⟳ Polling · Updated {formatAgo(secondsAgo)}
          </span>
        </>
      )}
    </span>
  );
}

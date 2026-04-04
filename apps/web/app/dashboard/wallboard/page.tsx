"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Maximize2, Minimize2, RefreshCw, Activity, Tv } from "lucide-react";
import Link from "next/link";
import { api } from "../../../lib/api";
import { getUser } from "../../../components/auth";
import { relativeTime } from "../../components/timeUtils";
import { brand } from "../../../lib/brand";
import {
  statusOrder,
  cardBorderColor,
  cardGlowColor,
  cardBgColor,
  cardDotColor,
  cardStatusLabel,
  cardStatusTextColor,
  formatTypeBadge,
  parseRefreshInterval,
  parseColsParam,
  colsClass,
  deriveLevelFromRun,
  computeUptime24h,
  computeAvgLatency24h,
  downBannerLabel,
  computeWallboardStats,
  latencyTextColor,
  uptimeTextColor,
  type WallboardLevel,
} from "./wallboardHelpers";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Monitor {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
  tags?: Array<{ id: string; name: string; color?: string | null }>;
}

interface MonitorRun {
  id: string;
  monitorId: string;
  monitorType?: string | null;
  ok: boolean;
  statusCode: number;
  latencyMs?: number | null;
  message: string;
  checkedAt: string;
  level?: "green" | "yellow" | "red";
}

interface WallboardMonitor {
  monitor: Monitor;
  latestRun: MonitorRun | null;
  level: WallboardLevel;
  uptime24h: number | null;
  avgLatency24h: number | null;
}

// ── Card Component ────────────────────────────────────────────────────────────

function WallboardCard({
  item,
  isLarge,
}: {
  item: WallboardMonitor;
  isLarge: boolean;
}) {
  const { monitor, latestRun, level, uptime24h, avgLatency24h } = item;
  const isDown = level === "red";
  const isDegraded = level === "yellow";

  const borderColor = cardBorderColor(level);
  const glowColor = cardGlowColor(level);
  const bgColor = cardBgColor(level);
  const dotColor = cardDotColor(level);
  const statusLabel = cardStatusLabel(level);
  const statusTextColor = cardStatusTextColor(level);
  const typeBadge = formatTypeBadge(monitor.type);

  return (
    <div
      className={`rounded-xl border ${borderColor} ${bgColor} ${glowColor} p-4 flex flex-col gap-3 transition-all duration-500 ${
        isLarge ? "row-span-2" : ""
      }`}
    >
      {/* Header: status dot + name */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {/* Animated dot for down monitors */}
          <span className="relative flex shrink-0 h-3 w-3">
            {(isDown || isDegraded) && (
              <span
                className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-60 ${dotColor}`}
              />
            )}
            <span
              className={`relative inline-flex rounded-full h-3 w-3 ${dotColor}`}
            />
          </span>
          <span
            className={`font-bold truncate leading-tight ${
              isLarge ? "text-xl" : "text-base"
            } text-white`}
          >
            {monitor.name}
          </span>
        </div>
        {/* Status label */}
        <span
          className={`shrink-0 text-xs font-bold tracking-widest uppercase ${statusTextColor}`}
        >
          {statusLabel}
        </span>
      </div>

      {/* Type badge */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md bg-white/10 text-white/60">
          {typeBadge}
        </span>
        {monitor.tags?.slice(0, 2).map((tag) => (
          <span
            key={tag.id}
            className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-white/5 text-white/40 border border-white/10"
          >
            {tag.name}
          </span>
        ))}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2 mt-auto">
        {/* Uptime */}
        <div className="flex flex-col">
          <span className="text-[10px] text-white/40 uppercase tracking-wider mb-0.5">
            Uptime 24h
          </span>
          <span
            className={`font-bold tabular-nums ${
              isLarge ? "text-2xl" : "text-lg"
            } ${uptimeTextColor(uptime24h)}`}
          >
            {uptime24h !== null ? `${uptime24h.toFixed(1)}%` : "—"}
          </span>
        </div>

        {/* Latency */}
        <div className="flex flex-col">
          <span className="text-[10px] text-white/40 uppercase tracking-wider mb-0.5">
            Avg Latency
          </span>
          <span
            className={`font-bold tabular-nums ${
              isLarge ? "text-2xl" : "text-lg"
            } ${latencyTextColor(avgLatency24h)}`}
          >
            {avgLatency24h !== null
              ? avgLatency24h >= 1000
                ? `${(avgLatency24h / 1000).toFixed(1)}s`
                : `${Math.round(avgLatency24h)}ms`
              : "—"}
          </span>
        </div>

        {/* Last check */}
        <div className="flex flex-col">
          <span className="text-[10px] text-white/40 uppercase tracking-wider mb-0.5">
            Last Check
          </span>
          <span
            className={`font-medium ${
              isLarge ? "text-base" : "text-sm"
            } text-white/60`}
          >
            {latestRun ? relativeTime(latestRun.checkedAt) : "Never"}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function WallboardPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // URL params
  const refreshInterval = parseRefreshInterval(searchParams.get("refresh"));
  const folderFilter = searchParams.get("folder") ?? null;
  const tagFilter = searchParams.get("tag") ?? null;
  const colsParam = parseColsParam(searchParams.get("cols"));

  // State
  const [wallboard, setWallboard] = useState<WallboardMonitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [, setTick] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auth guard
  useEffect(() => {
    if (!getUser()) {
      router.push("/login");
    }
  }, [router]);

  // Fullscreen tracking
  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  // Clock tick
  useEffect(() => {
    const t = setInterval(() => setTick((v) => v + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // Browser may deny if not user gesture — safe to ignore
    }
  };

  // Data fetch
  const fetchData = useCallback(
    async (silent = false) => {
      try {
        if (!silent) setLoading(true);
        else setRefreshing(true);

        const since24h = new Date(Date.now() - 86_400_000).toISOString();

        const [monitors, runs] = await Promise.all([
          api<Monitor[]>("/v1/monitors"),
          api<MonitorRun[]>(
            `/v1/monitors/runs?limit=500&since=${encodeURIComponent(since24h)}`
          ).catch(() => [] as MonitorRun[]),
        ]);

        // Apply filters
        let filtered = monitors.filter((m) => m.enabled);

        if (tagFilter) {
          filtered = filtered.filter((m) =>
            m.tags?.some(
              (t) => t.name.toLowerCase() === tagFilter.toLowerCase()
            )
          );
        }

        // Compute per-monitor stats
        const items: WallboardMonitor[] = filtered.map((monitor) => {
          const monitorRuns = runs.filter(
            (r) => r.monitorId === monitor.id
          );
          const latestRun = monitorRuns[0] ?? null;

          const level = deriveLevelFromRun(latestRun);
          const uptime24h = computeUptime24h(monitorRuns);
          const avgLatency24h = computeAvgLatency24h(monitorRuns);

          return { monitor, latestRun, level, uptime24h, avgLatency24h };
        });

        // Sort: down → degraded → up → unknown, then alpha within group
        items.sort((a, b) => {
          const diff = statusOrder(a.level) - statusOrder(b.level);
          if (diff !== 0) return diff;
          return a.monitor.name.localeCompare(b.monitor.name);
        });

        setWallboard(items);
        setLastUpdated(new Date());
      } catch {
        // Errors are silent — wallboard should stay up
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [tagFilter]
  );

  // Initial fetch + auto-refresh
  useEffect(() => {
    fetchData(false);

    const schedule = () => {
      timerRef.current = setTimeout(() => {
        fetchData(true);
        schedule();
      }, refreshInterval * 1000);
    };
    schedule();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [fetchData, refreshInterval]);

  // Clock display
  const now = new Date();
  const timeStr = now.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const dateStr = now.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  // Stats
  const { up: upCount, degraded: degradedCount, down: downCount, total: totalCount } =
    computeWallboardStats(wallboard);

  // Grid columns
  const gridClass = colsClass(colsParam);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#080808] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-14 w-14 border-2 border-blue-500 border-t-transparent" />
          <span className="text-white/40 text-sm tracking-wide">
            Loading wallboard…
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#080808] text-white flex flex-col overflow-hidden">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <header className="shrink-0 px-6 py-3 border-b border-white/10 bg-[#0a0a0a] flex items-center justify-between gap-4">
        {/* Left: Logo + brand */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-blue-400 shrink-0" />
            <span className="text-white font-bold text-lg tracking-tight hidden sm:block">
              {brand.name}
            </span>
            <span className="text-white/30 hidden sm:block">·</span>
            <span className="text-white/50 text-sm hidden sm:block">
              NOC Wallboard
            </span>
          </div>
        </div>

        {/* Center: Clock */}
        <div className="flex flex-col items-center shrink-0">
          <span className="text-white font-bold text-3xl tracking-tight tabular-nums font-mono leading-none">
            {timeStr}
          </span>
          <span className="text-white/40 text-xs mt-0.5">{dateStr}</span>
        </div>

        {/* Right: Stats + controls */}
        <div className="flex items-center gap-4 min-w-0">
          {/* Summary pills */}
          <div className="hidden md:flex items-center gap-2">
            <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-sm">
              <span className="h-2 w-2 rounded-full bg-white/30" />
              <span className="text-white/60 tabular-nums">{totalCount}</span>
              <span className="text-white/30 text-xs">total</span>
            </span>
            {downCount > 0 && (
              <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-500/10 border border-red-500/30 text-sm">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-60" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                </span>
                <span className="text-red-400 font-bold tabular-nums">
                  {downCount}
                </span>
                <span className="text-red-400/60 text-xs">down</span>
              </span>
            )}
            {degradedCount > 0 && (
              <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-yellow-500/10 border border-yellow-500/30 text-sm">
                <span className="h-2 w-2 rounded-full bg-yellow-400" />
                <span className="text-yellow-400 font-bold tabular-nums">
                  {degradedCount}
                </span>
                <span className="text-yellow-400/60 text-xs">degraded</span>
              </span>
            )}
            {downCount === 0 && degradedCount === 0 && (
              <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-500/10 border border-green-500/30 text-sm">
                <span className="h-2 w-2 rounded-full bg-green-500" />
                <span className="text-green-400 font-bold tabular-nums">
                  {upCount}
                </span>
                <span className="text-green-400/60 text-xs">all up</span>
              </span>
            )}
          </div>

          {/* Last updated */}
          <div className="hidden lg:flex flex-col items-end">
            <span className="text-white/30 text-xs">Last updated</span>
            <span className="text-white/50 text-xs tabular-nums">
              {lastUpdated
                ? lastUpdated.toLocaleTimeString(undefined, {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })
                : "—"}
            </span>
          </div>

          {/* Refresh indicator */}
          {refreshing && (
            <RefreshCw className="w-4 h-4 text-white/40 animate-spin shrink-0" />
          )}

          {/* Back to dashboard */}
          <Link
            href="/dashboard"
            className="p-1.5 rounded-lg border border-white/10 bg-white/5 text-white/40 hover:text-white/70 hover:border-white/20 transition-colors"
            title="Back to dashboard"
          >
            <Tv className="w-4 h-4" />
          </Link>

          {/* Fullscreen button */}
          <button
            onClick={toggleFullscreen}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 text-white/40 hover:text-white/70 hover:border-white/20 transition-colors text-xs font-medium"
            title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          >
            {isFullscreen ? (
              <Minimize2 className="w-3.5 h-3.5" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5" />
            )}
            <span className="hidden sm:block">
              {isFullscreen ? "Exit" : "Fullscreen"}
            </span>
          </button>
        </div>
      </header>

      {/* ── Alert banner: down monitors ──────────────────────────── */}
      {downCount > 0 && (
        <div className="shrink-0 bg-red-900/40 border-b border-red-500/30 px-6 py-2 flex items-center gap-3">
          <div className="relative flex h-3 w-3 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
          </div>
          <span className="text-red-300 font-semibold text-sm">
            {downBannerLabel(downCount)}
          </span>
          <span className="text-red-400/60 text-xs">
            {wallboard
              .filter((w) => w.level === "red")
              .map((w) => w.monitor.name)
              .join(", ")}
          </span>
        </div>
      )}

      {/* ── Grid ─────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto p-4 md:p-6">
        {wallboard.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 min-h-[400px]">
            <Activity className="w-16 h-16 text-white/10" />
            <p className="text-white/30 text-lg font-medium">No monitors found</p>
            <p className="text-white/20 text-sm">
              {tagFilter
                ? `No monitors match tag "${tagFilter}"`
                : "No enabled monitors configured"}
            </p>
            <Link
              href="/monitors"
              className="mt-2 px-4 py-2 rounded-lg border border-white/10 bg-white/5 text-white/50 hover:text-white/80 text-sm transition-colors"
            >
              Go to Monitors →
            </Link>
          </div>
        ) : (
          <div className={`grid ${gridClass} gap-4 auto-rows-fr`}>
            {wallboard.map((item) => (
              <WallboardCard
                key={item.monitor.id}
                item={item}
                isLarge={item.level === "red"}
              />
            ))}
          </div>
        )}
      </main>

      {/* ── Footer: auto-refresh indicator ───────────────────────── */}
      <footer className="shrink-0 px-6 py-2 border-t border-white/5 bg-[#0a0a0a] flex items-center justify-between">
        <span className="text-white/20 text-xs">
          Auto-refreshing every {refreshInterval}s
          {tagFilter ? ` · tag: ${tagFilter}` : ""}
        </span>
        <span className="text-white/20 text-xs">
          {upCount} up · {degradedCount} degraded · {downCount} down
        </span>
      </footer>
    </div>
  );
}

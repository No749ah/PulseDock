"use client";

import Link from "next/link";
import { ChevronDown, ChevronUp, LayoutDashboard, Maximize2, Minimize2, Pause, Play, RefreshCw, RotateCcw, Tv } from "lucide-react";
import type { SectionKey } from "../hooks/useDashboard";
import { SECTION_LABELS } from "../hooks/useDashboard";

interface DashboardControlsProps {
  timeRange: "1h" | "6h" | "24h" | "7d" | "30d";
  onSetTimeRange: (r: "1h" | "6h" | "24h" | "7d" | "30d") => void;
  autoRefresh: boolean;
  onToggleAutoRefresh: () => void;
  refreshInterval: number;
  onSetRefreshInterval: (v: number) => void;
  lastRefreshedText: string | null;
  refreshing: boolean;
  onRefreshNow: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  showCustomize: boolean;
  onToggleCustomize: () => void;
  sectionOrder: SectionKey[];
  onMoveSectionUp: (idx: number) => void;
  onMoveSectionDown: (idx: number) => void;
  onResetSectionOrder: () => void;
}

export function DashboardControls({
  timeRange,
  onSetTimeRange,
  autoRefresh,
  onToggleAutoRefresh,
  refreshInterval,
  onSetRefreshInterval,
  lastRefreshedText,
  refreshing,
  onRefreshNow,
  isFullscreen,
  onToggleFullscreen,
  showCustomize,
  onToggleCustomize,
  sectionOrder,
  onMoveSectionUp,
  onMoveSectionDown,
  onResetSectionOrder,
}: DashboardControlsProps) {
  return (
    <>
      {/* Heading + live indicator */}
      <div className="flex items-center gap-3">
        <h2 className="text-xl font-bold text-text-primary">
          Last {timeRange === "1h" ? "1 hour" : timeRange === "6h" ? "6 hours" : timeRange === "24h" ? "24 hours" : timeRange === "7d" ? "7 days" : "30 days"}
        </h2>
        {autoRefresh && (
          <span role="status" aria-live="polite" className="flex items-center gap-1.5 text-xs text-green-400 font-medium">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
            </span>
            Live
          </span>
        )}
      </div>

      {/* Controls row */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1 rounded-lg border border-border bg-surface overflow-hidden" data-tour="time-range">
          {(["1h", "6h", "24h", "7d", "30d"] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => onSetTimeRange(r)}
              aria-pressed={timeRange === r}
              className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${
                timeRange === r ? "bg-accent/10 text-accent" : "text-text-secondary hover:text-text-primary"
              }`}
            >
              {r}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {lastRefreshedText && (
            <span className="text-xs text-text-secondary opacity-60">{lastRefreshedText}</span>
          )}
          {refreshing && <RefreshCw className="w-3.5 h-3.5 text-text-secondary animate-spin" />}
          <select
            value={refreshInterval}
            onChange={(e) => onSetRefreshInterval(Number(e.target.value))}
            aria-label="Refresh interval"
            className="text-xs px-2 py-1 bg-surface border border-border rounded-md text-text-secondary focus:outline-none focus:ring-1 focus:ring-accent"
          >
            <option value={10}>10s</option>
            <option value={30}>30s</option>
            <option value={60}>1m</option>
            <option value={300}>5m</option>
          </select>
          <button
            type="button"
            onClick={onToggleAutoRefresh}
            aria-pressed={autoRefresh}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md border border-border bg-surface text-text-secondary hover:text-text-primary hover:border-accent/50 transition-colors"
          >
            {autoRefresh ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
            {autoRefresh ? "Live" : "Paused"}
          </button>
          <button
            type="button"
            onClick={onRefreshNow}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md border border-border bg-surface text-text-secondary hover:text-text-primary hover:border-accent/50 transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            Refresh
          </button>
          <button
            type="button"
            onClick={onToggleCustomize}
            aria-pressed={showCustomize}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md border transition-colors ${
              showCustomize ? "border-accent/50 bg-accent/10 text-accent" : "border-border bg-surface text-text-secondary hover:text-text-primary hover:border-accent/50"
            }`}
          >
            <LayoutDashboard className="w-3 h-3" />
            Customize
          </button>
          <Link
            href="/dashboard/wallboard"
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md border border-border bg-surface text-text-secondary hover:text-text-primary hover:border-accent/50 transition-colors"
          >
            <Tv className="w-3.5 h-3.5" />
            Wallboard
          </Link>
          <button
            type="button"
            onClick={onToggleFullscreen}
            aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            className="p-1.5 rounded-md border border-border bg-surface text-text-secondary hover:text-text-primary hover:border-accent/50 transition-colors"
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Customize panel */}
      {showCustomize && (
        <div className="rounded-xl border border-border bg-surface/60 p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-text-primary flex items-center gap-2">
              <LayoutDashboard className="w-4 h-4 text-accent" />
              Customize Layout
            </span>
            <button
              type="button"
              onClick={onResetSectionOrder}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md border border-border bg-surface text-text-secondary hover:text-danger hover:border-danger/50 transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              Reset Order
            </button>
          </div>
          <div className="space-y-2">
            {sectionOrder.map((key, idx) => (
              <div key={key} className="flex items-center gap-2 rounded-lg border border-border/60 bg-surface-elevated px-3 py-2">
                <div className="flex flex-col gap-0.5">
                  <button
                    type="button"
                    onClick={() => onMoveSectionUp(idx)}
                    disabled={idx === 0}
                    className="p-0.5 rounded text-text-secondary hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    aria-label={`Move ${SECTION_LABELS[key]} up`}
                  >
                    <ChevronUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onMoveSectionDown(idx)}
                    disabled={idx === sectionOrder.length - 1}
                    className="p-0.5 rounded text-text-secondary hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    aria-label={`Move ${SECTION_LABELS[key]} down`}
                  >
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                </div>
                <span className="text-sm text-text-primary">{SECTION_LABELS[key]}</span>
                <span className="ml-auto text-xs text-text-muted opacity-50">{idx + 1}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

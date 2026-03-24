// Shared types, helpers, and UI primitives for status-page widgets.

import React from "react";
import { CheckCircle2, AlertCircle, XCircle } from "lucide-react";
import { AnimatedNumber, AnimatedUptimeCard } from "./AnimatedWidgets";

// ── Exported types ──────────────────────────────────────────────────────

export interface MonitorSummary {
  id: string;
  name: string;
  type: string;
  level: "green" | "yellow" | "red";
  lastChecked: string | null;
  latencyMs: number | null;
  message: string | null;
  folderId?: string | null;
  folderName?: string | null;
  tags?: string[];
}

export interface Widget {
  id: string;
  type: string;
  x: number;
  y: number;
  w: number;
  h: number;
  config: {
    monitorId?: string;
    monitorIds?: string[];
    label?: string;
    periodDays?: number;
    text?: string;
    [key: string]: unknown;
  };
}

export interface ExtraData {
  incidents: Array<{
    id: string; title: string; status: string; severity: string;
    createdAt: string; resolvedAt: string | null;
    updates: { id: string; message: string; status: string; createdAt: string }[];
    monitors: { id: string; name: string }[];
  }>;
  maintenance: Array<{
    id: string; name: string; description: string | null;
    startsAt: string; endsAt: string;
    monitors: { id: string; name: string }[];
  }>;
  recentChecks: Array<{
    id: string; monitorId: string; monitorName: string;
    checkedAt: string; ok: boolean; level: string;
    latencyMs: number | null; message: string | null;
  }>;
  widgetDataById: Record<string, unknown>;
}

export interface WidgetProps {
  widget: Widget;
  monitors: MonitorSummary[];
  extra: ExtraData;
}

// ── Helper functions ────────────────────────────────────────────────────

export function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diffMs / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

export function isNoConfig(data: unknown): boolean {
  return typeof data === 'object' && data !== null && '_noConfig' in data && (data as Record<string, unknown>)._noConfig === true;
}

export function NoConfigPlaceholder({ label: _label }: { label: string }) {
  return (
    <div className="rounded-2xl bg-surface border border-border p-4 flex items-center gap-2 text-text-secondary text-sm">
      <span className="opacity-40">◌</span>
      <span>Not configured</span>
    </div>
  );
}

export function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function levelLabel(level: "green" | "yellow" | "red"): string {
  return level === "green" ? "Operational" : level === "yellow" ? "Degraded" : "Outage";
}

export function LevelBadge({ level }: { level: "green" | "yellow" | "red" }) {
  const cls =
    level === "green"
      ? "bg-green-500/15 text-green-400 ring-green-500/30"
      : level === "yellow"
      ? "bg-yellow-500/15 text-yellow-400 ring-yellow-500/30"
      : "bg-red-500/15 text-red-400 ring-red-500/30";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${cls}`}>
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          level === "green" ? "bg-green-400" : level === "yellow" ? "bg-yellow-400" : "bg-red-400"
        }`}
      />
      {levelLabel(level)}
    </span>
  );
}

export function WidgetCard({
  title,
  meta,
  badge,
  children,
  className = "",
  headerClassName = "",
  accentColor,
}: {
  title?: string;
  meta?: React.ReactNode;
  badge?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  headerClassName?: string;
  accentColor?: "green" | "yellow" | "red" | "blue" | "none";
}) {
  const borderMap = {
    green: "border-green-500/25",
    yellow: "border-yellow-500/25",
    red: "border-red-500/25",
    blue: "border-blue-500/25",
    none: "border-border",
    undefined: "border-border",
  };
  const border = borderMap[accentColor ?? "undefined"] ?? "border-border";
  const hasHeader = title ?? meta ?? badge;
  return (
    <div className={`rounded-2xl border ${border} bg-surface transition-colors hover:border-border-hover overflow-hidden ${className}`}>
      {hasHeader && (
        <div className={`flex items-center gap-2 px-4 py-2.5 border-b border-border/40 ${headerClassName}`}>
          {title && (
            <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider truncate flex-1">
              {title}
            </span>
          )}
          {meta && <span className="text-xs text-text-muted ml-auto flex-shrink-0">{meta}</span>}
          {badge && <span className="flex-shrink-0">{badge}</span>}
        </div>
      )}
      {children}
    </div>
  );
}

export function StatusDot({ level, pulse = false }: { level: "green" | "yellow" | "red" | "no-data"; pulse?: boolean }) {
  const colorMap: Record<string, string> = {
    green: "bg-green-400",
    yellow: "bg-yellow-400",
    red: "bg-red-400",
    "no-data": "bg-border",
  };
  return (
    <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
      {pulse && level !== "no-data" && (
        <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${colorMap[level]}`} />
      )}
      <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${colorMap[level]}`} />
    </span>
  );
}

export function SeverityBadge({ severity }: { severity: string }) {
  const s = severity.toUpperCase();
  const cls =
    s === "CRITICAL" ? "bg-red-500/15 text-red-400 ring-red-500/30"
    : s === "HIGH" ? "bg-orange-500/15 text-orange-400 ring-orange-500/30"
    : s === "MEDIUM" ? "bg-yellow-500/15 text-yellow-400 ring-yellow-500/30"
    : "bg-blue-500/15 text-blue-400 ring-blue-500/30";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 uppercase tracking-wide ${cls}`}>
      {s}
    </span>
  );
}

export function TrendArrow({
  trend,
  positiveIsGood = true,
  delta,
  unit = "",
}: {
  trend: "up" | "down" | "flat";
  positiveIsGood?: boolean;
  delta?: number;
  unit?: string;
}) {
  if (trend === "flat") return null;
  const isGood = (trend === "up") === positiveIsGood;
  const color = isGood ? "text-green-400" : "text-red-400";
  const arrow = trend === "up" ? "↑" : "↓";
  const deltaStr = delta !== undefined ? `${Math.abs(delta).toFixed(2)}${unit}` : "";
  return (
    <span className={`text-xs font-medium ${color}`}>
      {arrow} {deltaStr}
    </span>
  );
}

// Re-export AnimatedNumber for use in widget files
export { AnimatedNumber, AnimatedUptimeCard };

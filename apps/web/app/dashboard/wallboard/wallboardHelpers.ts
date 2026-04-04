/**
 * Pure helper functions for the NOC Wallboard page.
 * Extracted for testability — no browser/React dependencies.
 */

export type WallboardLevel = "green" | "yellow" | "red" | "unknown";

export interface WallboardRunLike {
  ok: boolean;
  latencyMs?: number | null;
  level?: "green" | "yellow" | "red" | null;
}

// ── Sort order ────────────────────────────────────────────────────────────────

/** Returns a sort key so that red < yellow < green < unknown. */
export function statusOrder(level: string): number {
  if (level === "red") return 0;
  if (level === "yellow") return 1;
  if (level === "green") return 2;
  return 3; // unknown
}

// ── Card styling ──────────────────────────────────────────────────────────────

export function cardBorderColor(level: WallboardLevel): string {
  if (level === "red") return "border-red-500/70";
  if (level === "yellow") return "border-yellow-500/70";
  if (level === "green") return "border-green-500/40";
  return "border-white/10";
}

export function cardGlowColor(level: WallboardLevel): string {
  if (level === "red") return "shadow-[0_0_20px_rgba(239,68,68,0.25)]";
  if (level === "yellow") return "shadow-[0_0_16px_rgba(234,179,8,0.2)]";
  if (level === "green") return "shadow-[0_0_12px_rgba(34,197,94,0.15)]";
  return "";
}

export function cardBgColor(level: WallboardLevel): string {
  if (level === "red") return "bg-red-950/30";
  if (level === "yellow") return "bg-yellow-950/20";
  return "bg-white/[0.03]";
}

export function cardDotColor(level: WallboardLevel): string {
  if (level === "red") return "bg-red-500";
  if (level === "yellow") return "bg-yellow-400";
  if (level === "green") return "bg-green-500";
  return "bg-gray-500";
}

export function cardStatusLabel(level: WallboardLevel): string {
  if (level === "red") return "DOWN";
  if (level === "yellow") return "DEGRADED";
  if (level === "green") return "UP";
  return "UNKNOWN";
}

export function cardStatusTextColor(level: WallboardLevel): string {
  if (level === "red") return "text-red-400";
  if (level === "yellow") return "text-yellow-400";
  if (level === "green") return "text-green-400";
  return "text-gray-400";
}

/** Format monitor type string for the type badge (underscore → space). */
export function formatTypeBadge(monitorType: string): string {
  return monitorType.replace(/_/g, " ");
}

// ── URL param parsing ─────────────────────────────────────────────────────────

/** Parse + clamp the refresh interval param (min 5s, max 300s, default 30s). */
export function parseRefreshInterval(raw: string | null): number {
  const parsed = parseInt(raw ?? "30", 10);
  const n = isNaN(parsed) ? 30 : parsed;
  return Math.max(5, Math.min(300, n));
}

/** Parse + clamp the cols param (0 = auto, 2–6 = fixed). */
export function parseColsParam(raw: string | null): number {
  const parsed = parseInt(raw ?? "0", 10);
  const n = isNaN(parsed) ? 0 : parsed;
  return Math.max(0, Math.min(6, n));
}

/** Map cols param to a Tailwind grid-cols class. */
export function colsClass(colsParam: number): string {
  if (colsParam === 2) return "grid-cols-2";
  if (colsParam === 3) return "grid-cols-3";
  if (colsParam === 4) return "grid-cols-4";
  if (colsParam === 5) return "grid-cols-5";
  if (colsParam === 6) return "grid-cols-6";
  return "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";
}

// ── Level derivation ──────────────────────────────────────────────────────────

/** Derive wallboard level from a monitor run (or null if no run). */
export function deriveLevelFromRun(
  latestRun: WallboardRunLike | null
): WallboardLevel {
  if (!latestRun) return "unknown";
  if (latestRun.level) {
    if (latestRun.level === "red") return "red";
    if (latestRun.level === "yellow") return "yellow";
    return "green";
  }
  return latestRun.ok ? "green" : "red";
}

// ── Stats computation ─────────────────────────────────────────────────────────

/**
 * Compute 24h uptime percentage from an array of runs.
 * Returns null when there are no runs.
 */
export function computeUptime24h(runs: Array<{ ok: boolean }>): number | null {
  if (runs.length === 0) return null;
  return (runs.filter((r) => r.ok).length / runs.length) * 100;
}

/**
 * Compute average latency from runs that have a positive latencyMs value.
 * Returns null when no runs have valid latency data.
 */
export function computeAvgLatency24h(
  runs: Array<{ latencyMs?: number | null }>
): number | null {
  const valid = runs.filter((r) => r.latencyMs != null && r.latencyMs > 0);
  if (valid.length === 0) return null;
  return valid.reduce((sum, r) => sum + (r.latencyMs ?? 0), 0) / valid.length;
}

// ── Alert banner ──────────────────────────────────────────────────────────────

/** Build the down-monitors alert banner text. */
export function downBannerLabel(count: number): string {
  return `${count} monitor${count !== 1 ? "s" : ""} down`;
}

// ── Footer stats ──────────────────────────────────────────────────────────────

export interface WallboardStats {
  up: number;
  degraded: number;
  down: number;
  total: number;
}

/** Compute summary counts from a list of wallboard items. */
export function computeWallboardStats(
  items: Array<{ level: WallboardLevel }>
): WallboardStats {
  const down = items.filter((i) => i.level === "red").length;
  const degraded = items.filter((i) => i.level === "yellow").length;
  const up = items.filter((i) => i.level === "green").length;
  return { up, degraded, down, total: items.length };
}

// ── Latency color ─────────────────────────────────────────────────────────────

/** Return a Tailwind text color for an average latency value (ms). */
export function latencyTextColor(avgLatency24h: number | null): string {
  if (avgLatency24h === null) return "text-white/30";
  if (avgLatency24h < 200) return "text-green-400";
  if (avgLatency24h < 1000) return "text-yellow-400";
  return "text-red-400";
}

/** Return a Tailwind text color for a 24h uptime percentage. */
export function uptimeTextColor(uptime24h: number | null): string {
  if (uptime24h === null) return "text-white/30";
  if (uptime24h >= 99) return "text-green-400";
  if (uptime24h >= 95) return "text-yellow-400";
  return "text-red-400";
}

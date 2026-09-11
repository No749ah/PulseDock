"use client";

/** A clean, unified status cell: badge + history strip + optional uptime %. */

const VERSION_TYPES = new Set(["GIT_RELEASE", "DOCKER_IMAGE"]);
const SLOTS = 30; // total bar slots to always render

type Level = "green" | "yellow" | "red";

interface Run {
  monitorId: string;
  ok: boolean;
  level?: Level | null;
  checkedAt: string;
  latencyMs?: number;
}

interface MonitorStatusCellProps {
  monitorId: string;
  monitorType: string;
  enabled: boolean;
  pausedUntil?: string | null;
  runs: Run[]; // all recent runs (multiple monitors), filtered internally
}

export function MonitorStatusCell({ monitorId, monitorType, enabled, pausedUntil, runs }: MonitorStatusCellProps) {
  const isVersion = VERSION_TYPES.has(monitorType);
  const isPaused = !!pausedUntil && new Date(pausedUntil) > new Date();

  // Runs for this monitor — newest first (as stored)
  const monitorRuns = runs.filter((r) => r.monitorId === monitorId);
  const latest = monitorRuns[0];

  // ── Badge label + color ──────────────────────────────────────────────────
  let label = "Pending";
  let badgeColor = "text-text-secondary bg-surface-elevated border-border";

  if (!enabled) {
    label = "Disabled";
    badgeColor = "text-warning bg-warning/10 border-warning/30";
  } else if (isPaused) {
    label = "Paused";
    badgeColor = "text-sky-400 bg-sky-500/10 border-sky-500/30";
  } else if (latest) {
    if (isVersion) {
      if (latest.level === "green") {
        label = "Up to date";
        badgeColor = "text-success bg-success/10 border-success/30";
      } else if (latest.level === "yellow") {
        label = "Update available";
        badgeColor = "text-warning bg-warning/10 border-warning/30";
      } else {
        label = "Major update";
        badgeColor = "text-danger bg-danger/10 border-danger/30";
      }
    } else {
      if (latest.level === "yellow") {
        label = "Degraded";
        badgeColor = "text-warning bg-warning/10 border-warning/30";
      } else if (latest.ok) {
        label = "Operational";
        badgeColor = "text-success bg-success/10 border-success/30";
      } else {
        label = "Down";
        badgeColor = "text-danger bg-danger/10 border-danger/30";
      }
    }
  }

  // ── Uptime % (uptime monitors only) ─────────────────────────────────────
  let uptimePct: number | null = null;
  if (!isVersion && monitorRuns.length > 0) {
    const up = monitorRuns.filter((r) => r.ok || r.level === "yellow").length;
    uptimePct = Math.round((up / monitorRuns.length) * 1000) / 10;
  }

  // ── History strip (always SLOTS wide) ───────────────────────────────────
  // oldest→newest left→right; missing slots on the LEFT are gray (unknown)
  const ordered = [...monitorRuns].reverse(); // oldest first
  const strip: Array<{ color: string; opacity: number; title: string }> = [];

  // Pad left with unknowns
  const knownCount = Math.min(ordered.length, SLOTS);
  const unknownCount = SLOTS - knownCount;

  for (let i = 0; i < unknownCount; i++) {
    strip.push({ color: "#3f4350", opacity: 1, title: "Unknown" });
  }
  for (const run of ordered.slice(-SLOTS)) {
    const l = run.level;
    const color =
      l === "green" ? "#22c55e"
      : l === "yellow" ? "#f59e0b"
      : l === "red" ? "#ef4444"
      : run.ok ? "#22c55e" : "#ef4444";
    const d = new Date(run.checkedAt);
    const ts = `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    const statusLabel = !run.ok ? "Down" : run.level === "yellow" ? "Degraded" : "Up";
    const latencyPart = run.latencyMs != null ? ` · ${run.latencyMs}ms` : "";
    strip.push({ color, opacity: 0.85, title: `${ts} · ${statusLabel}${latencyPart}` });
  }

  const barW = 4;
  const barGap = 1;
  const barH = 12;
  const svgW = SLOTS * (barW + barGap) - barGap;

  return (
    <div className="flex flex-col gap-1.5 min-w-[120px]">
      {/* Badge row */}
      <div className="flex items-center gap-2">
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold border whitespace-nowrap ${badgeColor}`}>
          {label}
        </span>
        {uptimePct !== null && (
          <span className="text-[11px] font-mono text-text-secondary tabular-nums">
            {uptimePct.toFixed(1)}%
          </span>
        )}
      </div>

      {/* History strip */}
      <svg
        width={svgW}
        height={barH}
        aria-label={`${knownCount} checks shown`}
        style={{ display: "block" }}
      >
        {strip.map((s, i) => (
          <rect
            key={i}
            x={i * (barW + barGap)}
            y={0}
            width={barW}
            height={barH}
            rx={1}
            fill={s.color}
            fillOpacity={s.opacity}
          >
            <title>{s.title}</title>
          </rect>
        ))}
      </svg>
    </div>
  );
}

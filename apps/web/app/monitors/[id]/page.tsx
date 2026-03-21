"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { AlertCircle, ArrowLeft, Activity, Clock, TrendingUp, Zap, Settings, Play, Power, PowerOff, GitBranch, Trash2, Plus, X, Gauge, Bookmark } from "lucide-react";
import { Breadcrumb } from "../../../components/breadcrumb";
import { api } from "../../../lib/api";
import { getUser } from "../../../components/auth";
import { AppFrame } from "../../../components/app-frame";
import { Card } from "../../components/Card";
import { Badge } from "../../components/Badge";
import { Button } from "../../components/Button";
import { FadeIn } from "../../components/FadeIn";
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from "../../components/Table";
import { ResponseAreaChart, CheckBarChart, LineSparkline } from "../../../components/charts";
import { relativeTime, formatMonitorType } from "../../components/timeUtils";

interface MonitorItem {
  id: string;
  name: string;
  type: "HTTP" | "GIT_RELEASE" | "DOCKER_IMAGE" | "TCP" | "SSL_CERT" | "HEARTBEAT" | "DNS" | "PING" | "SMTP" | "BROWSER";
  target: string;
  intervalSec: number;
  enabled: boolean;
  createdAt: string;
  config?: Record<string, unknown>;
  slaTarget?: number | null;
  slaPeriodDays?: number | null;
  tags?: Array<{ id: string; name: string; color?: string | null }>;
  description?: string | null;
}

interface AlertChannelInfo {
  alertChannelId: string;
  notifyOn: string;
  alertChannel: {
    id: string;
    name: string;
    type: string;
  };
}

interface MonitorDependency {
  id: string;
  monitorId: string;
  dependsOnId: string;
  createdAt: string;
  dependsOn: {
    id: string;
    name: string;
    type: string;
    target: string;
    enabled: boolean;
  };
}

interface MonitorRun {
  id: string;
  monitorId: string;
  ok: boolean;
  statusCode: number;
  latencyMs: number | null;
  message: string;
  checkedAt: string;
  level?: string;
}

type UptimePeriod = "1d" | "7d" | "30d" | "90d";

interface UptimeStats {
  monitorId: string;
  period: UptimePeriod;
  from: string;
  to: string;
  uptimePct: number;
  totalChecks: number;
  failedChecks: number;
  successChecks: number;
  totalDowntimeSec: number;
  incidents: number;
  incidentList: Array<{ start: string; end: string; durationSec: number }>;
  mttrSec: number;
  mtbfSec: number;
  avgLatencyMs: number | null;
}

interface ErrorBudget {
  monitorId: string;
  period: string;
  slaTarget: number;
  totalMinutes: number;
  allowedDownMinutes: number;
  actualDownMinutes: number;
  remainingDownMinutes: number;
  budgetConsumedPct: number;
  budgetRemainingPct: number;
}

const PERIOD_LABELS: Record<UptimePeriod, string> = {
  "1d": "24h",
  "7d": "7d",
  "30d": "30d",
  "90d": "90d",
};

function formatDuration(sec: number): string {
  if (sec === 0) return "0s";
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.round(sec / 60)}m`;
  if (sec < 86400) return `${Math.round(sec / 3600)}h`;
  return `${Math.round(sec / 86400)}d`;
}

/**
 * Renders a 7-day × 24-hour uptime heatmap from run history.
 * Each cell is colored green (all ok), yellow (some fail), red (majority fail), or grey (no data).
 */
function UptimeHeatmapChart({ runs }: { runs: MonitorRun[] }) {
  const DAYS = 7;
  const HOURS = 24;
  const CELL_W = 20;
  const CELL_H = 14;
  const LABEL_W = 28;
  const LABEL_H = 18;

  // Build 7×24 bucket grid: [dayOffset][hour] = { ok: n, fail: n }
  const now = new Date();
  type Bucket = { ok: number; fail: number };
  const grid: Bucket[][] = Array.from({ length: DAYS }, () =>
    Array.from({ length: HOURS }, () => ({ ok: 0, fail: 0 }))
  );

  for (const run of runs) {
    const runDate = new Date(run.checkedAt);
    const diffMs = now.getTime() - runDate.getTime();
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffDays < 0 || diffDays >= DAYS) continue;
    const dayIdx = DAYS - 1 - diffDays; // 0 = oldest, 6 = today
    const hour = runDate.getUTCHours();
    if (run.ok) grid[dayIdx][hour].ok++;
    else grid[dayIdx][hour].fail++;
  }

  const cellColor = (b: Bucket) => {
    const total = b.ok + b.fail;
    if (total === 0) return "#1e2430"; // no data
    const failRate = b.fail / total;
    if (failRate === 0) return "#22c55e"; // all ok
    if (failRate < 0.5) return "#f59e0b"; // some fail
    return "#ef4444"; // mostly fail
  };

  const dayLabels = Array.from({ length: DAYS }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - (DAYS - 1 - i));
    return d.toLocaleDateString([], { weekday: "short" }).slice(0, 3);
  });

  const hourLabels = [0, 6, 12, 18, 23];
  const svgW = LABEL_W + HOURS * CELL_W + 4;
  const svgH = LABEL_H + DAYS * CELL_H + 4;

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${svgW} ${svgH}`}
      role="img"
      aria-label="Uptime heatmap: 7 days × 24 hours"
      className="block"
    >
      {/* Hour axis labels */}
      {hourLabels.map((h) => (
        <text
          key={h}
          x={LABEL_W + h * CELL_W + CELL_W / 2}
          y={12}
          fontSize={8}
          fill="#6b7280"
          textAnchor="middle"
          fontFamily="inherit"
        >
          {h.toString().padStart(2, "0")}h
        </text>
      ))}

      {/* Grid cells + day labels */}
      {grid.map((dayBuckets, dayIdx) => (
        <g key={dayIdx}>
          <text
            x={LABEL_W - 4}
            y={LABEL_H + dayIdx * CELL_H + CELL_H / 2 + 3}
            fontSize={8}
            fill="#6b7280"
            textAnchor="end"
            fontFamily="inherit"
          >
            {dayLabels[dayIdx]}
          </text>
          {dayBuckets.map((bucket, hour) => (
            <rect
              key={hour}
              x={LABEL_W + hour * CELL_W + 1}
              y={LABEL_H + dayIdx * CELL_H + 1}
              width={CELL_W - 2}
              height={CELL_H - 2}
              rx={2}
              fill={cellColor(bucket)}
              opacity={bucket.ok + bucket.fail === 0 ? 0.3 : 0.85}
            >
              <title>
                {dayLabels[dayIdx]} {hour.toString().padStart(2, "0")}:00 —{" "}
                {bucket.ok + bucket.fail === 0
                  ? "No data"
                  : `${bucket.ok} ok, ${bucket.fail} fail (${Math.round((bucket.fail / (bucket.ok + bucket.fail)) * 100)}% fail rate)`}
              </title>
            </rect>
          ))}
        </g>
      ))}
    </svg>
  );
}

export default function MonitorDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params.id === "string" ? params.id : Array.isArray(params.id) ? params.id[0] : "";

  const [monitor, setMonitor] = useState<MonitorItem | null>(null);
  const [runs, setRuns] = useState<MonitorRun[]>([]);
  const [uptime, setUptime] = useState<UptimeStats | null>(null);
  const [uptimePeriod, setUptimePeriod] = useState<UptimePeriod>("30d");
  const [uptimeLoading, setUptimeLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [running, setRunning] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [toast, setToast] = useState("");
  const [alertChannels, setAlertChannels] = useState<AlertChannelInfo[]>([]);
  const [dependencies, setDependencies] = useState<MonitorDependency[]>([]);
  const [allMonitors, setAllMonitors] = useState<MonitorItem[]>([]);
  const [showAddDep, setShowAddDep] = useState(false);
  const [addingDepId, setAddingDepId] = useState("");
  const [depLoading, setDepLoading] = useState(false);
  const [errorBudget, setErrorBudget] = useState<ErrorBudget | null>(null);

  // Timeline events/annotations
  interface MonitorEvent { id: string; message: string; eventType: string; createdAt: string; userId: string; }
  const [events, setEvents] = useState<MonitorEvent[]>([]);
  const [newEventMsg, setNewEventMsg] = useState("");
  const [newEventType, setNewEventType] = useState<"deploy"|"note"|"incident"|"maintenance"|"config">("note");
  const [addingEvent, setAddingEvent] = useState(false);
  const [eventError, setEventError] = useState("");

  useEffect(() => {
    const user = getUser();
    if (!user) {
      router.push("/login");
      return;
    }

    async function load() {
      try {
        setLoading(true);
        setError("");
        const [monitors, monitorRuns, alertChs, deps, evts] = await Promise.all([
          api<MonitorItem[]>("/v1/monitors", user!.id),
          api<MonitorRun[]>(`/v1/monitors/${id}/runs`, user!.id),
          api<AlertChannelInfo[]>(`/v1/monitors/${id}/alerts`, user!.id).catch(() => []),
          api<MonitorDependency[]>(`/v1/monitors/${id}/dependencies`, user!.id).catch(() => []),
          api<MonitorEvent[]>(`/v1/monitors/${id}/events`, user!.id).catch(() => []),
        ]);
        const found = monitors.find((m) => m.id === id) ?? null;
        if (!found) {
          router.push("/monitors");
          return;
        }
        setMonitor(found);
        setRuns(monitorRuns);
        setAlertChannels(alertChs);
        setDependencies(deps);
        setEvents(evts);
        setAllMonitors(monitors);
        // Fetch error budget if SLA target is set
        if (found.slaTarget) {
          api<ErrorBudget>(`/v1/monitors/${id}/error-budget?period=30d`, user!.id)
            .then((eb) => setErrorBudget(eb))
            .catch(() => null);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load monitor");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [id, router]);

  const loadUptime = useCallback(
    async (period: UptimePeriod) => {
      const user = getUser();
      if (!user || !id) return;
      setUptimeLoading(true);
      try {
        const data = await api<UptimeStats>(`/v1/monitors/${id}/uptime?period=${period}`, user.id);
        setUptime(data);
      } catch {
        // Non-fatal: uptime stats are bonus info
      } finally {
        setUptimeLoading(false);
      }
    },
    [id],
  );

  useEffect(() => {
    if (!loading && monitor) {
      loadUptime(uptimePeriod);
    }
  }, [loading, monitor, uptimePeriod, loadUptime]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  const handleRunNow = async () => {
    const user = getUser();
    if (!user || !monitor) return;
    setRunning(true);
    setActionError("");
    try {
      await api("/v1/monitors/run", user.id, { method: "POST", body: JSON.stringify({ monitorId: monitor.id }) });
      showToast("Check triggered — refreshing results…");
      // Reload runs after a brief delay
      setTimeout(async () => {
        try {
          const updated = await api<MonitorRun[]>(`/v1/monitors/${id}/runs`, user.id);
          setRuns(updated);
          loadUptime(uptimePeriod);
        } catch {
          // Non-fatal
        }
      }, 2500);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to trigger check");
    } finally {
      setRunning(false);
    }
  };

  const handleToggle = async () => {
    const user = getUser();
    if (!user || !monitor) return;
    setToggling(true);
    setActionError("");
    try {
      await api(`/v1/monitors/${monitor.id}`, user.id, {
        method: "PATCH",
        body: JSON.stringify({ enabled: !monitor.enabled }),
      });
      setMonitor((m) => m ? { ...m, enabled: !m.enabled } : m);
      showToast(monitor.enabled ? "Monitor disabled" : "Monitor enabled");
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to update monitor");
    } finally {
      setToggling(false);
    }
  };

  const handleAddDependency = async () => {
    const user = getUser();
    if (!user || !addingDepId) return;
    setDepLoading(true);
    try {
      await api(`/v1/monitors/${id}/dependencies/${addingDepId}`, user.id, { method: "POST" });
      const deps = await api<MonitorDependency[]>(`/v1/monitors/${id}/dependencies`, user.id);
      setDependencies(deps);
      setAddingDepId("");
      setShowAddDep(false);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to add dependency");
    } finally {
      setDepLoading(false);
    }
  };

  const handleRemoveDependency = async (dependsOnId: string) => {
    const user = getUser();
    if (!user) return;
    try {
      await api(`/v1/monitors/${id}/dependencies/${dependsOnId}`, user.id, { method: "DELETE" });
      setDependencies((prev) => prev.filter((d) => d.dependsOnId !== dependsOnId));
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to remove dependency");
    }
  };

  const handleAddEvent = async () => {
    const user = getUser();
    if (!user || !newEventMsg.trim()) return;
    setAddingEvent(true);
    setEventError("");
    try {
      const ev = await api<MonitorEvent>(`/v1/monitors/${id}/events`, user.id, {
        method: "POST",
        body: JSON.stringify({ message: newEventMsg.trim(), eventType: newEventType }),
      });
      setEvents((prev) => [ev, ...prev]);
      setNewEventMsg("");
    } catch (e) {
      setEventError(e instanceof Error ? e.message : "Failed to create event");
    } finally {
      setAddingEvent(false);
    }
  };

  const handleDeleteEvent = async (eventId: string) => {
    const user = getUser();
    if (!user) return;
    try {
      await api(`/v1/monitors/${id}/events/${eventId}`, user.id, { method: "DELETE" });
      setEvents((prev) => prev.filter((e) => e.id !== eventId));
    } catch (e) {
      setEventError(e instanceof Error ? e.message : "Failed to delete event");
    }
  };

  if (loading) {
    return (
      <AppFrame title="Monitor Detail">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-12 w-12 border-2 border-accent border-t-transparent" />
        </div>
      </AppFrame>
    );
  }

  if (error) {
    return (
      <AppFrame title="Monitor Detail">
        <div className="flex items-start gap-3 p-4 rounded-xl bg-danger/10 border border-danger/20">
          <AlertCircle className="w-5 h-5 text-danger mt-0.5 shrink-0" />
          <span className="text-danger text-sm">{error}</span>
        </div>
      </AppFrame>
    );
  }

  if (!monitor) return null;

  const lastRun = runs[0] ?? null;

  // Current streak
  let streak = 0;
  if (runs.length > 0) {
    const streakOk = runs[0].ok;
    for (const run of runs) {
      if (run.ok === streakOk) streak++;
      else break;
    }
  }
  const streakLabel =
    runs.length === 0
      ? "No runs yet"
      : `${streak} × ${runs[0].level === "yellow" ? "Degraded" : runs[0].ok ? "OK" : "Failed"}`;

  const uptimeColor =
    uptime === null
      ? "text-text-primary"
      : uptime.uptimePct >= 99.9
        ? "text-success"
        : uptime.uptimePct >= 99
          ? "text-warning"
          : "text-danger";

  return (
    <AppFrame title={monitor.name} breadcrumbs={[{ label: "Monitors", href: "/monitors" }, { label: monitor.name }]}>
      <div className="space-y-6">
        {/* Breadcrumb */}
        
          <Breadcrumb items={[
            { label: "Monitors", href: "/monitors" },
            { label: monitor.name },
          ]} />
        

        {/* Header */}
        
          <div className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-3xl font-bold text-text-primary">{monitor.name}</h1>
                <Badge variant="default">{formatMonitorType(monitor.type)}</Badge>
                <Badge variant={monitor.enabled ? "success" : "warning"}>
                  {monitor.enabled ? "Enabled" : "Disabled"}
                </Badge>
              </div>
              {/* Action buttons */}
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handleRunNow}
                  disabled={running || !monitor.enabled}
                  title={!monitor.enabled ? "Enable the monitor to run checks" : "Trigger an immediate check"}
                  className="flex items-center gap-1.5"
                >
                  <Play className="w-3.5 h-3.5" />
                  {running ? "Running…" : "Run Now"}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handleToggle}
                  disabled={toggling}
                  className={`flex items-center gap-1.5 ${monitor.enabled ? "text-warning border-warning/40 hover:border-warning/70" : "text-success border-success/40 hover:border-success/70"}`}
                >
                  {monitor.enabled ? (
                    <><PowerOff className="w-3.5 h-3.5" />{toggling ? "Disabling…" : "Disable"}</>
                  ) : (
                    <><Power className="w-3.5 h-3.5" />{toggling ? "Enabling…" : "Enable"}</>
                  )}
                </Button>
              </div>
            </div>
            <p
              className="text-sm text-text-secondary font-mono truncate max-w-[600px]"
              title={monitor.target}
            >
              {monitor.target}
            </p>
            {monitor.description && (
              <p className="text-sm text-text-secondary">{monitor.description}</p>
            )}
            {monitor.tags && monitor.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {monitor.tags.map((tag) => (
                  <a
                    key={tag.id}
                    href={`/monitors?tag=${encodeURIComponent(tag.name)}`}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border border-border hover:border-accent/40 transition-colors"
                    style={tag.color ? { backgroundColor: `${tag.color}22`, color: tag.color, borderColor: `${tag.color}44` } : {}}
                  >
                    {tag.name}
                  </a>
                ))}
              </div>
            )}
          </div>
        

        {/* Action feedback */}
        {actionError && (
          <div className="flex items-start gap-3 p-3 rounded-xl bg-danger/10 border border-danger/20">
            <AlertCircle className="w-4 h-4 text-danger mt-0.5 shrink-0" />
            <span className="text-danger text-sm">{actionError}</span>
          </div>
        )}
        {toast && (
          <div className="fixed bottom-6 right-6 z-50 px-4 py-2.5 rounded-xl bg-surface-elevated border border-border shadow-xl text-sm text-text-primary animate-fade-in">
            {toast}
          </div>
        )}

        {/* SLA Stats — with period selector */}
        
          <Card className="p-4 space-y-4">
            {/* Period selector */}
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-2">
                <Activity className="w-4 h-4" />
                SLA &amp; Uptime
              </h2>
              <div className="flex gap-1">
                {(["1d", "7d", "30d", "90d"] as UptimePeriod[]).map((p) => (
                  <button
                    key={p}
                    onClick={() => setUptimePeriod(p)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                      uptimePeriod === p
                        ? "bg-accent text-white"
                        : "bg-surface-elevated text-text-secondary hover:text-text-primary"
                    }`}
                  >
                    {PERIOD_LABELS[p]}
                  </button>
                ))}
              </div>
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {/* Uptime */}
              <div className="flex flex-col gap-1">
                <span className="text-xs text-text-secondary uppercase tracking-wider">Uptime</span>
                <span className={`text-2xl font-bold tabular-nums ${uptimeLoading ? "opacity-50" : ""} ${uptimeColor}`}>
                  {uptime !== null ? `${uptime.uptimePct}%` : "—"}
                </span>
                <span className="text-xs text-text-secondary">last {PERIOD_LABELS[uptimePeriod]}</span>
                {monitor?.slaTarget != null && uptime !== null && (
                  <span className={`mt-1 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold w-fit ${uptime.uptimePct >= monitor.slaTarget ? "bg-green-500/15 text-green-400" : "bg-red-500/15 text-red-400"}`}>
                    {uptime.uptimePct >= monitor.slaTarget ? "SLA MET ✓" : "SLA BREACHED ✗"}
                  </span>
                )}
                {monitor?.slaTarget != null && (
                  <span className="text-xs text-text-secondary">Target: {monitor.slaTarget}% over {monitor.slaPeriodDays ?? 30}d</span>
                )}
              </div>

              {/* Incidents */}
              <div className="flex flex-col gap-1">
                <span className="text-xs text-text-secondary uppercase tracking-wider flex items-center gap-1">
                  <Zap className="w-3 h-3" /> Incidents
                </span>
                <span className={`text-2xl font-bold tabular-nums ${uptimeLoading ? "opacity-50" : ""} ${uptime && uptime.incidents > 0 ? "text-danger" : "text-text-primary"}`}>
                  {uptime !== null ? uptime.incidents : "—"}
                </span>
                <span className="text-xs text-text-secondary">
                  {uptime && uptime.totalDowntimeSec > 0
                    ? `${formatDuration(uptime.totalDowntimeSec)} downtime`
                    : "no downtime"}
                </span>
              </div>

              {/* MTTR */}
              <div className="flex flex-col gap-1">
                <span className="text-xs text-text-secondary uppercase tracking-wider flex items-center gap-1">
                  <Clock className="w-3 h-3" /> MTTR
                </span>
                <span className={`text-2xl font-bold tabular-nums ${uptimeLoading ? "opacity-50" : ""} text-text-primary`}>
                  {uptime !== null ? (uptime.mttrSec > 0 ? formatDuration(uptime.mttrSec) : "—") : "—"}
                </span>
                <span className="text-xs text-text-secondary">mean time to recover</span>
              </div>

              {/* Avg Latency */}
              <div className="flex flex-col gap-1">
                <span className="text-xs text-text-secondary uppercase tracking-wider flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" /> Avg Latency
                </span>
                <span className={`text-2xl font-bold tabular-nums ${uptimeLoading ? "opacity-50" : ""} text-text-primary`}>
                  {uptime?.avgLatencyMs != null ? `${uptime.avgLatencyMs}ms` : "N/A"}
                </span>
                <span className="text-xs text-text-secondary">last {PERIOD_LABELS[uptimePeriod]}</span>
              </div>
            </div>

            {/* Checks today */}
            {(() => {
              const todayStart = new Date();
              todayStart.setHours(0, 0, 0, 0);
              const checksToday = runs.filter((r) => new Date(r.checkedAt) >= todayStart).length;
              return (
                <div className="flex items-center gap-6 pt-2 border-t border-border/60">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs text-text-secondary uppercase tracking-wider">Checks Today</span>
                    <span className="text-lg font-bold text-text-primary tabular-nums">{checksToday}</span>
                  </div>
                  {uptime && (
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs text-text-secondary uppercase tracking-wider">Total Checks ({PERIOD_LABELS[uptimePeriod]})</span>
                      <span className="text-lg font-bold text-text-primary tabular-nums">{uptime.totalChecks}</span>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Incident list (collapsed by default, shows if any exist) */}
            {uptime && uptime.incidentList.length > 0 && (
              <details className="group">
                <summary className="text-xs text-text-secondary hover:text-accent cursor-pointer select-none flex items-center gap-1">
                  <span className="group-open:hidden">▶</span>
                  <span className="hidden group-open:inline">▼</span>
                  {uptime.incidentList.length} incident{uptime.incidentList.length !== 1 ? "s" : ""} in this period
                </summary>
                <div className="mt-2 space-y-1">
                  {uptime.incidentList.slice(0, 10).map((inc, i) => (
                    <div key={i} className="flex items-center justify-between text-xs px-2 py-1.5 rounded bg-surface-elevated">
                      <span className="text-text-secondary">{relativeTime(inc.start)}</span>
                      <span className="text-danger font-medium">
                        {inc.durationSec > 0 ? `↓ ${formatDuration(inc.durationSec)}` : "↓ &lt;1 check"}
                      </span>
                    </div>
                  ))}
                  {uptime.incidentList.length > 10 && (
                    <p className="text-xs text-text-secondary text-center py-1">
                      + {uptime.incidentList.length - 10} more incidents
                    </p>
                  )}
                </div>
              </details>
            )}
          </Card>
        

        {/* Quick status row */}
        
          <div className="grid grid-cols-2 gap-4">
            <Card className="flex flex-col gap-1 p-4">
              <span className="text-xs text-text-secondary uppercase tracking-wider">Last Status</span>
              <div className="mt-1">
                {lastRun ? (
                  lastRun.level === "yellow" ? (
                    <Badge variant="warning">Degraded</Badge>
                  ) : lastRun.ok ? (
                    <Badge variant="success">OK</Badge>
                  ) : (
                    <Badge variant="danger">Failed</Badge>
                  )
                ) : (
                  <Badge>Pending</Badge>
                )}
              </div>
              <span className="text-xs text-text-secondary">
                {lastRun ? relativeTime(lastRun.checkedAt) : "no runs yet"}
              </span>
            </Card>
            <Card className="flex flex-col gap-1 p-4">
              <span className="text-xs text-text-secondary uppercase tracking-wider">Streak</span>
              <span className="text-sm font-semibold text-text-primary mt-1">{streakLabel}</span>
              <span className="text-xs text-text-secondary">consecutive {runs[0]?.ok ? "successes" : "failures"}</span>
            </Card>
          </div>
        

        {/* HTTP Configuration card */}
        {monitor.type === "HTTP" && monitor.config && (
          
            <Card className="p-4 space-y-3">
              <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-2">
                <Settings className="w-4 h-4" />
                HTTP Configuration
              </h2>
              {(() => {
                const cfg = monitor.config as Record<string, unknown>;
                const method = typeof cfg.method === "string" ? cfg.method : null;
                const expectedStatus = cfg.expectedStatus;
                const responseTimeMs = typeof cfg.responseTimeThresholdMs === "number" ? cfg.responseTimeThresholdMs : null;
                const confirmations = typeof cfg.confirmations === "number" ? cfg.confirmations : null;
                const bodyContains = typeof cfg.bodyContains === "string" ? cfg.bodyContains : null;
                const requestBody = typeof cfg.requestBody === "string" ? cfg.requestBody : null;
                const requestHeaders = cfg.requestHeaders && typeof cfg.requestHeaders === "object" ? cfg.requestHeaders as Record<string, string> : null;
                return (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                      {method && method !== "GET" && (
                        <div>
                          <span className="text-xs text-text-secondary block mb-0.5">Method</span>
                          <span className="font-mono font-medium text-accent">{method}</span>
                        </div>
                      )}
                      {expectedStatus != null && (
                        <div>
                          <span className="text-xs text-text-secondary block mb-0.5">Expected Status</span>
                          <span className="font-mono text-text-primary">
                            {Array.isArray(expectedStatus) ? (expectedStatus as number[]).join(", ") : String(expectedStatus)}
                          </span>
                        </div>
                      )}
                      {responseTimeMs != null && (
                        <div>
                          <span className="text-xs text-text-secondary block mb-0.5">Slow Threshold</span>
                          <span className="font-mono text-warning">{responseTimeMs}ms</span>
                        </div>
                      )}
                      {confirmations != null && confirmations > 1 && (
                        <div>
                          <span className="text-xs text-text-secondary block mb-0.5">Confirmations</span>
                          <span className="font-mono text-text-primary">{confirmations} checks</span>
                        </div>
                      )}
                    </div>
                    {bodyContains && (
                      <div>
                        <span className="text-xs text-text-secondary block mb-1">Body Must Contain</span>
                        <code className="text-xs bg-surface-elevated rounded px-2 py-1 text-text-primary block font-mono">
                          {bodyContains}
                        </code>
                      </div>
                    )}
                    {requestBody && (
                      <div>
                        <span className="text-xs text-text-secondary block mb-1">Request Body</span>
                        <code className="text-xs bg-surface-elevated rounded px-2 py-1 text-text-primary block font-mono break-all">
                          {requestBody}
                        </code>
                      </div>
                    )}
                    {requestHeaders && Object.keys(requestHeaders).length > 0 && (
                      <div>
                        <span className="text-xs text-text-secondary block mb-1">Request Headers</span>
                        <div className="space-y-1">
                          {Object.entries(requestHeaders).map(([k, v]) => (
                            <div key={k} className="flex gap-2 text-xs font-mono bg-surface-elevated rounded px-2 py-1">
                              <span className="text-accent">{k}:</span>
                              <span className="text-text-primary truncate">{v}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}
            </Card>
          
        )}

        {/* SSL Certificate config */}
        {monitor.type === "SSL_CERT" && (
          
            <Card className="p-4 space-y-3">
              <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-2">
                <Settings className="w-4 h-4" />
                SSL Configuration
              </h2>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-xs text-text-secondary block mb-0.5">Host</span>
                  <span className="font-mono text-text-primary">{monitor.target}</span>
                </div>
                <div>
                  <span className="text-xs text-text-secondary block mb-0.5">Warning Threshold</span>
                  <span className="font-mono text-warning">
                    {monitor.config && typeof (monitor.config as Record<string, unknown>).warnDays === "number"
                      ? `${String((monitor.config as Record<string, unknown>).warnDays)} days`
                      : "30 days"}
                  </span>
                </div>
              </div>
            </Card>
          
        )}

        {/* TCP port config */}
        {monitor.type === "TCP" && (
          
            <Card className="p-4 space-y-3">
              <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-2">
                <Settings className="w-4 h-4" />
                TCP Configuration
              </h2>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-xs text-text-secondary block mb-0.5">Host</span>
                  <span className="font-mono text-text-primary">
                    {monitor.target.includes(":") ? monitor.target.split(":")[0] : monitor.target}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-text-secondary block mb-0.5">Port</span>
                  <span className="font-mono text-accent">
                    {monitor.target.includes(":") ? monitor.target.split(":").pop() : "—"}
                  </span>
                </div>
              </div>
            </Card>
          
        )}

        {/* Heartbeat info card */}
        {monitor.type === "HEARTBEAT" && (
          
            <Card className="p-4 space-y-3">
              <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">Heartbeat Config</h2>
              <div className="space-y-2">
                <div>
                  <span className="text-xs text-text-secondary">Ping URL</span>
                  <p className="font-mono text-xs text-text-primary bg-surface-elevated rounded px-2 py-1 mt-1 break-all">
                    {typeof window !== "undefined"
                      ? `${window.location.origin}/api/v1/heartbeat/${monitor.config?.token ?? "—"}`
                      : `…/v1/heartbeat/${monitor.config?.token ?? "—"}`}
                  </p>
                  <p className="text-xs text-text-secondary mt-1">
                    Send a POST to this URL from your cron job or service to mark it healthy.
                  </p>
                </div>
                <div className="flex gap-6 text-sm">
                  <div>
                    <span className="text-xs text-text-secondary block">Timeout</span>
                    <span className="font-medium text-text-primary">{String(monitor.config?.timeoutMin ?? 5)} min</span>
                  </div>
                </div>
              </div>
            </Card>
          
        )}

        {/* DNS config */}
        {monitor.type === "DNS" && (
          <Card className="p-4 space-y-3">
            <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-2">
              <Settings className="w-4 h-4" />
              DNS Configuration
            </h2>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-xs text-text-secondary block mb-0.5">Hostname</span>
                <span className="font-mono text-text-primary">{monitor.target}</span>
              </div>
              <div>
                <span className="text-xs text-text-secondary block mb-0.5">Record Type</span>
                <span className="font-mono text-accent uppercase">
                  {String(monitor.config?.recordType ?? "A")}
                </span>
              </div>
              {Boolean(monitor.config?.expectedValue) && (
                <div className="col-span-2">
                  <span className="text-xs text-text-secondary block mb-0.5">Expected Value</span>
                  <span className="font-mono text-text-primary text-xs bg-surface-elevated px-2 py-1 rounded break-all">
                    {String(monitor.config?.expectedValue ?? "")}
                  </span>
                </div>
              )}
              <div>
                <span className="text-xs text-text-secondary block mb-0.5">Timeout</span>
                <span className="font-medium text-text-primary">
                  {String(monitor.config?.timeoutMs ? `${Math.round(Number(monitor.config.timeoutMs) / 1000)}s` : "10s")}
                </span>
              </div>
            </div>
          </Card>
        )}

        {/* PING config */}
        {monitor.type === "PING" && (
          <Card className="p-4 space-y-3">
            <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-2">
              <Activity className="w-4 h-4" />
              ICMP Ping Configuration
            </h2>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-xs text-text-secondary block mb-0.5">Host</span>
                <span className="font-mono text-text-primary">{monitor.target}</span>
              </div>
              <div>
                <span className="text-xs text-text-secondary block mb-0.5">Ping Count</span>
                <span className="font-medium text-text-primary">{String(monitor.config?.pingCount ?? 3)} packets</span>
              </div>
              <div>
                <span className="text-xs text-text-secondary block mb-0.5">Loss Threshold</span>
                <span className="font-medium text-text-primary">
                  {monitor.config?.maxPacketLossPct !== undefined
                    ? `>${String(monitor.config.maxPacketLossPct)}% = fail`
                    : "Any loss = warn"}
                </span>
              </div>
            </div>
          </Card>
        )}

        {/* SMTP config */}
        {monitor.type === "SMTP" && (
          <Card className="p-4 space-y-3">
            <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-2">
              <Settings className="w-4 h-4" />
              SMTP Configuration
            </h2>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-xs text-text-secondary block mb-0.5">Host</span>
                <span className="font-mono text-text-primary">
                  {monitor.target.includes(":") ? monitor.target.split(":")[0] : monitor.target}
                </span>
              </div>
              <div>
                <span className="text-xs text-text-secondary block mb-0.5">Port</span>
                <span className="font-mono text-accent">
                  {monitor.target.includes(":") ? monitor.target.split(":").pop() : "25"}
                </span>
              </div>
              <div>
                <span className="text-xs text-text-secondary block mb-0.5">STARTTLS</span>
                <span className={`font-medium ${monitor.config?.requireStarttls ? "text-success" : "text-text-secondary"}`}>
                  {monitor.config?.requireStarttls ? "Required" : "Optional"}
                </span>
              </div>
              <div>
                <span className="text-xs text-text-secondary block mb-0.5">Timeout</span>
                <span className="font-medium text-text-primary">
                  {monitor.config?.timeoutMs ? `${Math.round(Number(monitor.config.timeoutMs) / 1000)}s` : "10s"}
                </span>
              </div>
            </div>
          </Card>
        )}

        {/* Browser / Page Check config */}
        {monitor.type === "BROWSER" && (
          <Card className="p-4 space-y-3">
            <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-2">
              <Settings className="w-4 h-4" />
              Browser Check Configuration
            </h2>
            <div className="space-y-3 text-sm">
              <div>
                <span className="text-xs text-text-secondary block mb-0.5">Target URL</span>
                <span className="font-mono text-xs text-text-primary bg-surface-elevated px-2 py-1 rounded break-all">
                  {monitor.target}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-xs text-text-secondary block mb-0.5">Allowed Status Codes</span>
                  <span className="font-mono text-text-primary">
                    {monitor.config?.allowedStatusCodes
                      ? (monitor.config.allowedStatusCodes as number[]).join(", ")
                      : "200–299, 301, 302"}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-text-secondary block mb-0.5">Timeout</span>
                  <span className="font-medium text-text-primary">
                    {monitor.config?.timeoutMs ? `${Math.round(Number(monitor.config.timeoutMs) / 1000)}s` : "10s"}
                  </span>
                </div>
              </div>
              {Boolean(monitor.config?.expectedText) && (
                <div>
                  <span className="text-xs text-text-secondary block mb-0.5">Expected Text</span>
                  <span className="font-mono text-xs text-text-primary bg-surface-elevated px-2 py-1 rounded break-all">
                    {String(monitor.config?.expectedText ?? "")}
                  </span>
                </div>
              )}
              {Boolean(monitor.config?.expectedSelector) && (
                <div>
                  <span className="text-xs text-text-secondary block mb-0.5">CSS Selector</span>
                  <span className="font-mono text-xs text-accent bg-surface-elevated px-2 py-1 rounded">
                    {String(monitor.config?.expectedSelector ?? "")}
                  </span>
                </div>
              )}
            </div>
          </Card>
        )}

        {/* Response time trend (LineSparkline) — only for monitors that produce latency */}
        {!["HEARTBEAT", "GIT_RELEASE", "DOCKER_IMAGE"].includes(monitor.type) && (
          
            <Card className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">Response Trend</h2>
                <span className="text-xs text-text-muted">Last {Math.min(runs.filter((r) => r.latencyMs !== null).length, 50)} checks</span>
              </div>
              <LineSparkline
                data={runs.slice(0, 50).reverse().filter((r) => r.latencyMs !== null).map((r) => r.latencyMs as number)}
                color="#6366f1"
                height={56}
              />
            </Card>
          
        )}

        {/* Response time area chart */}
        
          <Card className="p-4 space-y-3">
            <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">
              {monitor.type === "HEARTBEAT" ? "Heartbeat History" : "Response Time"}
            </h2>
            {(() => {
              const chartRuns = runs.slice(0, 50).reverse().filter((r) => r.latencyMs !== null);
              const chartData = chartRuns.map((r) => ({
                time: new Date(r.checkedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
                value: r.latencyMs as number,
                ok: r.ok,
                checkedAt: r.checkedAt,
              }));
              const avg =
                chartData.length > 0
                  ? Math.round(chartData.reduce((s, d) => s + d.value, 0) / chartData.length)
                  : undefined;
              // Map events to vertical markers on the chart where the timestamp falls within the chart range
              const chartStart = chartRuns.length > 0 ? new Date(chartRuns[0].checkedAt).getTime() : 0;
              const chartEnd = chartRuns.length > 0 ? new Date(chartRuns[chartRuns.length - 1].checkedAt).getTime() : 0;
              const EVENT_COLORS: Record<string, string> = {
                deploy: "#3b82f6",
                incident: "#ef4444",
                maintenance: "#f59e0b",
                config: "#a855f7",
                note: "#6b7280",
              };
              const marks = events
                .filter((ev) => {
                  const t = new Date(ev.createdAt).getTime();
                  return t >= chartStart && t <= chartEnd;
                })
                .map((ev) => {
                  // Find the closest chart data point to the event time
                  const evTime = new Date(ev.createdAt).getTime();
                  let closest = chartData[0];
                  let minDiff = Infinity;
                  for (const pt of chartData) {
                    const diff = Math.abs(new Date(pt.checkedAt as string).getTime() - evTime);
                    if (diff < minDiff) { minDiff = diff; closest = pt; }
                  }
                  return {
                    xValue: closest?.time ?? "",
                    color: EVENT_COLORS[ev.eventType] ?? EVENT_COLORS.note,
                    label: ev.eventType.slice(0, 4),
                  };
                });
              return (
                <ResponseAreaChart
                  data={chartData}
                  height={160}
                  avgLine={avg}
                  color="#58a6ff"
                  marks={marks.length > 0 ? marks : undefined}
                />
              );
            })()}
            {events.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1 border-t border-border/40">
                {[{ key: "deploy", color: "#3b82f6" }, { key: "incident", color: "#ef4444" }, { key: "maintenance", color: "#f59e0b" }, { key: "config", color: "#a855f7" }, { key: "note", color: "#6b7280" }]
                  .filter(({ key }) => events.some((e) => e.eventType === key))
                  .map(({ key, color }) => (
                    <span key={key} className="flex items-center gap-1 text-[10px] text-text-muted">
                      <span className="inline-block w-2 h-2 rounded-sm" style={{ background: color }} />
                      {key}
                    </span>
                  ))}
              </div>
            )}
          </Card>
        

        {/* Check history bar chart */}
        
          <Card className="p-4 space-y-3">
            <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">
              Check History
            </h2>
            <CheckBarChart
              data={runs
                .slice(0, 50)
                .reverse()
                .map((r) => ({
                  time: new Date(r.checkedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
                  value: r.latencyMs ?? 0,
                  ok: r.ok,
                }))}
              height={80}
            />
          </Card>
        

        {/* 7×24 Uptime Heatmap */}
        {runs.length > 0 && (
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">
                Uptime Heatmap
              </h2>
              <div className="flex items-center gap-3 text-[10px] text-text-muted">
                <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: "#22c55e" }} />OK</span>
                <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: "#f59e0b" }} />Degraded</span>
                <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: "#ef4444" }} />Down</span>
                <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-surface-elevated opacity-50" />No data</span>
              </div>
            </div>
            <p className="text-xs text-text-muted">7 days × 24 hours (UTC). Hover cells for details.</p>
            <UptimeHeatmapChart runs={runs} />
          </Card>
        )}

        {/* Run history table */}
        
          <Card className="p-0">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">
                Recent Checks
              </h2>
              <span className="text-xs text-text-muted">{Math.min(runs.length, 50)} of {runs.length} shown</span>
            </div>
            <div>
              {runs.length === 0 ? (
                <div className="text-center py-12 text-text-secondary text-sm">
                  No runs yet — this monitor hasn&apos;t checked yet.
                </div>
              ) : (
                <Table>
                  <TableHead>
                    <tr>
                      <TableHeader>Time</TableHeader>
                      <TableHeader>Status</TableHeader>
                      <TableHeader>Latency</TableHeader>
                      <TableHeader>HTTP Code</TableHeader>
                      <TableHeader>Message</TableHeader>
                    </tr>
                  </TableHead>
                  <TableBody>
                    {runs.slice(0, 50).map((run) => (
                      <TableRow key={run.id}>
                        <TableCell className="text-xs text-text-secondary whitespace-nowrap">
                          {relativeTime(run.checkedAt)}
                        </TableCell>
                        <TableCell>
                          {run.level === "yellow" ? (
                            <Badge variant="warning">Degraded</Badge>
                          ) : run.ok ? (
                            <Badge variant="success">OK</Badge>
                          ) : (
                            <Badge variant="danger">Failed</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm font-mono text-text-secondary">
                          {run.latencyMs !== null ? `${run.latencyMs}ms` : "—"}
                        </TableCell>
                        <TableCell className="text-sm font-mono text-text-secondary">
                          {run.statusCode || "—"}
                        </TableCell>
                        <TableCell
                          className="text-sm text-text-secondary max-w-[300px] truncate"
                          title={run.message}
                        >
                          {run.message.length > 60 ? run.message.slice(0, 60) + "…" : run.message}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </Card>
        
        {/* SLO Error Budget — only shown when slaTarget is set */}
        {monitor.slaTarget != null && errorBudget && (
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-2">
                <Gauge className="w-4 h-4" />
                SLO Error Budget (30d)
              </h2>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                errorBudget.budgetRemainingPct > 30
                  ? "bg-green-500/15 text-green-400"
                  : errorBudget.budgetRemainingPct > 10
                  ? "bg-yellow-500/15 text-yellow-400"
                  : "bg-red-500/15 text-red-400"
              }`}>
                {errorBudget.budgetRemainingPct.toFixed(1)}% remaining
              </span>
            </div>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-xs text-text-secondary block mb-0.5">SLA Target</span>
                <span className="font-mono text-text-primary">{errorBudget.slaTarget}%</span>
              </div>
              <div>
                <span className="text-xs text-text-secondary block mb-0.5">Allowed Down</span>
                <span className="font-mono text-text-primary">
                  {errorBudget.allowedDownMinutes < 60
                    ? `${Math.round(errorBudget.allowedDownMinutes)}m`
                    : `${(errorBudget.allowedDownMinutes / 60).toFixed(1)}h`}
                </span>
              </div>
              <div>
                <span className="text-xs text-text-secondary block mb-0.5">Remaining</span>
                <span className={`font-mono font-semibold ${errorBudget.remainingDownMinutes <= 0 ? "text-danger" : "text-success"}`}>
                  {errorBudget.remainingDownMinutes <= 0
                    ? "Budget exhausted"
                    : errorBudget.remainingDownMinutes < 60
                    ? `${Math.round(errorBudget.remainingDownMinutes)}m`
                    : `${(errorBudget.remainingDownMinutes / 60).toFixed(1)}h`}
                </span>
              </div>
            </div>
            {/* Progress bar */}
            <div>
              <div className="flex justify-between text-xs text-text-muted mb-1">
                <span>Budget consumed: {errorBudget.budgetConsumedPct.toFixed(1)}%</span>
                <span>{errorBudget.actualDownMinutes < 60
                  ? `${Math.round(errorBudget.actualDownMinutes)}m down`
                  : `${(errorBudget.actualDownMinutes / 60).toFixed(1)}h down`}
                </span>
              </div>
              <div className="w-full h-2 bg-surface-elevated rounded-full overflow-hidden">
                <div
                  className={`h-2 rounded-full transition-all ${
                    errorBudget.budgetConsumedPct > 90 ? "bg-danger" :
                    errorBudget.budgetConsumedPct > 60 ? "bg-warning" : "bg-success"
                  }`}
                  style={{ width: `${Math.min(errorBudget.budgetConsumedPct, 100)}%` }}
                />
              </div>
            </div>
          </Card>
        )}

        {/* Alert Channels */}
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">Alert Channels</h2>
            <a href="/alerts" className="text-xs text-accent hover:underline">Manage →</a>
          </div>
          {alertChannels.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <p className="text-sm text-text-secondary">No alert channels assigned</p>
              <a href="/alerts" className="text-xs text-accent hover:underline">Add an alert channel →</a>
            </div>
          ) : (
            <div className="space-y-2">
              {alertChannels.map((ac) => {
                const typeColors: Record<string, string> = {
                  email: "text-yellow-400 bg-yellow-400/10 border-yellow-400/20",
                  slack: "text-green-400 bg-green-400/10 border-green-400/20",
                  discord: "text-indigo-400 bg-indigo-400/10 border-indigo-400/20",
                  webhook: "text-blue-400 bg-blue-400/10 border-blue-400/20",
                  telegram: "text-sky-400 bg-sky-400/10 border-sky-400/20",
                };
                const notifyLabels: Record<string, string> = {
                  ON_CHANGE: "On change",
                  ALWAYS: "Always",
                  FIRST_ONLY: "First only",
                  DAILY_DIGEST: "Daily digest",
                  VERSION_ANY: "Any version",
                  VERSION_MAJOR: "Major only",
                };
                const colorClass = typeColors[ac.alertChannel.type] ?? "text-text-secondary bg-surface-elevated border-border";
                return (
                  <div key={ac.alertChannelId} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-surface-elevated border border-border">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border uppercase ${colorClass}`}>
                      {ac.alertChannel.type}
                    </span>
                    <span className="text-sm text-text-primary flex-1 truncate">{ac.alertChannel.name}</span>
                    <span className="text-xs text-text-muted">{notifyLabels[ac.notifyOn] ?? ac.notifyOn}</span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Monitor Dependencies */}
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <GitBranch className="w-4 h-4 text-text-secondary" />
              <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">Dependencies</h2>
            </div>
            <button
              onClick={() => setShowAddDep(!showAddDep)}
              className="flex items-center gap-1 text-xs text-accent hover:underline"
            >
              <Plus className="w-3 h-3" />
              Add
            </button>
          </div>

          <p className="text-xs text-text-muted">
            Alerts on this monitor are suppressed while any dependency is down. Useful when an app monitor depends on a database or infrastructure monitor.
          </p>

          {showAddDep && (
            <div className="flex gap-2">
              <select
                className="flex-1 px-3 py-2 bg-surface border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
                value={addingDepId}
                onChange={(e) => setAddingDepId(e.target.value)}
              >
                <option value="">Select a monitor to depend on…</option>
                {allMonitors
                  .filter((m) => m.id !== id && !dependencies.some((d) => d.dependsOnId === m.id))
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.type})
                    </option>
                  ))}
              </select>
              <button
                onClick={handleAddDependency}
                disabled={!addingDepId || depLoading}
                className="px-3 py-2 bg-accent text-white rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-accent/90 transition-colors"
              >
                {depLoading ? "…" : "Add"}
              </button>
              <button
                onClick={() => { setShowAddDep(false); setAddingDepId(""); }}
                className="px-2 py-2 text-text-muted hover:text-text-primary rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {dependencies.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-4 text-center">
              <p className="text-sm text-text-secondary">No dependencies configured</p>
              <p className="text-xs text-text-muted">Add a dependency to suppress false alerts during infrastructure outages</p>
            </div>
          ) : (
            <div className="space-y-2">
              {dependencies.map((dep) => (
                <div key={dep.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-surface-elevated border border-border">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dep.dependsOn.enabled ? 'bg-success' : 'bg-text-muted'}`} />
                  <div className="flex-1 min-w-0">
                    <Link href={`/monitors/${dep.dependsOnId}`} className="text-sm text-text-primary hover:text-accent truncate block">
                      {dep.dependsOn.name}
                    </Link>
                    <span className="text-xs text-text-muted truncate block">{dep.dependsOn.target}</span>
                  </div>
                  <span className="text-xs text-text-muted bg-surface px-1.5 py-0.5 rounded border border-border flex-shrink-0">
                    {dep.dependsOn.type}
                  </span>
                  <button
                    onClick={() => handleRemoveDependency(dep.dependsOnId)}
                    className="text-text-muted hover:text-danger transition-colors flex-shrink-0"
                    aria-label="Remove dependency"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Timeline Events / Annotations */}
        <Card className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-2">
              <Bookmark className="w-4 h-4" />
              Timeline Annotations
            </h2>
            <span className="text-xs text-text-muted">{events.length} event{events.length !== 1 ? "s" : ""}</span>
          </div>

          {/* Add event form */}
          <div className="flex gap-2 items-start">
            <select
              value={newEventType}
              onChange={(e) => setNewEventType(e.target.value as typeof newEventType)}
              className="text-xs rounded-lg border border-border bg-surface px-2 py-1.5 text-text-secondary focus:outline-none focus:ring-1 focus:ring-accent"
            >
              <option value="note">Note</option>
              <option value="deploy">Deploy</option>
              <option value="incident">Incident</option>
              <option value="maintenance">Maintenance</option>
              <option value="config">Config</option>
            </select>
            <input
              type="text"
              value={newEventMsg}
              onChange={(e) => setNewEventMsg(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void handleAddEvent(); } }}
              placeholder="Add annotation… (e.g. Deployed v2.3.1)"
              className="flex-1 text-sm rounded-lg border border-border bg-surface px-3 py-1.5 text-text-primary placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <Button
              size="sm"
              variant="primary"
              onClick={() => void handleAddEvent()}
              disabled={addingEvent || !newEventMsg.trim()}
              className="flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              {addingEvent ? "Saving…" : "Add"}
            </Button>
          </div>
          {eventError && <p className="text-xs text-danger">{eventError}</p>}

          {/* Event list */}
          {events.length === 0 ? (
            <p className="text-xs text-text-muted text-center py-4">No annotations yet. Mark deploys, config changes, or incidents above.</p>
          ) : (
            <div className="space-y-2">
              {events.map((ev) => {
                const typeColors: Record<string, string> = {
                  deploy: "bg-blue-500/15 text-blue-400 border-blue-500/30",
                  note: "bg-surface-elevated text-text-muted border-border",
                  incident: "bg-red-500/15 text-red-400 border-red-500/30",
                  maintenance: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
                  config: "bg-purple-500/15 text-purple-400 border-purple-500/30",
                };
                const cls = typeColors[ev.eventType] ?? typeColors.note;
                return (
                  <div key={ev.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-surface-elevated border border-border group">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium uppercase tracking-wider flex-shrink-0 ${cls}`}>
                      {ev.eventType}
                    </span>
                    <span className="flex-1 text-sm text-text-primary truncate">{ev.message}</span>
                    <span className="text-xs text-text-muted flex-shrink-0">{relativeTime(ev.createdAt)}</span>
                    <button
                      onClick={() => void handleDeleteEvent(ev.id)}
                      className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-danger transition-all flex-shrink-0"
                      aria-label="Delete event"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

      </div>
    </AppFrame>
  );
}

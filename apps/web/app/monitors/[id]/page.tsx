"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { AlertCircle, Activity, Clock, TrendingUp, Zap, Settings, Play, Power, PowerOff, GitBranch, Trash2, Plus, X, Gauge, Bookmark, Download, ChevronDown, Wifi, Shield, Globe, CheckCircle, XCircle, FileText } from "lucide-react";
import { Breadcrumb } from "../../../components/breadcrumb";
import { api } from "../../../lib/api";
import { createRealtimeSocket } from "../../../lib/realtime";
import { getUser } from "../../../components/auth";
import { AppFrame } from "../../../components/app-frame";
import { Card } from "../../components/Card";
import { Badge } from "../../components/Badge";
import { Button } from "../../components/Button";
import { FadeIn } from "../../components/FadeIn";
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from "../../components/Table";
import { ResponseAreaChart, CheckBarChart, LineSparkline } from "../../../components/charts";
import { relativeTime, formatMonitorType } from "../../components/timeUtils";
import type {
  MonitorItem,
  AlertChannelInfo,
  MonitorDependency,
  MonitorRun,
  RunTimings,
  UptimePeriod,
  UptimeStats,
  ErrorBudget,
  HealthScore,
  MonitorEvent,
  ChartPoint,
} from "./components/types";
import { SloTab } from "./components/SloTab";

interface AlertDelivery {
  id: string;
  channelId: string;
  channelName: string;
  channelType: string;
  status: "success" | "failed";
  trigger: string | null;
  errorMessage: string | null;
  durationMs: number | null;
  createdAt: string;
}

interface DeliveryHistory {
  total: number;
  successCount: number;
  failedCount: number;
  deliveries: AlertDelivery[];
}
import { PERIOD_LABELS, formatDuration } from "./components/types";
import { UptimeHeatmapChart } from "./components/UptimeHeatmapChart";
import { ResponseBodyViewer } from "./components/ResponseBodyViewer";

// ── Latency Distribution Types ───────────────────────────────────────────────

interface LatencyBucket {
  rangeLabel: string;
  from: number;
  to: number;
  count: number;
  pct: number;
}

interface LatencyPercentiles {
  p50: number | null;
  p75: number | null;
  p90: number | null;
  p95: number | null;
  p99: number | null;
}

interface HourlyAvgEntry {
  hour: number;
  avgMs: number | null;
  p95Ms: number | null;
  count: number;
}

interface LatencyDistributionData {
  buckets: LatencyBucket[];
  percentiles: LatencyPercentiles;
  hourlyAvg: HourlyAvgEntry[];
  totalChecks: number;
  successChecks: number;
  checkedRange: string;
}

// ── Status Transitions Types ──────────────────────────────────────────────────

interface StatusTransition {
  from: string;
  to: string;
  at: string;
  message: string | null;
  latencyMs: number | null;
  durationSec: number | null;
}

interface StatusTransitionsData {
  transitions: StatusTransition[];
  summary: {
    totalOutages: number;
    totalDowntimeSec: number;
    avgRecoveryTimeSec: number | null;
    mtbfSec: number | null;
  };
  period: string;
  checkedRange: string;
  totalRuns: number;
  currentStatus: string;
}

interface PeriodStats {
  total: number;
  successCount: number;
  uptime: number | null;
  avgMs: number | null;
  p50Ms: number | null;
  p95Ms: number | null;
}

interface PeriodComparisonData {
  period: string;
  current: PeriodStats;
  prior: PeriodStats;
  delta: {
    uptimePct: number | null;
    avgMsPct: number | null;
    p95MsPct: number | null;
  };
}

// ── Timing Waterfall ─────────────────────────────────────────────────────────

interface TimingWaterfallProps {
  timings: RunTimings;
  totalMs: number | null;
}

interface TimingPhase {
  label: string;
  value: number | null;
  color: string;
}

function TimingWaterfall({ timings, totalMs }: TimingWaterfallProps) {
  const phases: TimingPhase[] = [
    { label: "DNS", value: timings.dnsMs, color: "bg-blue-500" },
    { label: "TCP", value: timings.tcpMs, color: "bg-green-500" },
    { label: "TLS", value: timings.tlsMs, color: "bg-purple-500" },
    { label: "TTFB", value: timings.ttfbMs, color: "bg-orange-500" },
    { label: "Download", value: timings.downloadMs, color: "bg-cyan-500" },
  ];

  const total = totalMs ?? phases.reduce((sum, p) => sum + (p.value ?? 0), 0);
  const maxMs = Math.max(...phases.map((p) => p.value ?? 0), 1);

  return (
    <div className="my-2 p-3 rounded-lg bg-surface-elevated border border-border text-xs">
      <p className="text-text-muted mb-2 font-medium uppercase tracking-wide text-[10px]">Timing Breakdown</p>
      <div className="space-y-1.5">
        {phases.map((phase) => (
          <div key={phase.label} className="flex items-center gap-2">
            <span className="w-16 text-text-secondary text-right shrink-0">{phase.label}</span>
            <div className="flex-1 flex items-center gap-2">
              {phase.value !== null ? (
                <>
                  <div className="flex-1 bg-surface rounded-full h-2 overflow-hidden">
                    <div
                      className={`${phase.color} h-2 rounded-full transition-all`}
                      style={{ width: `${Math.max(2, (phase.value / maxMs) * 100)}%` }}
                    />
                  </div>
                  <span className="text-text-primary font-mono w-14 text-right shrink-0">{phase.value}ms</span>
                </>
              ) : (
                <>
                  <div className="flex-1 bg-surface rounded-full h-2" />
                  <span className="text-text-muted font-mono w-14 text-right shrink-0">N/A</span>
                </>
              )}
            </div>
          </div>
        ))}
        <div className="flex items-center gap-2 pt-1 border-t border-border mt-1">
          <span className="w-16 text-text-muted text-right shrink-0">Total</span>
          <div className="flex-1" />
          <span className="text-text-primary font-mono font-semibold w-14 text-right shrink-0">{total}ms</span>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

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
  const [chartPeriod, setChartPeriod] = useState<UptimePeriod>("7d");
  const [chartData, setChartData] = useState<ChartPoint[]>([]);
  const [chartLoading, setChartLoading] = useState(false);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [running, setRunning] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [toast, setToast] = useState("");
  const [liveConnected, setLiveConnected] = useState(false);
  const [alertChannels, setAlertChannels] = useState<AlertChannelInfo[]>([]);
  const [dependencies, setDependencies] = useState<MonitorDependency[]>([]);
  const [allMonitors, setAllMonitors] = useState<MonitorItem[]>([]);
  const [showAddDep, setShowAddDep] = useState(false);
  const [addingDepId, setAddingDepId] = useState("");
  const [depLoading, setDepLoading] = useState(false);
  const [errorBudget, setErrorBudget] = useState<ErrorBudget | null>(null);
  const [healthScore, setHealthScore] = useState<HealthScore | null>(null);
  const [activeMainTab, setActiveMainTab] = useState<"overview" | "slo" | "performance" | "certificate" | "domain" | "security" | "content">("overview");

  // Performance / Latency distribution
  const [perfData, setPerfData] = useState<LatencyDistributionData | null>(null);
  const [perfLoading, setPerfLoading] = useState(false);
  const [perfError, setPerfError] = useState<string | null>(null);
  const [perfPeriod, setPerfPeriod] = useState<"24h" | "7d" | "30d">("7d");
  const [transitionsData, setTransitionsData] = useState<StatusTransitionsData | null>(null);
  const [perfComparison, setPerfComparison] = useState<PeriodComparisonData | null>(null);

  // Certificate details (SSL/HTTP monitors)
  const [certDetails, setCertDetails] = useState<Record<string, unknown> | null>(null);
  const [certLoading, setCertLoading] = useState(false);

  // Alert delivery history
  const [deliveryHistory, setDeliveryHistory] = useState<DeliveryHistory | null>(null);

  // Linked formal incidents
  const [linkedIncidents, setLinkedIncidents] = useState<Array<{
    id: string;
    title: string;
    status: string;
    severity: string;
    autoCreated: boolean;
    createdAt: string;
    resolvedAt: string | null;
    durationSec: number | null;
  }> | null>(null);

  // Mute & Acknowledge
  const [showMuteMenu, setShowMuteMenu] = useState(false);
  const [muteLoading, setMuteLoading] = useState(false);
  const [showAckModal, setShowAckModal] = useState(false);
  const [ackNote, setAckNote] = useState("");
  const [ackLoading, setAckLoading] = useState(false);

  // Timeline events/annotations
  const [events, setEvents] = useState<MonitorEvent[]>([]);
  const [newEventMsg, setNewEventMsg] = useState("");
  const [newEventType, setNewEventType] = useState<"deploy"|"note"|"incident"|"maintenance"|"config">("note");
  const [addingEvent, setAddingEvent] = useState(false);
  const [eventError, setEventError] = useState("");

  // Check history pagination + filter
  const [runsStatusFilter, setRunsStatusFilter] = useState<"all"|"ok"|"failed">("all");
  const [runsHasMore, setRunsHasMore] = useState(false);
  const [runsNextCursor, setRunsNextCursor] = useState<string | null>(null);
  const [runsTotal, setRunsTotal] = useState<number | null>(null);
  const [runsLoadingMore, setRunsLoadingMore] = useState(false);
  // Timing waterfall — stores the expanded run ID (click to expand)
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);

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
        const [found, monitorRunsPage, alertChs, deps, evts, deliveries, allMonitors, incidents] = await Promise.all([
          api<MonitorItem>(`/v1/monitors/${id}`, user!.id).catch(() => null),
          api<{ runs: MonitorRun[]; hasMore: boolean; total: number; nextCursor: string | null }>(`/v1/monitors/${id}/runs?limit=100`, user!.id),
          api<AlertChannelInfo[]>(`/v1/monitors/${id}/alerts`, user!.id).catch(() => []),
          api<MonitorDependency[]>(`/v1/monitors/${id}/dependencies`, user!.id).catch(() => []),
          api<MonitorEvent[]>(`/v1/monitors/${id}/events`, user!.id).catch(() => []),
          api<DeliveryHistory>(`/v1/monitors/${id}/deliveries`, user!.id).catch(() => null),
          api<MonitorItem[]>("/v1/monitors", user!.id).catch(() => [] as MonitorItem[]),
          api<{ total: number; incidents: Array<{ id: string; title: string; status: string; severity: string; autoCreated: boolean; createdAt: string; resolvedAt: string | null; durationSec: number | null }> }>(`/v1/monitors/${id}/incidents`, user!.id).catch(() => null),
        ]);
        if (!found) {
          router.push("/monitors");
          return;
        }
        setMonitor(found);
        setRuns(monitorRunsPage.runs);
        setRunsHasMore(monitorRunsPage.hasMore);
        setRunsNextCursor(monitorRunsPage.nextCursor);
        setRunsTotal(monitorRunsPage.total);
        setAlertChannels(alertChs);
        setDependencies(deps);
        setEvents(evts);
        setDeliveryHistory(deliveries);
        setAllMonitors(allMonitors);
        setLinkedIncidents(incidents?.incidents ?? []);
        // Fetch error budget if SLA target is set
        if (found.slaTarget) {
          api<ErrorBudget>(`/v1/monitors/${id}/error-budget?period=30d`, user!.id)
            .then((eb) => setErrorBudget(eb))
            .catch(() => null);
        }
        // Fetch health score (non-fatal)
        api<HealthScore>(`/v1/monitors/${id}/health-score`, user!.id)
          .then((hs) => setHealthScore(hs))
          .catch(() => null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load monitor");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [id, router]);

  // Live updates via WebSocket: prepend new runs to the check history
  useEffect(() => {
    const user = getUser();
    if (!user || !id) return;
    const socket = createRealtimeSocket(user.id);
    socket.on("connect", () => {
      socket.emit("subscribe", { userId: user.id });
      setLiveConnected(true);
    });
    socket.on("disconnect", () => setLiveConnected(false));
    socket.on("monitor.checked", (payload: { run: MonitorRun }) => {
      if (payload.run?.monitorId !== id) return;
      setRuns((prev) => [payload.run, ...prev.slice(0, 199)]);
      // Also refresh monitor mute/ack state
      api<MonitorItem>(`/v1/monitors/${id}`, user.id)
        .then((m) => setMonitor((prev) => prev ? { ...prev, mutedUntil: m.mutedUntil, isAcknowledged: m.isAcknowledged } : prev))
        .catch(() => { /* non-critical */ });
    });
    return () => { socket.disconnect(); setLiveConnected(false); };
  }, [id]);

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

  const loadChartData = useCallback(
    async (period: UptimePeriod) => {
      const user = getUser();
      if (!user || !id) return;
      setChartLoading(true);
      try {
        const data = await api<{ points: ChartPoint[] }>(`/v1/monitors/${id}/chart?period=${period}`, user.id);
        setChartData(data.points);
      } catch {
        // Non-fatal
      } finally {
        setChartLoading(false);
      }
    },
    [id],
  );

  useEffect(() => {
    if (!loading && monitor) {
      loadUptime(uptimePeriod);
    }
  }, [loading, monitor, uptimePeriod, loadUptime]);

  useEffect(() => {
    if (!loading && monitor) {
      loadChartData(chartPeriod);
    }
  }, [loading, monitor, chartPeriod, loadChartData]);

  // Load runs with optional status filter (resets pagination)
  const loadFilteredRuns = useCallback(async (statusFilter: "all" | "ok" | "failed") => {
    const user = getUser();
    if (!user) return;
    setRunsStatusFilter(statusFilter);
    try {
      const qs = statusFilter !== "all" ? `&status=${statusFilter}` : "";
      const page = await api<{ runs: MonitorRun[]; hasMore: boolean; total: number; nextCursor: string | null }>(
        `/v1/monitors/${id}/runs?limit=100${qs}`,
        user.id,
      );
      setRuns(page.runs);
      setRunsHasMore(page.hasMore);
      setRunsNextCursor(page.nextCursor);
      setRunsTotal(page.total);
    } catch {
      // non-fatal
    }
  }, [id]);

  // Append next page of runs (cursor pagination)
  const loadMoreRuns = useCallback(async () => {
    const user = getUser();
    if (!user || !runsNextCursor || runsLoadingMore) return;
    setRunsLoadingMore(true);
    try {
      const qs = runsStatusFilter !== "all" ? `&status=${runsStatusFilter}` : "";
      const page = await api<{ runs: MonitorRun[]; hasMore: boolean; total: number; nextCursor: string | null }>(
        `/v1/monitors/${id}/runs?limit=100&before=${encodeURIComponent(runsNextCursor)}${qs}`,
        user.id,
      );
      setRuns((prev) => [...prev, ...page.runs]);
      setRunsHasMore(page.hasMore);
      setRunsNextCursor(page.nextCursor);
    } catch {
      // non-fatal
    } finally {
      setRunsLoadingMore(false);
    }
  }, [id, runsNextCursor, runsLoadingMore, runsStatusFilter]);

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
          const updatedPage = await api<{ runs: MonitorRun[]; hasMore: boolean; total: number; nextCursor: string | null }>(`/v1/monitors/${id}/runs?limit=100${runsStatusFilter !== "all" ? `&status=${runsStatusFilter}` : ""}`, user.id);
          setRuns(updatedPage.runs);
          setRunsHasMore(updatedPage.hasMore);
          setRunsNextCursor(updatedPage.nextCursor);
          setRunsTotal(updatedPage.total);
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

  const handleMute = async (minutes: number) => {
    const user = getUser();
    if (!user || !monitor) return;
    setMuteLoading(true);
    setShowMuteMenu(false);
    try {
      const result = await api<{ mutedUntil: string }>(`/v1/monitors/${id}/mute`, user.id, {
        method: "POST",
        body: JSON.stringify({ minutes }),
      });
      setMonitor((prev) => prev ? { ...prev, mutedUntil: result.mutedUntil } : prev);
      setToast(`Monitor muted for ${minutes < 60 ? `${minutes} min` : `${minutes / 60}h`}`);
      setTimeout(() => setToast(""), 3000);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to mute monitor");
    } finally {
      setMuteLoading(false);
    }
  };

  const handleUnmute = async () => {
    const user = getUser();
    if (!user || !monitor) return;
    setMuteLoading(true);
    try {
      await api(`/v1/monitors/${id}/mute`, user.id, { method: "DELETE" });
      setMonitor((prev) => prev ? { ...prev, mutedUntil: null } : prev);
      setToast("Monitor unmuted");
      setTimeout(() => setToast(""), 3000);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to unmute monitor");
    } finally {
      setMuteLoading(false);
    }
  };

  const handleAcknowledge = async () => {
    const user = getUser();
    if (!user || !monitor) return;
    setAckLoading(true);
    try {
      await api(`/v1/monitors/${id}/acknowledge`, user.id, {
        method: "POST",
        body: JSON.stringify({ note: ackNote || undefined }),
      });
      setMonitor((prev) => prev ? { ...prev, isAcknowledged: true } : prev);
      setAckNote("");
      setShowAckModal(false);
      setToast("Alert acknowledged");
      setTimeout(() => setToast(""), 3000);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to acknowledge alert");
    } finally {
      setAckLoading(false);
    }
  };

  const handleClearAck = async () => {
    const user = getUser();
    if (!user || !monitor) return;
    try {
      await api(`/v1/monitors/${id}/acknowledge`, user.id, { method: "DELETE" });
      setMonitor((prev) => prev ? { ...prev, isAcknowledged: false } : prev);
      setToast("Acknowledgement cleared");
      setTimeout(() => setToast(""), 3000);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to clear acknowledgement");
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
                {liveConnected && (
                  <span title="Live updates active" className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-success/10 text-success border border-success/20">
                    <Wifi className="w-3 h-3" />
                    Live
                  </span>
                )}
                {monitor.isFlapping && (
                  <span
                    title="This monitor is flapping — it is rapidly alternating between healthy and unhealthy states. Alerts are suppressed until it stabilizes."
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-warning/15 text-warning border border-warning/30 animate-pulse cursor-help"
                  >
                    ⚡ Flapping
                  </span>
                )}
                {/* Muted badge */}
                {monitor.mutedUntil && new Date(monitor.mutedUntil) > new Date() && (
                  <button
                    onClick={handleUnmute}
                    title="Click to unmute"
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30 hover:border-amber-400/60 transition-colors"
                  >
                    🔇 Muted until {new Date(monitor.mutedUntil).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </button>
                )}
                {/* Acknowledged badge */}
                {monitor.isAcknowledged && (
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      title={(monitor as typeof monitor & { activeAck?: { note: string | null } | null }).activeAck?.note ?? "Alert acknowledged"}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-500/15 text-blue-400 border border-blue-500/30 cursor-help"
                    >
                      🔔 Acknowledged
                      {(monitor as typeof monitor & { activeAck?: { note: string | null } | null }).activeAck?.note && (
                        <span className="opacity-70 max-w-[120px] truncate">&nbsp;— {(monitor as typeof monitor & { activeAck?: { note: string | null } | null }).activeAck!.note}</span>
                      )}
                    </span>
                    <button
                      onClick={handleClearAck}
                      className="text-xs text-text-muted hover:text-text-secondary underline underline-offset-2"
                    >
                      Clear
                    </button>
                  </span>
                )}
              </div>
              {/* Action buttons */}
              <div className="flex items-center gap-2 shrink-0">
                {/* Mute button */}
                <div className="relative">
                  <button
                    onClick={() => setShowMuteMenu((v) => !v)}
                    disabled={muteLoading}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl border border-amber-500/30 bg-amber-500/5 text-amber-400/80 hover:text-amber-400 hover:border-amber-400/50 transition-colors"
                    title="Mute alerts for this monitor"
                  >
                    🔇 Mute
                  </button>
                  {showMuteMenu && (
                    <div className="absolute right-0 top-full mt-1 z-50 w-40 rounded-xl border border-border bg-surface-elevated shadow-lg overflow-hidden">
                      {[{ label: "30 min", minutes: 30 }, { label: "1 hour", minutes: 60 }, { label: "4 hours", minutes: 240 }, { label: "24 hours", minutes: 1440 }].map(({ label, minutes }) => (
                        <button
                          key={minutes}
                          onClick={() => handleMute(minutes)}
                          className="w-full text-left px-3 py-2 text-xs text-text-secondary hover:bg-surface hover:text-text-primary transition-colors"
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {/* Acknowledge button (only when failing/degraded) */}
                {!monitor.isAcknowledged && lastRun && !lastRun.ok && (
                  <button
                    onClick={() => setShowAckModal(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl border border-blue-500/30 bg-blue-500/5 text-blue-400/80 hover:text-blue-400 hover:border-blue-400/50 transition-colors"
                    title="Acknowledge this alert"
                  >
                    🔔 Acknowledge
                  </button>
                )}
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
                <Link
                  href={`/monitors#edit-${monitor.id}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl border border-border bg-surface-elevated text-text-secondary hover:text-accent hover:border-accent/50 transition-colors"
                  title="Edit this monitor"
                >
                  <Settings className="w-3.5 h-3.5" />
                  Edit
                </Link>
                <button
                  onClick={async () => {
                    if (!confirm(`Delete "${monitor.name}"? This will also delete all check history.`)) return;
                    const user = getUser();
                    if (!user) return;
                    try {
                      await api(`/v1/monitors/${monitor.id}`, user.id, { method: "DELETE" });
                      router.push("/monitors");
                    } catch (e) {
                      setActionError(e instanceof Error ? e.message : "Failed to delete monitor");
                    }
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl border border-danger/30 bg-danger/5 text-danger/70 hover:text-danger hover:border-danger/60 transition-colors"
                  title="Delete this monitor"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete
                </button>
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
            {(monitor as { runbookUrl?: string | null }).runbookUrl && (
              <a
                href={(monitor as { runbookUrl?: string | null }).runbookUrl!}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline"
              >
                📖 Runbook
              </a>
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

        {/* Main Tab Navigation */}
        <div className="flex gap-1 p-1 bg-white/3 border border-white/8 rounded-xl w-fit">
          <button
            onClick={() => setActiveMainTab("overview")}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              activeMainTab === "overview"
                ? "bg-white/10 text-text-primary"
                : "text-text-muted hover:text-text-secondary"
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveMainTab("slo")}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
              activeMainTab === "slo"
                ? "bg-white/10 text-text-primary"
                : "text-text-muted hover:text-text-secondary"
            }`}
          >
            <Gauge className="w-3.5 h-3.5" />
            SLO / SLI
          </button>
          {(monitor.type === "HTTP" || monitor.type === "BROWSER" || monitor.type === "TCP") && (
            <button
              onClick={async () => {
                setActiveMainTab("performance");
                const user = getUser();
                if (!user) return;
                setPerfLoading(true);
                setPerfError(null);
                try {
                  const [data, comparison, txData] = await Promise.all([
                    api<LatencyDistributionData>(`/v1/monitors/${id}/latency-distribution?period=${perfPeriod}`, user.id),
                    api<PeriodComparisonData>(`/v1/monitors/${id}/period-comparison?period=${perfPeriod}`, user.id).catch(() => null),
                    api<StatusTransitionsData>(`/v1/monitors/${id}/status-transitions?period=${perfPeriod}`, user.id).catch(() => null),
                  ]);
                  setPerfData(data);
                  setPerfComparison(comparison);
                  setTransitionsData(txData);
                } catch {
                  setPerfError("Failed to load performance data");
                } finally {
                  setPerfLoading(false);
                }
              }}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
                activeMainTab === "performance"
                  ? "bg-white/10 text-text-primary"
                  : "text-text-muted hover:text-text-secondary"
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              Performance
            </button>
          )}
          {(monitor.type === "HTTP" || monitor.type === "SSL_CERT" || monitor.type === "BROWSER") && (
            <button
              onClick={async () => {
                setActiveMainTab("certificate");
                if (!certDetails && !certLoading) {
                  const user = getUser();
                  if (!user) return;
                  setCertLoading(true);
                  try {
                    const data = await api<Record<string, unknown>>(`/v1/monitors/${id}/certificate`, user.id);
                    setCertDetails(data);
                  } catch {
                    setCertDetails({ supported: true, available: false, reason: "Failed to fetch certificate details" });
                  } finally {
                    setCertLoading(false);
                  }
                }
              }}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
                activeMainTab === "certificate"
                  ? "bg-white/10 text-text-primary"
                  : "text-text-muted hover:text-text-secondary"
              }`}
            >
              <Shield className="w-3.5 h-3.5" />
              Certificate
            </button>
          )}
          {monitor.type === "WHOIS" && (
            <button
              onClick={() => setActiveMainTab("domain")}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
                activeMainTab === "domain"
                  ? "bg-white/10 text-text-primary"
                  : "text-text-muted hover:text-text-secondary"
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              Domain
            </button>
          )}
          {(monitor.type === "HTTP" || monitor.type === "BROWSER") && !!(monitor.config as Record<string, unknown>)?.checkSecurityHeaders && (
            <button
              onClick={() => setActiveMainTab("security")}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
                activeMainTab === "security"
                  ? "bg-white/10 text-text-primary"
                  : "text-text-muted hover:text-text-secondary"
              }`}
            >
              <Shield className="w-3.5 h-3.5" />
              Security
            </button>
          )}
          {(monitor.type === "HTTP" || monitor.type === "BROWSER") && !!(monitor.config as Record<string, unknown>)?.detectContentChanges && (
            <button
              onClick={() => setActiveMainTab("content")}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
                activeMainTab === "content"
                  ? "bg-white/10 text-text-primary"
                  : "text-text-muted hover:text-text-secondary"
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              Content
            </button>
          )}
        </div>

        {/* SLO Tab Content */}
        {activeMainTab === "slo" && ((): React.ReactNode => {
          const user = getUser();
          return user ? (
            <SloTab
              monitor={monitor}
              userId={user.id}
              onMonitorUpdated={(updated) => setMonitor((prev) => prev ? { ...prev, ...updated } : prev)}
            />
          ) : null;
        })()}

        {/* Performance Tab Content */}
        {activeMainTab === "performance" && (
          <div className="space-y-4">
            {/* Period Selector */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-text-muted font-medium">Period:</span>
              {(["24h", "7d", "30d"] as const).map((p) => (
                <button
                  key={p}
                  onClick={async () => {
                    setPerfPeriod(p);
                    const user = getUser();
                    if (!user) return;
                    setPerfLoading(true);
                    setPerfError(null);
                    try {
                      const [data, comparison, txData] = await Promise.all([
                        api<LatencyDistributionData>(`/v1/monitors/${id}/latency-distribution?period=${p}`, user.id),
                        api<PeriodComparisonData>(`/v1/monitors/${id}/period-comparison?period=${p}`, user.id).catch(() => null),
                        api<StatusTransitionsData>(`/v1/monitors/${id}/status-transitions?period=${p}`, user.id).catch(() => null),
                      ]);
                      setPerfData(data);
                      setPerfComparison(comparison);
                      setTransitionsData(txData);
                    } catch {
                      setPerfError("Failed to load performance data");
                    } finally {
                      setPerfLoading(false);
                    }
                  }}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    perfPeriod === p
                      ? "bg-accent text-white"
                      : "bg-white/5 text-text-muted hover:text-text-secondary border border-white/10"
                  }`}
                >
                  {p}
                </button>
              ))}
              {perfData && (
                <span className="ml-auto text-xs text-text-muted">{perfData.checkedRange} · {perfData.successChecks} successful checks</span>
              )}
            </div>

            {perfLoading && (
              <Card className="p-8 text-center text-text-muted text-sm">Loading performance data…</Card>
            )}
            {perfError && !perfLoading && (
              <Card className="p-8 text-center text-danger text-sm">{perfError}</Card>
            )}
            {perfData && !perfLoading && (
              <>
                {/* A. Latency Distribution Histogram */}
                <Card className="p-4">
                  <div className="flex items-center gap-2 mb-4">
                    <Activity className="w-4 h-4 text-accent" />
                    <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">Latency Distribution</h2>
                  </div>
                  {perfData.successChecks === 0 ? (
                    <p className="text-text-muted text-sm text-center py-4">No successful checks in this period.</p>
                  ) : (
                    <div className="space-y-2">
                      {perfData.buckets.map((bucket) => {
                        const maxCount = Math.max(...perfData.buckets.map((b) => b.count), 1);
                        const widthPct = (bucket.count / maxCount) * 100;
                        const barColor =
                          bucket.to !== -1 && bucket.to <= 200
                            ? "bg-green-500"
                            : bucket.to !== -1 && bucket.to <= 500
                            ? "bg-yellow-500"
                            : bucket.to !== -1 && bucket.to <= 1000
                            ? "bg-orange-500"
                            : "bg-red-500";
                        return (
                          <div key={bucket.rangeLabel} className="flex items-center gap-2 text-xs">
                            <span className="w-20 text-text-muted text-right shrink-0 font-mono">{bucket.rangeLabel}</span>
                            <div className="flex-1 bg-white/5 rounded-full h-5 overflow-hidden">
                              <div
                                className={`${barColor} h-5 rounded-full transition-all`}
                                style={{ width: `${Math.max(bucket.count > 0 ? 2 : 0, widthPct)}%` }}
                              />
                            </div>
                            <span className="w-8 text-right text-text-secondary tabular-nums shrink-0">{bucket.count}</span>
                            <span className="w-12 text-right text-text-muted tabular-nums shrink-0">({bucket.pct}%)</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </Card>

                {/* B. Percentile Cards */}
                <div className="grid grid-cols-5 gap-2">
                  {(["p50", "p75", "p90", "p95", "p99"] as const).map((key) => {
                    const val = perfData.percentiles[key];
                    const color =
                      val === null
                        ? "text-text-muted"
                        : val < 200
                        ? "text-green-400"
                        : val < 500
                        ? "text-yellow-400"
                        : "text-red-400";
                    return (
                      <Card key={key} className="p-3 text-center">
                        <p className="text-xs text-text-muted mb-1 uppercase tracking-wider">{key.toUpperCase()}</p>
                        <p className={`text-lg font-bold tabular-nums ${color}`}>
                          {val !== null ? `${val}ms` : "—"}
                        </p>
                      </Card>
                    );
                  })}
                </div>

                {/* C. Period Comparison */}
                {perfComparison && (
                  <Card className="p-4">
                    <div className="flex items-center gap-2 mb-4">
                      <TrendingUp className="w-4 h-4 text-accent" />
                      <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">
                        vs. Previous {perfPeriod === "24h" ? "24 hours" : perfPeriod === "7d" ? "7 days" : "30 days"}
                      </h2>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      {([
                        { label: "Uptime", curr: perfComparison.current.uptime !== null ? `${perfComparison.current.uptime}%` : "—", delta: perfComparison.delta.uptimePct, higher: true },
                        { label: "Avg Latency", curr: perfComparison.current.avgMs !== null ? `${perfComparison.current.avgMs}ms` : "—", delta: perfComparison.delta.avgMsPct, higher: false },
                        { label: "P95 Latency", curr: perfComparison.current.p95Ms !== null ? `${perfComparison.current.p95Ms}ms` : "—", delta: perfComparison.delta.p95MsPct, higher: false },
                      ] as Array<{ label: string; curr: string; delta: number | null; higher: boolean }>).map((metric) => {
                        const improved = metric.delta !== null && (metric.higher ? metric.delta > 0 : metric.delta < 0);
                        const degraded = metric.delta !== null && (metric.higher ? metric.delta < 0 : metric.delta > 0);
                        const deltaColor = improved ? "text-green-400" : degraded ? "text-red-400" : "text-text-muted";
                        const deltaPrefix = metric.delta !== null && metric.delta > 0 ? "+" : "";
                        return (
                          <div key={metric.label} className="text-center">
                            <p className="text-xs text-text-muted mb-1">{metric.label}</p>
                            <p className="text-lg font-bold text-text-primary tabular-nums">{metric.curr}</p>
                            {metric.delta !== null ? (
                              <p className={`text-xs font-medium tabular-nums ${deltaColor}`}>
                                {deltaPrefix}{metric.delta}%
                              </p>
                            ) : (
                              <p className="text-xs text-text-muted">No prior data</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-3 flex items-center justify-between text-xs text-text-muted border-t border-border pt-2">
                      <span>Current: {perfComparison.current.total} checks, {perfComparison.current.successCount} ok</span>
                      <span>Prior: {perfComparison.prior.total} checks, {perfComparison.prior.successCount} ok</span>
                    </div>
                  </Card>
                )}

                {/* D. Hourly Heatmap */}
                <Card className="p-4">
                  <div className="flex items-center gap-2 mb-4">
                    <Clock className="w-4 h-4 text-accent" />
                    <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">Hourly Latency Pattern (UTC)</h2>
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    {perfData.hourlyAvg.map((h) => {
                      const bg =
                        h.count === 0
                          ? "bg-white/5"
                          : h.avgMs === null
                          ? "bg-white/5"
                          : h.avgMs < 200
                          ? "bg-green-500/60"
                          : h.avgMs < 500
                          ? "bg-yellow-500/60"
                          : h.avgMs < 1000
                          ? "bg-orange-500/60"
                          : "bg-red-500/60";
                      const tooltip =
                        h.count === 0
                          ? `Hour ${h.hour}:00 UTC — No data`
                          : `Hour ${h.hour}:00 UTC\nAvg: ${h.avgMs}ms\nP95: ${h.p95Ms}ms\nChecks: ${h.count}`;
                      return (
                        <div key={h.hour} className="flex flex-col items-center gap-0.5">
                          <div
                            title={tooltip}
                            className={`w-7 h-7 rounded ${bg} cursor-default transition-colors hover:ring-1 hover:ring-white/30`}
                          />
                          {h.hour % 6 === 0 && (
                            <span className="text-[9px] text-text-muted">{h.hour}</span>
                          )}
                          {h.hour % 6 !== 0 && <span className="text-[9px] text-transparent">·</span>}
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-3 mt-3 text-[10px] text-text-muted">
                    <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-white/5" /> No data</span>
                    <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-green-500/60" /> Fast (&lt;200ms)</span>
                    <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-yellow-500/60" /> Medium (200-500ms)</span>
                    <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-orange-500/60" /> Slow (500ms-1s)</span>
                    <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-red-500/60" /> Very Slow (&gt;1s)</span>
                  </div>
                </Card>

                {/* E. Status Transitions Timeline */}
                {transitionsData && (
                  <Card className="p-4">
                    <div className="flex items-center gap-2 mb-4">
                      <AlertCircle className="w-4 h-4 text-accent" />
                      <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">Status Transitions</h2>
                      <span className="ml-auto text-xs text-text-muted">{transitionsData.checkedRange}</span>
                    </div>
                    {/* Summary stats */}
                    <div className="grid grid-cols-4 gap-3 mb-4">
                      {[
                        { label: "Outages", value: String(transitionsData.summary.totalOutages), color: transitionsData.summary.totalOutages > 0 ? "text-danger" : "text-success" },
                        { label: "Total Downtime", value: transitionsData.summary.totalDowntimeSec > 0 ? formatDuration(transitionsData.summary.totalDowntimeSec) : "0s", color: "text-text-primary" },
                        { label: "Avg Recovery (MTTR)", value: transitionsData.summary.avgRecoveryTimeSec !== null ? formatDuration(transitionsData.summary.avgRecoveryTimeSec) : "—", color: "text-text-primary" },
                        { label: "MTBF", value: transitionsData.summary.mtbfSec !== null ? formatDuration(transitionsData.summary.mtbfSec) : "—", color: "text-text-primary" },
                      ].map((stat) => (
                        <div key={stat.label} className="text-center p-2 rounded-lg bg-white/3">
                          <p className="text-[10px] text-text-muted mb-1 uppercase tracking-wider">{stat.label}</p>
                          <p className={`text-sm font-bold tabular-nums ${stat.color}`}>{stat.value}</p>
                        </div>
                      ))}
                    </div>
                    {transitionsData.transitions.length === 0 ? (
                      <p className="text-text-muted text-sm text-center py-4">No status changes in this period — monitor has been stable. ✓</p>
                    ) : (
                      <div className="relative">
                        <div className="absolute left-[18px] top-0 bottom-0 w-px bg-white/10" />
                        <div className="space-y-3">
                          {transitionsData.transitions.map((t, i) => {
                            const isDown = t.to !== "green";
                            const dotColor = t.to === "green" ? "bg-success" : t.to === "yellow" ? "bg-warning" : "bg-danger";
                            const textColor = t.to === "green" ? "text-success" : t.to === "yellow" ? "text-warning" : "text-danger";
                            const arrow = `${t.from} → ${t.to}`;
                            return (
                              <div key={i} className="flex items-start gap-3 pl-1">
                                <div className={`w-4 h-4 rounded-full ${dotColor} shrink-0 mt-0.5 ring-2 ring-surface`} />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className={`text-xs font-semibold capitalize ${textColor}`}>{isDown ? "Outage" : "Recovery"}</span>
                                    <span className="text-[10px] text-text-muted font-mono">{arrow}</span>
                                    {t.durationSec !== null && (
                                      <span className="text-[10px] text-text-muted">· was {t.from} for {formatDuration(t.durationSec)}</span>
                                    )}
                                    <span className="ml-auto text-[10px] text-text-muted shrink-0">{relativeTime(t.at)}</span>
                                  </div>
                                  {t.message && (
                                    <p className="text-[11px] text-text-secondary mt-0.5 truncate">{t.message}</p>
                                  )}
                                  {t.latencyMs !== null && (
                                    <p className="text-[10px] text-text-muted">{t.latencyMs}ms</p>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </Card>
                )}
              </>
            )}
          </div>
        )}

        {/* Certificate Tab Content */}
        {activeMainTab === "certificate" && (
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-4">
              <Shield className="w-4 h-4 text-accent" />
              <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">TLS Certificate Details</h2>
              <button
                onClick={async () => {
                  const user = getUser();
                  if (!user) return;
                  setCertLoading(true);
                  try {
                    const data = await api<Record<string, unknown>>(`/v1/monitors/${id}/certificate`, user.id);
                    setCertDetails(data);
                  } catch {
                    setCertDetails({ supported: true, available: false, reason: "Failed to fetch certificate details" });
                  } finally {
                    setCertLoading(false);
                  }
                }}
                className="ml-auto text-xs text-accent hover:underline flex items-center gap-1"
                disabled={certLoading}
              >
                {certLoading ? "Loading…" : "↻ Refresh"}
              </button>
            </div>
            {certLoading && (
              <div className="text-center py-8 text-text-muted text-sm">Fetching live certificate data…</div>
            )}
            {!certLoading && certDetails && !(certDetails.available as boolean) && (
              <div className="text-center py-8">
                <p className="text-text-secondary text-sm">{String(certDetails.reason ?? "Certificate details unavailable")}</p>
              </div>
            )}
            {!certLoading && Boolean(certDetails?.available) && ((): React.ReactNode => {
              const cert = certDetails;
              if (!cert) return null;
              const status = String(cert.status ?? "unknown");
              const statusColors: Record<string, string> = {
                valid: "text-success",
                expiring: "text-yellow-400",
                critical: "text-danger",
                expired: "text-danger",
              };
              const gradeColors: Record<string, string> = {
                good: "bg-success/15 text-success border-success/30",
                fair: "bg-yellow-400/15 text-yellow-400 border-yellow-400/30",
                warning: "bg-yellow-400/15 text-yellow-400 border-yellow-400/30",
                critical: "bg-danger/15 text-danger border-danger/30",
                expired: "bg-danger/15 text-danger border-danger/30",
              };
              const daysLeft = Number(cert.daysRemaining ?? 0);
              const sans = Array.isArray(cert.sans) ? cert.sans as string[] : [];
              const subject = cert.subject as { CN?: string; O?: string } | null;
              const issuer = cert.issuer as { CN?: string; O?: string } | null;
              const cipher = cert.cipher as { name?: string; version?: string } | null;
              return (
                <div className="space-y-4">
                  {/* Status banner */}
                  <div className={`flex items-center gap-3 p-3 rounded-xl border ${gradeColors[String(cert.grade ?? "good")]}`}>
                    <Shield className="w-5 h-5 flex-shrink-0" />
                    <div>
                      <p className="font-semibold text-sm capitalize">{status === "valid" ? "Valid Certificate" : status === "expiring" ? `Expiring Soon — ${daysLeft} days left` : status === "critical" ? `Critical — Only ${daysLeft} days left!` : "Certificate Expired"}</p>
                      <p className="text-xs opacity-75">{String(cert.hostname ?? "")} · Checked in {Number(cert.latencyMs ?? 0)}ms</p>
                    </div>
                    <span className={`ml-auto text-xs font-bold uppercase tracking-wide ${statusColors[status]}`}>{String(cert.grade ?? "—").toUpperCase()}</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Subject */}
                    <div className="space-y-1.5">
                      <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">Subject</p>
                      <p className="text-sm text-text-primary">{subject?.CN ?? "—"}</p>
                      {subject?.O && <p className="text-xs text-text-secondary">{subject.O}</p>}
                    </div>

                    {/* Issuer */}
                    <div className="space-y-1.5">
                      <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">Issuer</p>
                      <p className="text-sm text-text-primary">{issuer?.CN ?? "—"}</p>
                      {issuer?.O && <p className="text-xs text-text-secondary">{issuer.O}</p>}
                    </div>

                    {/* Validity */}
                    <div className="space-y-1.5">
                      <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">Valid From</p>
                      <p className="text-sm text-text-primary">{cert.validFrom ? new Date(String(cert.validFrom)).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—"}</p>
                    </div>
                    <div className="space-y-1.5">
                      <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">Valid To</p>
                      <p className={`text-sm font-medium ${statusColors[status] ?? "text-text-primary"}`}>{cert.validTo ? new Date(String(cert.validTo)).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—"}</p>
                    </div>

                    {/* Protocol */}
                    <div className="space-y-1.5">
                      <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">TLS Protocol</p>
                      <p className="text-sm text-text-primary font-mono">{String(cert.protocol ?? "—")}</p>
                    </div>

                    {/* Cipher */}
                    <div className="space-y-1.5">
                      <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">Cipher Suite</p>
                      <p className="text-sm text-text-primary font-mono text-xs break-all">{cipher?.name ?? "—"}</p>
                    </div>

                    {/* Fingerprint */}
                    <div className="space-y-1.5 md:col-span-2">
                      <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">SHA-256 Fingerprint</p>
                      <p className="text-xs text-text-secondary font-mono break-all">{String(cert.fingerprint ?? "—")}</p>
                    </div>

                    {/* Serial */}
                    {Boolean(cert.serialNumber) && (
                      <div className="space-y-1.5 md:col-span-2">
                        <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">Serial Number</p>
                        <p className="text-xs text-text-secondary font-mono">{String(cert.serialNumber)}</p>
                      </div>
                    )}
                  </div>

                  {/* SANs */}
                  {sans.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">Subject Alternative Names ({sans.length})</p>
                      <div className="flex flex-wrap gap-1.5">
                        {sans.map((san, i) => (
                          <span key={i} className="px-2 py-0.5 text-xs rounded-md bg-surface-elevated border border-border text-text-secondary font-mono">{san}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </Card>
        )}

        {/* Domain Tab — WHOIS expiry info */}
        {activeMainTab === "domain" && monitor.type === "WHOIS" && ((): React.ReactNode => {
          // Parse expiry info from the last run message
          // Messages look like: 'Domain "example.com" expires in 120d (2026-07-24)'
          //                     'Domain "example.com" expires in 5d (2026-03-31) — CRITICAL'
          //                     'Domain "example.com" expires in 20d (2026-04-15) — warning'
          //                     'Domain "example.com" expired on 2025-12-01'
          //                     'WHOIS: example.com — expiry date not published by registrar'
          //                     'Domain "example.com" not found in WHOIS'
          let daysRemaining: number | null = null;
          let expiryDate: string | null = null;
          let domainName: string | null = null;
          let expiryStatus: "green" | "yellow" | "red" | "unknown" = "unknown";
          let notPublished = false;
          let notFound = false;

          const msg = lastRun?.message ?? "";

          // Extract domain name
          const domainMatch = msg.match(/["""]([^"""]+)["""]/);
          if (domainMatch) domainName = domainMatch[1];
          // Also try WHOIS: example.com — pattern
          if (!domainName) {
            const whoisMatch = msg.match(/WHOIS:\s+([^\s—–]+)/);
            if (whoisMatch) domainName = whoisMatch[1];
          }

          // Parse expiry days + date
          const expiresMatch = msg.match(/expires in (\d+)d \((\d{4}-\d{2}-\d{2})\)/);
          if (expiresMatch) {
            daysRemaining = parseInt(expiresMatch[1], 10);
            expiryDate = expiresMatch[2];
          }

          // Parse expired case
          const expiredMatch = msg.match(/expired on (\d{4}-\d{2}-\d{2})/);
          if (expiredMatch) {
            expiryDate = expiredMatch[1];
            daysRemaining = 0;
          }

          // Determine status from last run level
          if (lastRun?.level === "green") expiryStatus = "green";
          else if (lastRun?.level === "yellow") expiryStatus = "yellow";
          else if (lastRun?.level === "red") expiryStatus = "red";

          if (msg.includes("expiry date not published")) notPublished = true;
          if (msg.includes("not found in WHOIS")) notFound = true;

          const statusBannerClass = expiryStatus === "green"
            ? "bg-success/10 border-success/30 text-success"
            : expiryStatus === "yellow"
            ? "bg-yellow-400/10 border-yellow-400/30 text-yellow-400"
            : expiryStatus === "red"
            ? "bg-danger/10 border-danger/30 text-danger"
            : "bg-surface-elevated border-border text-text-secondary";

          const expiryBarWidth = daysRemaining !== null && daysRemaining > 0
            ? Math.min(100, Math.round((daysRemaining / 365) * 100))
            : 0;
          const expiryBarColor = expiryStatus === "green"
            ? "bg-success"
            : expiryStatus === "yellow"
            ? "bg-yellow-400"
            : "bg-danger";

          // History: show check results with expiry context
          const whoisRuns = runs.slice(0, 30);

          return (
            <Card className="p-4 space-y-5">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-accent" />
                <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">WHOIS Domain Expiry</h2>
              </div>

              {/* Status Banner */}
              <div className={`flex items-start gap-3 p-4 rounded-xl border ${statusBannerClass}`}>
                <Globe className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">
                    {notFound
                      ? `Domain not found in WHOIS`
                      : notPublished
                      ? `Expiry date not published by registrar`
                      : daysRemaining !== null && daysRemaining <= 0
                      ? `Domain has expired`
                      : daysRemaining !== null
                      ? `Expires in ${daysRemaining} day${daysRemaining !== 1 ? "s" : ""}`
                      : "No data yet — run a check to see expiry info"}
                  </p>
                  {domainName && (
                    <p className="text-xs opacity-75 mt-0.5 font-mono">{domainName}</p>
                  )}
                  {expiryDate && (
                    <p className="text-xs opacity-75 mt-0.5">
                      Expiry date: <span className="font-medium">{new Date(expiryDate + "T00:00:00Z").toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}</span>
                    </p>
                  )}
                </div>
                {daysRemaining !== null && daysRemaining > 0 && (
                  <div className="text-right flex-shrink-0">
                    <p className="text-3xl font-bold tabular-nums leading-none">{daysRemaining}</p>
                    <p className="text-xs opacity-75 mt-0.5">days left</p>
                  </div>
                )}
              </div>

              {/* Expiry Progress Bar */}
              {daysRemaining !== null && daysRemaining > 0 && (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs text-text-muted">
                    <span>Today</span>
                    <span>{daysRemaining}d remaining out of 365d shown</span>
                    <span>Expiry: {expiryDate ?? "—"}</span>
                  </div>
                  <div className="h-2 bg-surface-elevated rounded-full overflow-hidden border border-border">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${expiryBarColor}`}
                      style={{ width: `${expiryBarWidth}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Config info */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-surface-elevated border border-border">
                  <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-1">Warn Threshold</p>
                  <p className="text-lg font-bold text-yellow-400 tabular-nums">
                    {(monitor.config as { warnDays?: number } | null)?.warnDays ?? 30}d
                  </p>
                  <p className="text-xs text-text-secondary">Yellow alert below this</p>
                </div>
                <div className="p-3 rounded-lg bg-surface-elevated border border-border">
                  <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-1">Critical Threshold</p>
                  <p className="text-lg font-bold text-danger tabular-nums">
                    {(monitor.config as { criticalDays?: number } | null)?.criticalDays ?? 7}d
                  </p>
                  <p className="text-xs text-text-secondary">Red alert below this</p>
                </div>
              </div>

              {/* Check history */}
              {whoisRuns.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">Recent Checks</p>
                  <div className="space-y-1.5 max-h-72 overflow-y-auto">
                    {whoisRuns.map((run, idx) => {
                      const runDaysMatch = run.message?.match(/expires in (\d+)d/);
                      const runDays = runDaysMatch ? parseInt(runDaysMatch[1], 10) : null;
                      const levelColors: Record<string, string> = {
                        green: "text-success",
                        yellow: "text-yellow-400",
                        red: "text-danger",
                      };
                      return (
                        <div key={idx} className="flex items-center gap-3 py-1.5 px-2 rounded-lg hover:bg-white/3 transition-colors">
                          <span className={`text-xs font-medium w-12 tabular-nums ${run.level ? (levelColors[run.level] ?? "text-text-secondary") : "text-text-secondary"}`}>
                            {run.level?.toUpperCase() ?? "—"}
                          </span>
                          <span className="text-xs text-text-muted w-36 flex-shrink-0">
                            {new Date(run.checkedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                          </span>
                          <span className="text-xs text-text-secondary truncate flex-1">
                            {runDays !== null
                              ? `${runDays}d remaining`
                              : run.message?.length && run.message.length > 60
                              ? run.message.slice(0, 60) + "…"
                              : (run.message ?? "—")}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {whoisRuns.length === 0 && (
                <div className="text-center py-6 text-text-muted text-sm">
                  No checks yet — trigger a manual check to see domain expiry data.
                </div>
              )}
            </Card>
          );
        })()}

        {/* Security Headers Audit Tab */}
        {activeMainTab === "security" && (monitor.type === "HTTP" || monitor.type === "BROWSER") && ((): React.ReactNode => {
          // Get the latest run that has a security audit
          const auditRun = runs.find((r) => (r as typeof r & { securityAuditJson?: unknown }).securityAuditJson);
          const audit = auditRun ? (auditRun as typeof auditRun & { securityAuditJson?: { grade: string; score: number; headers: Array<{ name: string; present: boolean; value: string | null; severity: string; description: string; recommendation?: string }> } }).securityAuditJson : null;

          const gradeColor = (g: string) => {
            if (g === "A") return "text-success";
            if (g === "B") return "text-emerald-400";
            if (g === "C") return "text-yellow-400";
            if (g === "D") return "text-orange-400";
            return "text-danger";
          };
          const gradeBg = (g: string) => {
            if (g === "A") return "bg-success/10 border-success/30";
            if (g === "B") return "bg-emerald-400/10 border-emerald-400/30";
            if (g === "C") return "bg-yellow-400/10 border-yellow-400/30";
            if (g === "D") return "bg-orange-400/10 border-orange-400/30";
            return "bg-danger/10 border-danger/30";
          };
          const severityColor = (s: string) => {
            if (s === "critical") return "text-danger";
            if (s === "warning") return "text-yellow-400";
            return "text-text-muted";
          };
          const severityBadge = (s: string) => {
            if (s === "critical") return "bg-danger/10 text-danger border border-danger/20";
            if (s === "warning") return "bg-yellow-400/10 text-yellow-400 border border-yellow-400/20";
            return "bg-white/5 text-text-muted border border-white/10";
          };

          return (
            <Card className="p-5 space-y-5">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-2">
                  <Shield className="w-4 h-4" />
                  Security Headers Audit
                </h2>
                {auditRun && (
                  <span className="text-xs text-text-muted">
                    Last checked {new Date(auditRun.checkedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </span>
                )}
              </div>

              {!audit ? (
                <div className="text-center py-8 space-y-2">
                  <Shield className="w-8 h-8 text-text-muted mx-auto opacity-40" />
                  <p className="text-sm text-text-muted">No audit data yet.</p>
                  <p className="text-xs text-text-muted opacity-75">Run a check to populate security header audit results.</p>
                </div>
              ) : (
                <>
                  {/* Grade + Score */}
                  <div className="flex items-center gap-6">
                    <div className={`flex items-center justify-center w-20 h-20 rounded-2xl border-2 ${gradeBg(audit.grade)}`}>
                      <span className={`text-4xl font-bold ${gradeColor(audit.grade)}`}>{audit.grade}</span>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-text-primary">{audit.score}<span className="text-base font-normal text-text-muted">/100</span></p>
                      <p className="text-sm text-text-secondary mt-0.5">Security Score</p>
                      <div className="mt-2 w-48 h-2 bg-white/10 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${audit.score >= 75 ? "bg-success" : audit.score >= 55 ? "bg-yellow-400" : "bg-danger"}`}
                          style={{ width: `${audit.score}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Headers breakdown */}
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">Header Checks</p>
                    <div className="space-y-2">
                      {audit.headers.map((h) => (
                        <div key={h.name} className="flex items-start gap-3 p-3 rounded-lg bg-surface-2 border border-border">
                          <div className="flex-shrink-0 mt-0.5">
                            {h.present ? (
                              <CheckCircle className="w-4 h-4 text-success" />
                            ) : (
                              <XCircle className="w-4 h-4 text-danger" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium text-text-primary font-mono">{h.name}</span>
                              {!h.present && (
                                <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${severityBadge(h.severity)}`}>
                                  {h.severity}
                                </span>
                              )}
                            </div>
                            {h.present && h.value && (
                              <p className="text-xs text-text-muted mt-0.5 font-mono truncate" title={h.value}>{h.value}</p>
                            )}
                            {!h.present && (
                              <>
                                <p className="text-xs text-text-secondary mt-0.5">{h.description}</p>
                                {h.recommendation && (
                                  <p className="text-xs text-text-muted mt-1 font-mono bg-white/3 px-2 py-1 rounded">{h.recommendation}</p>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </Card>
          );
        })()}

        {/* Content Change Detection Tab */}
        {activeMainTab === "content" && (monitor.type === "HTTP" || monitor.type === "BROWSER") && (
          <Card className="p-5 space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <FileText className="w-4 h-4 text-accent" />
              <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">Content Change Detection</h2>
            </div>

            {(monitor.config as Record<string, unknown>)?.contentHash ? (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl bg-surface-elevated border border-border space-y-1">
                    <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Baseline Hash</p>
                    <p className="text-xs font-mono text-text-primary break-all">{String((monitor.config as Record<string, unknown>).contentHash)}</p>
                    {(monitor.config as Record<string, unknown>).contentHashSetAt && (
                      <p className="text-xs text-text-muted">Set {new Date(String((monitor.config as Record<string, unknown>).contentHashSetAt)).toLocaleDateString()}</p>
                    )}
                  </div>
                  <div className="p-4 rounded-xl bg-surface-elevated border border-border space-y-2">
                    <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Actions</p>
                    <p className="text-xs text-text-secondary">Reset the baseline to re-capture current page content. The next successful check will establish a new baseline hash.</p>
                    <button
                      className="mt-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-warning/10 text-warning border border-warning/20 hover:bg-warning/20 transition-colors"
                      onClick={async () => {
                        const u = getUser();
                        if (!u) return;
                        await api(`/v1/monitors/${monitor.id}/content-baseline/reset`, u.id, { method: "POST" });
                        setMonitor((prev) => {
                          if (!prev) return prev;
                          const cfg = { ...(prev.config as Record<string, unknown>) };
                          delete cfg.contentHash;
                          delete cfg.contentHashSetAt;
                          return { ...prev, config: cfg };
                        });
                      }}
                    >
                      Reset Baseline
                    </button>
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">Recent Change Events</p>
                  {runs.filter((r) => r.message?.includes("Content changed")).length > 0 ? (
                    <div className="space-y-2">
                      {runs.filter((r) => r.message?.includes("Content changed")).slice(0, 10).map((r) => (
                        <div key={r.id} className="flex items-center gap-3 p-3 rounded-lg bg-warning/5 border border-warning/20">
                          <span className="text-warning text-sm">⚠</span>
                          <div>
                            <p className="text-sm text-text-primary font-medium">Content changed</p>
                            <p className="text-xs text-text-muted">{new Date(r.createdAt).toLocaleString()}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2 py-8 text-center">
                      <CheckCircle className="w-8 h-8 text-success opacity-50" />
                      <p className="text-sm text-text-secondary">No content changes detected</p>
                      <p className="text-xs text-text-muted">PulseDock will alert here when the page content differs from the baseline.</p>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center gap-3 py-10 text-center">
                <FileText className="w-10 h-10 text-text-muted opacity-40" />
                <p className="text-sm font-medium text-text-secondary">No baseline established yet</p>
                <p className="text-xs text-text-muted max-w-xs">Run a check to capture the current page content as the baseline. Future checks will compare against it and alert on changes.</p>
              </div>
            )}
          </Card>
        )}

        {/* SLA Stats — with period selector */}
        {activeMainTab === "overview" && (<>
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

            {/* Health Score card */}
            {healthScore && (
              <div className="flex items-center gap-4 p-3 rounded-xl bg-surface border border-border/60 mb-1">
                <div className="flex flex-col items-center justify-center">
                  {(() => {
                    const gradeColor =
                      healthScore.grade === "A" ? "border-success text-success" :
                      healthScore.grade === "B" ? "border-success/70 text-success/80" :
                      healthScore.grade === "C" ? "border-warning text-warning" :
                      healthScore.grade === "D" ? "border-orange-400 text-orange-400" :
                      "border-danger text-danger";
                    return (
                      <div className={`w-16 h-16 rounded-full border-4 flex flex-col items-center justify-center ${gradeColor}`}>
                        <span className="text-2xl font-bold tabular-nums leading-none">{healthScore.score}</span>
                        <span className="text-[10px] font-semibold uppercase tracking-wide opacity-70">/{100}</span>
                      </div>
                    );
                  })()}
                </div>
                <div className="flex flex-col gap-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-text-primary">Health Score</span>
                    {(() => {
                      const gradeBg =
                        healthScore.grade === "A" ? "bg-success/15 text-success" :
                        healthScore.grade === "B" ? "bg-success/10 text-success/80" :
                        healthScore.grade === "C" ? "bg-warning/15 text-warning" :
                        healthScore.grade === "D" ? "bg-orange-500/15 text-orange-400" :
                        "bg-danger/15 text-danger";
                      return (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${gradeBg}`}>
                          {healthScore.grade}
                        </span>
                      );
                    })()}
                  </div>
                  <span className="text-xs text-text-secondary">
                    Uptime {healthScore.breakdown.uptime}/40 · Latency {healthScore.breakdown.latency}/20 · SLA {healthScore.breakdown.sla}/20 · Streak {healthScore.breakdown.streak}/20
                  </span>
                </div>
              </div>
            )}

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
              <div>
                <span className="text-xs text-text-secondary block mb-0.5">Change Detection</span>
                <span className={`font-medium ${monitor.config?.detectChanges ? "text-success" : "text-text-secondary"}`}>
                  {monitor.config?.detectChanges ? "✓ Enabled" : "Disabled"}
                </span>
              </div>
            </div>
            {!!monitor.config?.detectChanges && (
              <div className="mt-2 pt-3 border-t border-border">
                {Array.isArray(monitor.config?.dnsBaseline) && (monitor.config.dnsBaseline as string[]).length > 0 ? (
                  <>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Baseline Records</span>
                      <div className="flex items-center gap-2">
                        {!!monitor.config?.dnsBaselineSetAt && (
                          <span className="text-xs text-text-muted">
                            Set {new Date(String(monitor.config.dnsBaselineSetAt)).toLocaleDateString()}
                          </span>
                        )}
                        <button
                          onClick={async () => {
                            if (!confirm("Reset DNS baseline? The next check will establish a new baseline.")) return;
                            const u = getUser();
                            if (!u) return;
                            try {
                              await api(`/v1/monitors/${monitor.id}/dns-baseline/reset`, u.id, { method: "POST" });
                              router.refresh();
                            } catch (e) {
                              alert(e instanceof Error ? e.message : "Failed to reset baseline");
                            }
                          }}
                          className="text-xs text-warning hover:text-warning/80 border border-warning/30 hover:border-warning/60 px-2 py-0.5 rounded transition-colors"
                          title="Reset baseline — next successful check will set a new one"
                        >
                          Reset
                        </button>
                      </div>
                    </div>
                    <div className="space-y-1">
                      {(monitor.config.dnsBaseline as string[]).map((record, i) => (
                        <div key={i} className="flex items-center gap-2 px-2 py-1 rounded bg-surface-elevated">
                          <span className="w-2 h-2 rounded-full bg-success shrink-0" />
                          <span className="font-mono text-xs text-text-primary break-all">{record}</span>
                        </div>
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-text-muted">
                      Alerts will fire if any records are added or removed from this baseline.
                    </p>
                  </>
                ) : (
                  <div className="flex items-center gap-2 p-2 rounded-lg bg-warning/10 border border-warning/20">
                    <span className="text-warning text-sm">⏳</span>
                    <p className="text-xs text-text-secondary">
                      Baseline not set yet — will be captured on the next successful check.
                    </p>
                  </div>
                )}
              </div>
            )}
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
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">
                {monitor.type === "HEARTBEAT" ? "Heartbeat History" : "Response Time"}
              </h2>
              <div className="flex gap-1">
                {(["1d", "7d", "30d", "90d"] as UptimePeriod[]).map((p) => (
                  <button
                    key={p}
                    onClick={() => setChartPeriod(p)}
                    className={`text-xs px-2 py-0.5 rounded transition-colors ${chartPeriod === p ? "bg-accent text-white" : "text-text-muted hover:text-text"}`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
            {chartLoading ? (
              <div className="h-40 flex items-center justify-center text-text-muted text-sm">Loading chart…</div>
            ) : chartData.length > 0 ? (
              (() => {
                const mappedData = chartData.map((pt) => ({
                  time: new Date(pt.ts).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }),
                  value: pt.avgLatencyMs ?? 0,
                  ok: pt.uptimePct === 100,
                  checkedAt: pt.ts,
                }));
                const avg = chartData.filter((pt) => pt.avgLatencyMs !== null).reduce((s, pt, _, a) => s + (pt.avgLatencyMs ?? 0) / a.length, 0);
                const roundedAvg = avg > 0 ? Math.round(avg) : undefined;
                // Compute overall P95 from chart points
                const p95Values = chartData.filter((pt) => pt.p95LatencyMs !== null).map((pt) => pt.p95LatencyMs as number);
                const roundedP95 = p95Values.length > 0 ? Math.round(p95Values.reduce((s, v) => s + v, 0) / p95Values.length) : undefined;
                // Map events to nearest bucket
                const chartStart = mappedData.length > 0 ? new Date(mappedData[0].checkedAt as string).getTime() : 0;
                const chartEnd = mappedData.length > 0 ? new Date(mappedData[mappedData.length - 1].checkedAt as string).getTime() : 0;
                const EVENT_COLORS: Record<string, string> = { deploy: "#3b82f6", incident: "#ef4444", maintenance: "#f59e0b", config: "#a855f7", note: "#6b7280" };
                const marks = events
                  .filter((ev) => { const t = new Date(ev.createdAt).getTime(); return t >= chartStart && t <= chartEnd; })
                  .map((ev) => {
                    const evTime = new Date(ev.createdAt).getTime();
                    let closest = mappedData[0];
                    let minDiff = Infinity;
                    for (const pt of mappedData) {
                      const diff = Math.abs(new Date(pt.checkedAt as string).getTime() - evTime);
                      if (diff < minDiff) { minDiff = diff; closest = pt; }
                    }
                    return { xValue: closest?.time ?? "", color: EVENT_COLORS[ev.eventType] ?? EVENT_COLORS.note, label: ev.eventType.slice(0, 4) };
                  });
                return (
                  <ResponseAreaChart
                    data={mappedData}
                    height={160}
                    avgLine={roundedAvg}
                    p95Line={roundedP95}
                    color="#58a6ff"
                    marks={marks.length > 0 ? marks : undefined}
                  />
                );
              })()
            ) : (
              (() => {
                // Fall back to last 50 raw runs if chart data unavailable
                const chartRuns = runs.slice(0, 50).reverse().filter((r) => r.latencyMs !== null);
                const fallbackData = chartRuns.map((r) => ({
                  time: new Date(r.checkedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
                  value: r.latencyMs as number,
                  ok: r.ok,
                  checkedAt: r.checkedAt,
                }));
                const avg = fallbackData.length > 0 ? Math.round(fallbackData.reduce((s, d) => s + d.value, 0) / fallbackData.length) : undefined;
                return fallbackData.length > 0 ? (
                  <ResponseAreaChart data={fallbackData} height={160} avgLine={avg} color="#58a6ff" />
                ) : (
                  <div className="h-40 flex items-center justify-center text-text-muted text-sm">No data yet</div>
                );
              })()
            )}
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
            <div className="px-4 py-3 border-b border-border flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">
                  Check History
                </h2>
                {runsTotal !== null && (
                  <span className="text-xs text-text-muted">
                    {runs.length} of {runsTotal} {runsStatusFilter !== "all" ? `(${runsStatusFilter} only)` : ""}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {/* Status filter pills */}
                <div className="flex items-center gap-1 rounded-lg border border-border p-0.5 bg-surface">
                  {(["all", "ok", "failed"] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => loadFilteredRuns(f)}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                        runsStatusFilter === f
                          ? "bg-surface-elevated text-text-primary shadow-sm"
                          : "text-text-muted hover:text-text-secondary"
                      }`}
                    >
                      {f === "all" ? "All" : f === "ok" ? "OK" : "Failed"}
                    </button>
                  ))}
                </div>
                {/* Export CSV */}
                {runs.length > 0 && (
                  <button
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-surface-elevated border border-border hover:border-border-strong transition-colors"
                    title="Export all check history as CSV (up to 10,000 runs)"
                    onClick={async () => {
                      try {
                        const { API_BASE } = await import('../../../lib/api');
                        const fetchRes = await fetch(`${API_BASE}/v1/monitors/${id}/runs/export`, {
                          credentials: 'include',
                          cache: 'no-store',
                        });
                        if (!fetchRes.ok) return;
                        const blob = await fetchRes.blob();
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        const monitorName = monitor?.name ?? id;
                        const dateStr = new Date().toISOString().slice(0, 10);
                        a.href = url;
                        a.download = `pulsedock-runs-${monitorName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}-${dateStr}.csv`;
                        a.click();
                        URL.revokeObjectURL(url);
                      } catch {
                        // silently fail
                      }
                    }}
                  >
                    <Download className="w-3 h-3" />
                    Export CSV
                  </button>
                )}
              </div>
            </div>
            <div>
              {runs.length === 0 ? (
                <div className="text-center py-12 text-text-secondary text-sm">
                  {runsStatusFilter !== "all"
                    ? `No ${runsStatusFilter === "ok" ? "successful" : "failed"} checks found.`
                    : "No runs yet — this monitor hasn't checked yet."}
                </div>
              ) : (
                <>
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
                      {runs.map((run) => {
                        const isExpanded = expandedRunId === run.id;
                        const hasTimings = run.timings && (
                          run.timings.dnsMs !== null ||
                          run.timings.tcpMs !== null ||
                          run.timings.tlsMs !== null ||
                          run.timings.ttfbMs !== null ||
                          run.timings.downloadMs !== null
                        );
                        const showWaterfall = hasTimings && (monitor?.type === "HTTP" || monitor?.type === "BROWSER");
                        return (
                        <React.Fragment key={run.id}>
                        <TableRow
                          className={showWaterfall ? "cursor-pointer hover:bg-surface-elevated/50 transition-colors" : ""}
                          onClick={showWaterfall ? () => setExpandedRunId(isExpanded ? null : run.id) : undefined}
                        >
                          <TableCell className="text-xs text-text-secondary whitespace-nowrap">
                            <span className="flex items-center gap-1">
                              {relativeTime(run.checkedAt)}
                              {showWaterfall && (
                                <ChevronDown className={`w-3 h-3 text-text-muted transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                              )}
                            </span>
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
                        {isExpanded && showWaterfall && run.timings && (
                          <TableRow>
                            <TableCell colSpan={5} className="py-0 pb-2 px-4">
                              <TimingWaterfall timings={run.timings} totalMs={run.latencyMs} />
                            </TableCell>
                          </TableRow>
                        )}
                        {run.responseBody && (
                          <TableRow>
                            <TableCell colSpan={5} className="py-0 pb-2 px-4">
                              <ResponseBodyViewer body={run.responseBody} />
                            </TableCell>
                          </TableRow>
                        )}
                        </React.Fragment>
                        );
                      })}
                    </TableBody>
                  </Table>
                  {runsHasMore && (
                    <div className="px-4 py-3 border-t border-border flex items-center justify-center">
                      <button
                        onClick={loadMoreRuns}
                        disabled={runsLoadingMore}
                        className="inline-flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-surface-elevated border border-border hover:border-border-strong transition-colors disabled:opacity-50"
                      >
                        <ChevronDown className="w-4 h-4" />
                        {runsLoadingMore ? "Loading…" : "Load more"}
                      </button>
                    </div>
                  )}
                </>
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

        {/* Linked Incidents */}
        {linkedIncidents !== null && linkedIncidents.length > 0 && (
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">Linked Incidents</h2>
              <a href="/incidents" className="text-xs text-accent hover:underline">View all →</a>
            </div>
            <div className="space-y-2">
              {linkedIncidents.slice(0, 5).map((inc) => (
                <a
                  key={inc.id}
                  href="/incidents"
                  className="flex items-start justify-between gap-2 px-3 py-2 rounded-lg bg-surface-elevated/50 border border-border hover:border-border-strong hover:bg-surface-elevated transition-colors group"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${inc.status === "RESOLVED" ? "bg-success" : "bg-danger animate-pulse"}`} />
                      <span className="text-xs font-medium text-text-primary truncate">{inc.title}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-text-muted">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${inc.severity === "CRITICAL" ? "bg-danger/15 text-danger" : inc.severity === "HIGH" ? "bg-orange-500/15 text-orange-400" : inc.severity === "MEDIUM" ? "bg-warning/15 text-warning" : "bg-surface text-text-muted border border-border"}`}>{inc.severity}</span>
                      <span>{inc.status === "RESOLVED" ? "Resolved" : "Open"}</span>
                      {inc.autoCreated && <span className="text-text-muted">· auto</span>}
                      {inc.durationSec !== null && <span>· {inc.durationSec < 60 ? `${inc.durationSec}s` : inc.durationSec < 3600 ? `${Math.round(inc.durationSec / 60)}m` : `${(inc.durationSec / 3600).toFixed(1)}h`}</span>}
                    </div>
                  </div>
                  <span className="text-xs text-text-muted whitespace-nowrap pt-0.5">{relativeTime(inc.createdAt)}</span>
                </a>
              ))}
              {linkedIncidents.length > 5 && (
                <p className="text-xs text-text-muted text-center py-1">+ {linkedIncidents.length - 5} more</p>
              )}
            </div>
          </Card>
        )}

        {/* Advanced Settings Summary */}
        {(monitor.retryCount != null && monitor.retryCount > 0) ||
         monitor.anomalyDetection ||
         (monitor as typeof monitor & { latencyAlertMs?: number | null }).latencyAlertMs ||
         monitor.scheduleEnabled ||
         (monitor.confirmations != null && monitor.confirmations > 1) ||
         monitor.autoIncident ||
         monitor.runbookUrl ? (
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-2">
                <Settings className="w-4 h-4" />
                Advanced Settings
              </h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
              {monitor.confirmations != null && monitor.confirmations > 1 && (
                <div className="flex flex-col gap-0.5 p-2.5 rounded-lg bg-surface-elevated/60 border border-border/60">
                  <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">Confirmations</span>
                  <span className="text-text-primary font-medium">{monitor.confirmations}× before alert</span>
                  <span className="text-[10px] text-text-secondary">Reduces false positives</span>
                </div>
              )}
              {monitor.retryCount != null && monitor.retryCount > 0 && (
                <div className="flex flex-col gap-0.5 p-2.5 rounded-lg bg-surface-elevated/60 border border-border/60">
                  <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">Retries</span>
                  <span className="text-text-primary font-medium">{monitor.retryCount}× on failure</span>
                  <span className="text-[10px] text-text-secondary">Exponential backoff</span>
                </div>
              )}
              {(monitor as typeof monitor & { latencyAlertMs?: number | null }).latencyAlertMs && (
                <div className="flex flex-col gap-0.5 p-2.5 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                  <span className="text-[10px] font-semibold text-yellow-400 uppercase tracking-wider">Latency Threshold</span>
                  <span className="text-text-primary font-medium">&gt; {(monitor as typeof monitor & { latencyAlertMs?: number | null }).latencyAlertMs}ms</span>
                  <span className="text-[10px] text-text-secondary">Alert on slow responses</span>
                </div>
              )}
              {monitor.anomalyDetection && (
                <div className="flex flex-col gap-0.5 p-2.5 rounded-lg bg-purple-500/10 border border-purple-500/20">
                  <span className="text-[10px] font-semibold text-purple-400 uppercase tracking-wider">Anomaly Detection</span>
                  <span className="text-text-primary font-medium">{monitor.anomalyMultiplier ?? 2}× P95 baseline</span>
                  <span className="text-[10px] text-text-secondary">Dynamic latency alerting</span>
                </div>
              )}
              {monitor.scheduleEnabled && (
                <div className="flex flex-col gap-0.5 p-2.5 rounded-lg bg-blue-500/10 border border-blue-500/20">
                  <span className="text-[10px] font-semibold text-blue-400 uppercase tracking-wider">Business Hours</span>
                  <span className="text-text-primary font-medium">
                    {monitor.scheduleStartHour ?? 8}:00 – {monitor.scheduleEndHour ?? 18}:00 UTC
                  </span>
                  <span className="text-[10px] text-text-secondary">
                    {(monitor.scheduleDays ?? "1,2,3,4,5").split(",").map((d) => ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][parseInt(d)] ?? d).join(", ")}
                  </span>
                </div>
              )}
              {monitor.autoIncident && (
                <div className="flex flex-col gap-0.5 p-2.5 rounded-lg bg-orange-500/10 border border-orange-500/20">
                  <span className="text-[10px] font-semibold text-orange-400 uppercase tracking-wider">Auto Incidents</span>
                  <span className="text-text-primary font-medium capitalize">{(monitor.autoIncidentSeverity ?? "MEDIUM").toLowerCase()} severity</span>
                  <span className="text-[10px] text-text-secondary">Auto-creates on outage</span>
                </div>
              )}
              {monitor.runbookUrl && (
                <div className="flex flex-col gap-0.5 p-2.5 rounded-lg bg-surface-elevated/60 border border-border/60">
                  <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">Runbook</span>
                  <a
                    href={monitor.runbookUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent hover:underline text-xs truncate"
                    title={monitor.runbookUrl}
                  >
                    Open runbook →
                  </a>
                </div>
              )}
            </div>
          </Card>
        ) : null}

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
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border uppercase ${colorClass} shrink-0`}>
                      {ac.alertChannel.type}
                    </span>
                    <span className="text-sm text-text-primary flex-1 truncate">{ac.alertChannel.name}</span>
                    <select
                      value={ac.notifyOn}
                      onChange={async (e) => {
                        const user = getUser();
                        if (!user) return;
                        try {
                          await api(`/v1/monitors/${id}/alerts/${ac.alertChannelId}`, user.id, {
                            method: "PATCH",
                            body: JSON.stringify({ notifyOn: e.target.value }),
                          });
                          setAlertChannels((prev) => prev.map((x) => x.alertChannelId === ac.alertChannelId ? { ...x, notifyOn: e.target.value } : x));
                        } catch { /* non-critical */ }
                      }}
                      className="text-xs text-text-muted bg-transparent border-0 cursor-pointer focus:outline-none focus:ring-1 focus:ring-accent rounded"
                      title="Change notification trigger"
                    >
                      {Object.entries(notifyLabels).map(([val, lbl]) => <option key={val} value={val}>{lbl}</option>)}
                    </select>
                    {ac.escalationPolicy && (
                      <span className="text-[10px] text-purple-400 bg-purple-400/10 border border-purple-400/20 rounded-full px-1.5 py-0.5 shrink-0" title={`Escalation: ${ac.escalationPolicy.name}`}>
                        ↗ {ac.escalationPolicy.name}
                      </span>
                    )}
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

        {/* Alert Delivery History */}
        <Card className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-2">
              <Activity className="w-4 h-4" />
              Notifications
            </h2>
            {deliveryHistory && (
              <div className="flex items-center gap-2 text-xs text-text-muted">
                <span className="text-success">{deliveryHistory.successCount} ok</span>
                {deliveryHistory.failedCount > 0 && (
                  <span className="text-error">{deliveryHistory.failedCount} failed</span>
                )}
                <span>/ {deliveryHistory.total} total</span>
              </div>
            )}
          </div>

          {!deliveryHistory || deliveryHistory.deliveries.length === 0 ? (
            <p className="text-xs text-text-muted text-center py-4">No alert deliveries yet for this monitor.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeader>Timestamp</TableHeader>
                    <TableHeader>Channel</TableHeader>
                    <TableHeader>Type</TableHeader>
                    <TableHeader>Trigger</TableHeader>
                    <TableHeader>Status</TableHeader>
                    <TableHeader>Duration</TableHeader>
                    <TableHeader>Error</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {deliveryHistory.deliveries.map((d) => {
                    const triggerLabel =
                      d.trigger === "monitor_failure" ? "Failure"
                      : d.trigger === "monitor_recovery" ? "Recovery"
                      : d.trigger === "test" ? "Test"
                      : d.trigger ? d.trigger.charAt(0).toUpperCase() + d.trigger.slice(1)
                      : "—";

                    const channelTypeBadgeColors: Record<string, string> = {
                      slack: "bg-green-500/15 text-green-400 border-green-500/30",
                      discord: "bg-indigo-500/15 text-indigo-400 border-indigo-500/30",
                      email: "bg-blue-500/15 text-blue-400 border-blue-500/30",
                      webhook: "bg-orange-500/15 text-orange-400 border-orange-500/30",
                      telegram: "bg-sky-500/15 text-sky-400 border-sky-500/30",
                      pagerduty: "bg-green-600/15 text-green-500 border-green-600/30",
                      opsgenie: "bg-orange-600/15 text-orange-500 border-orange-600/30",
                      sms: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
                    };
                    const channelTypeCls = channelTypeBadgeColors[d.channelType] ?? "bg-surface-elevated text-text-muted border-border";

                    return (
                      <TableRow key={d.id}>
                        <TableCell className="text-xs text-text-muted whitespace-nowrap">{relativeTime(d.createdAt)}</TableCell>
                        <TableCell className="text-sm text-text-primary">{d.channelName}</TableCell>
                        <TableCell>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium uppercase tracking-wider ${channelTypeCls}`}>
                            {d.channelType}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs text-text-secondary">{triggerLabel}</TableCell>
                        <TableCell>
                          {d.status === "success" ? (
                            <span className="text-[10px] px-1.5 py-0.5 rounded border font-medium uppercase tracking-wider bg-success/15 text-success border-success/30">
                              Success
                            </span>
                          ) : (
                            <span className="text-[10px] px-1.5 py-0.5 rounded border font-medium uppercase tracking-wider bg-error/15 text-error border-error/30">
                              Failed
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-text-muted">
                          {d.durationMs != null ? `${d.durationMs}ms` : "—"}
                        </TableCell>
                        <TableCell className="text-xs text-error max-w-[200px] truncate" title={d.errorMessage ?? undefined}>
                          {d.errorMessage ?? "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </Card>
        </>)}

      </div>

      {/* Acknowledge Modal */}
      {showAckModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowAckModal(false)}>
          <div className="w-full max-w-md mx-4 rounded-2xl border border-border bg-surface-elevated shadow-2xl p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-text-primary mb-1">Acknowledge Alert</h2>
            <p className="text-sm text-text-secondary mb-4">
              Acknowledge this alert to suppress further notifications until the monitor recovers or you clear it manually.
            </p>
            <textarea
              value={ackNote}
              onChange={(e) => setAckNote(e.target.value)}
              placeholder="Optional note (e.g. 'Investigating — known issue')"
              maxLength={500}
              rows={3}
              className="w-full px-3 py-2 text-sm rounded-xl border border-border bg-surface text-text-primary placeholder-text-muted resize-none focus:outline-none focus:ring-1 focus:ring-accent mb-4"
            />
            <div className="flex items-center justify-end gap-2">
              <button onClick={() => setShowAckModal(false)} className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors">Cancel</button>
              <button
                onClick={handleAcknowledge}
                disabled={ackLoading}
                className="px-4 py-2 text-sm font-medium rounded-xl bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:opacity-50"
              >
                {ackLoading ? "Acknowledging…" : "Acknowledge"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppFrame>
  );
}

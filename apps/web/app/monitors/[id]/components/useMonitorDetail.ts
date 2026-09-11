"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "../../../../lib/api";
import { createRealtimeSocket } from "../../../../lib/realtime";
import { getUser } from "../../../../components/auth";
import type {
  MonitorItem,
  AlertChannelInfo,
  MonitorDependency,
  MonitorRun,
  UptimePeriod,
  UptimeStats,
  ErrorBudget,
  HealthScore,
  MonitorEvent,
  ChartPoint,
} from "./types";
import type { GeoRegionStat } from "./GeoTab";
import type { MetricHistoryData } from "./MetricTab";
import type { FailurePatternsData } from "./FailuresTab";
import type { ConfigHistoryEntry } from "./ConfigHistoryTab";
import type { Annotation } from "./AnnotationsTab";
import type { SimResult } from "./SimulateTab";
import type { LatencyDistributionData, StatusTransitionsData, PeriodComparisonData, LatencyHistoryDay } from "./PerformanceTab";

interface AlertDelivery {
  id: string; channelId: string; channelName: string; channelType: string;
  status: "success" | "failed"; trigger: string | null; errorMessage: string | null;
  durationMs: number | null; createdAt: string;
}
interface DeliveryHistory { total: number; successCount: number; failedCount: number; deliveries: AlertDelivery[]; }

export type { AlertDelivery, DeliveryHistory };

export function useMonitorDetail() {
const params = useParams();
const router = useRouter();
const id = typeof params.id === "string" ? params.id : Array.isArray(params.id) ? params.id[0] : "";


// ── Core state ───────────────────────────────────────────────────────────
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
const [latencyBudgetReport, setLatencyBudgetReport] = useState<{
  monitorId: string; monitorName: string; latencyBudgetMs: number | null;
  periodStart: string; periodEnd: string; totalChecks: number;
  checksAboveBudget: number; budgetUsedPct: number; avgLatencyMs: number | null;
  p95LatencyMs: number | null; status: "no-budget" | "healthy" | "warning" | "exceeded";
} | null>(null);
const [latencyBudgetInput, setLatencyBudgetInput] = useState<string>("");
const [latencyBudgetSaving, setLatencyBudgetSaving] = useState(false);
const [healthScore, setHealthScore] = useState<HealthScore | null>(null);
const [activeMainTab, setActiveMainTab] = useState<"overview" | "slo" | "performance" | "certificate" | "domain" | "security" | "content" | "headers" | "diff" | "annotations" | "ctlog" | "geo" | "failures" | "simulate" | "metric" | "transaction" | "config-history">("overview");

// ── Metric state ─────────────────────────────────────────────────────────
const [metricData, setMetricData] = useState<MetricHistoryData | null>(null);
const [metricLoading, setMetricLoading] = useState(false);
const [metricError, setMetricError] = useState<string | null>(null);
const [metricPeriod, setMetricPeriod] = useState(30);

// ── Config History state ──────────────────────────────────────────────────
const [configHistory, setConfigHistory] = useState<ConfigHistoryEntry[]>([]);
const [configHistoryLoaded, setConfigHistoryLoaded] = useState(false);
const [configHistoryLoading, setConfigHistoryLoading] = useState(false);

// ── Simulate Alerts state ─────────────────────────────────────────────────
const [simConfirmations, setSimConfirmations] = useState(1);
const [simFlapDetection, setSimFlapDetection] = useState(false);
const [simFlapWindow, setSimFlapWindow] = useState(5);
const [simFlapThreshold, setSimFlapThreshold] = useState(3);
const [simScheduleEnabled, setSimScheduleEnabled] = useState(false);
const [simScheduleStartHour, setSimScheduleStartHour] = useState(9);
const [simScheduleEndHour, setSimScheduleEndHour] = useState(17);
const [simLoading, setSimLoading] = useState(false);
const [simError, setSimError] = useState<string | null>(null);
const [simResult, setSimResult] = useState<SimResult | null>(null);
const [showApplyConfirm, setShowApplyConfirm] = useState(false);
const [applyLoading, setApplyLoading] = useState(false);

// ── Failure Patterns state ────────────────────────────────────────────────
const [failurePatterns, setFailurePatterns] = useState<FailurePatternsData | null>(null);
const [failurePatternsLoading, setFailurePatternsLoading] = useState(false);
const [failuresPeriod, setFailuresPeriod] = useState<7 | 30 | 90>(30);

// ── Annotations state ─────────────────────────────────────────────────────
const [annotations, setAnnotations] = useState<Annotation[]>([]);
const [annotationsLoading, setAnnotationsLoading] = useState(false);
const [annotationText, setAnnotationText] = useState("");
const [annotationColor, setAnnotationColor] = useState<"blue" | "green" | "yellow" | "red" | "purple" | "gray">("blue");
const [annotationDate, setAnnotationDate] = useState(() => new Date().toISOString().slice(0, 16));
const [annotationSaving, setAnnotationSaving] = useState(false);

// ── Performance state ─────────────────────────────────────────────────────
const [perfData, setPerfData] = useState<LatencyDistributionData | null>(null);
const [perfLoading, setPerfLoading] = useState(false);
const [perfError, setPerfError] = useState<string | null>(null);
const [perfPeriod, setPerfPeriod] = useState<"24h" | "7d" | "30d">("7d");
const [transitionsData, setTransitionsData] = useState<StatusTransitionsData | null>(null);
const [perfComparison, setPerfComparison] = useState<PeriodComparisonData | null>(null);
const [latencyHistory, setLatencyHistory] = useState<LatencyHistoryDay[] | null>(null);
const [latencyHistoryLoading, setLatencyHistoryLoading] = useState(false);
const [latencyHistoryDays, setLatencyHistoryDays] = useState<14 | 30 | 60>(30);

// ── Certificate state ─────────────────────────────────────────────────────
const [certDetails, setCertDetails] = useState<Record<string, unknown> | null>(null);
const [certLoading, setCertLoading] = useState(false);

// ── Misc state ────────────────────────────────────────────────────────────
const [deliveryHistory, setDeliveryHistory] = useState<DeliveryHistory | null>(null);
const [linkedIncidents, setLinkedIncidents] = useState<Array<{
  id: string; title: string; status: string; severity: string;
  autoCreated: boolean; createdAt: string; resolvedAt: string | null; durationSec: number | null;
}> | null>(null);
const [shareTokenLoading, setShareTokenLoading] = useState(false);
const [shareTokenCopied, setShareTokenCopied] = useState(false);
const [showCertModal, setShowCertModal] = useState(false);
const [diffRunId, setDiffRunId] = useState<string | null>(null);
const [diffData, setDiffData] = useState<{ failedBody: string | null; baseBody: string | null; runId: string; baseRunId: string | null } | null>(null);
const [diffLoading, setDiffLoading] = useState(false);
const [diffError, setDiffError] = useState<string | null>(null);
const [showMuteMenu, setShowMuteMenu] = useState(false);
const [muteLoading, setMuteLoading] = useState(false);
const [showAckModal, setShowAckModal] = useState(false);
const [ackNote, setAckNote] = useState("");
const [ackLoading, setAckLoading] = useState(false);
const [events, setEvents] = useState<MonitorEvent[]>([]);
const [newEventMsg, setNewEventMsg] = useState("");
const [newEventType, setNewEventType] = useState<"deploy" | "note" | "incident" | "maintenance" | "config">("note");
const [addingEvent, setAddingEvent] = useState(false);
const [eventError, setEventError] = useState("");
const [geoStats, setGeoStats] = useState<{ regions: GeoRegionStat[]; hasGeoData: boolean } | null>(null);
const [geoStatsLoading, setGeoStatsLoading] = useState(false);
const [geoPeriod, setGeoPeriod] = useState<1 | 7 | 30>(7);
const [runsStatusFilter, setRunsStatusFilter] = useState<"all" | "ok" | "failed" | "degraded">("all");
const [runsHasMore, setRunsHasMore] = useState(false);
const [runsNextCursor, setRunsNextCursor] = useState<string | null>(null);
const [runsTotal, setRunsTotal] = useState<number | null>(null);
const [runsLoadingMore, setRunsLoadingMore] = useState(false);
const [expandedRunId, setExpandedRunId] = useState<string | null>(null);

// ── Initial load ─────────────────────────────────────────────────────────
useEffect(() => {
  const user = getUser();
  if (!user) { router.push("/login"); return; }
  async function load() {
    try {
      setLoading(true); setError("");
      const [found, monitorRunsPage, alertChs, deps, evts, deliveries, allMons, incidents] = await Promise.all([
        api<MonitorItem>(`/v1/monitors/${id}`, user!.id).catch(() => null),
        api<{ runs: MonitorRun[]; hasMore: boolean; total: number; nextCursor: string | null }>(`/v1/monitors/${id}/runs?limit=100`, user!.id),
        api<AlertChannelInfo[]>(`/v1/monitors/${id}/alerts`, user!.id).catch(() => []),
        api<MonitorDependency[]>(`/v1/monitors/${id}/dependencies`, user!.id).catch(() => []),
        api<MonitorEvent[]>(`/v1/monitors/${id}/events`, user!.id).catch(() => []),
        api<DeliveryHistory>(`/v1/monitors/${id}/deliveries`, user!.id).catch(() => null),
        api<MonitorItem[]>("/v1/monitors", user!.id).catch(() => [] as MonitorItem[]),
        api<{ incidents: Array<{ id: string; title: string; status: string; severity: string; autoCreated: boolean; createdAt: string; resolvedAt: string | null; durationSec: number | null }> }>(`/v1/monitors/${id}/incidents`, user!.id).catch(() => null),
      ]);
      if (!found) { router.push("/monitors"); return; }
      setMonitor(found); setRuns(monitorRunsPage.runs);
      setRunsHasMore(monitorRunsPage.hasMore); setRunsNextCursor(monitorRunsPage.nextCursor);
      setRunsTotal(monitorRunsPage.total); setAlertChannels(alertChs);
      setDependencies(deps); setEvents(evts); setDeliveryHistory(deliveries);
      setAllMonitors(allMons); setLinkedIncidents(incidents?.incidents ?? []);
      if (found.slaTarget) api<ErrorBudget>(`/v1/monitors/${id}/error-budget?period=30d`, user!.id).then(setErrorBudget).catch(() => null);
      if ((found as typeof found & { latencyBudgetMs?: number | null }).latencyBudgetMs) {
        api<typeof latencyBudgetReport>(`/v1/monitors/${id}/latency-budget`, user!.id).then(setLatencyBudgetReport).catch(() => null);
      }
      api<HealthScore>(`/v1/monitors/${id}/health-score`, user!.id).then(setHealthScore).catch(() => null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load monitor");
    } finally { setLoading(false); }
  }
  load();
}, [id, router]);

// ── Live WebSocket ────────────────────────────────────────────────────────
useEffect(() => {
  const user = getUser();
  if (!user || !id) return;
  const socket = createRealtimeSocket(user.id);
  socket.on("connect", () => { socket.emit("subscribe", { userId: user.id }); setLiveConnected(true); });
  socket.on("disconnect", () => setLiveConnected(false));
  socket.on("monitor.checked", (payload: { run: MonitorRun }) => {
    if (payload.run?.monitorId !== id) return;
    setRuns((prev) => [payload.run, ...prev.slice(0, 199)]);
    api<MonitorItem>(`/v1/monitors/${id}`, user.id)
      .then((m) => setMonitor((prev) => prev ? { ...prev, mutedUntil: m.mutedUntil, isAcknowledged: m.isAcknowledged } : prev))
      .catch(() => {});
  });
  return () => { socket.disconnect(); setLiveConnected(false); };
}, [id]);

// ── Data loaders ─────────────────────────────────────────────────────────
const loadUptime = useCallback(async (period: UptimePeriod) => {
  const user = getUser();
  if (!user || !id) return;
  setUptimeLoading(true);
  try { const data = await api<UptimeStats>(`/v1/monitors/${id}/uptime?period=${period}`, user.id); setUptime(data); }
  catch {} finally { setUptimeLoading(false); }
}, [id]);

const loadChartData = useCallback(async (period: UptimePeriod) => {
  const user = getUser();
  if (!user || !id) return;
  setChartLoading(true);
  try { const data = await api<{ points: ChartPoint[] }>(`/v1/monitors/${id}/chart?period=${period}`, user.id); setChartData(data.points); }
  catch {} finally { setChartLoading(false); }
}, [id]);

useEffect(() => { if (!loading && monitor) { loadUptime(uptimePeriod); } }, [loading, monitor, uptimePeriod, loadUptime]);
useEffect(() => { if (!loading && monitor) { loadChartData(chartPeriod); } }, [loading, monitor, chartPeriod, loadChartData]);

useEffect(() => {
  if (activeMainTab !== "geo" || !monitor) return;
  const user = getUser();
  if (!user) return;
  setGeoStatsLoading(true);
  api<{ regions: GeoRegionStat[]; hasGeoData: boolean }>(`/v1/monitors/${id}/geo-stats?periodDays=${geoPeriod}`, user.id)
    .then(setGeoStats).catch(() => setGeoStats({ regions: [], hasGeoData: false }))
    .finally(() => setGeoStatsLoading(false));
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [activeMainTab, id, geoPeriod]);

useEffect(() => {
  if (activeMainTab !== "failures" || !monitor) return;
  const user = getUser();
  if (!user) return;
  setFailurePatternsLoading(true);
  api<FailurePatternsData>(`/v1/monitors/${id}/failure-patterns?periodDays=${failuresPeriod}`, user.id)
    .then(setFailurePatterns).catch(() => setFailurePatterns({ totalFailures: 0, uniquePatterns: 0, patterns: [] }))
    .finally(() => setFailurePatternsLoading(false));
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [activeMainTab, id, failuresPeriod]);

useEffect(() => {
  if (activeMainTab !== "config-history" || configHistoryLoaded || configHistoryLoading || !monitor) return;
  const user = getUser();
  if (!user) return;
  setConfigHistoryLoading(true);
  api<ConfigHistoryEntry[]>(`/v1/monitors/${id}/config-history`, user.id)
    .then((data) => { setConfigHistory(data ?? []); setConfigHistoryLoaded(true); })
    .catch(() => setConfigHistory([]))
    .finally(() => setConfigHistoryLoading(false));
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [activeMainTab, id, configHistoryLoaded, configHistoryLoading]);

useEffect(() => {
  if (activeMainTab !== "performance" || !monitor) return;
  const user = getUser();
  if (!user) return;
  setLatencyHistoryLoading(true);
  api<{ days: LatencyHistoryDay[] }>(`/v1/monitors/${id}/latency-history?days=${latencyHistoryDays}`, user.id)
    .then((data) => setLatencyHistory(data.days)).catch(() => setLatencyHistory([]))
    .finally(() => setLatencyHistoryLoading(false));
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [activeMainTab, id, latencyHistoryDays]);

// ── Callbacks ─────────────────────────────────────────────────────────────
const loadFilteredRuns = useCallback(async (statusFilter: "all" | "ok" | "failed" | "degraded") => {
  const user = getUser();
  if (!user) return;
  setRunsStatusFilter(statusFilter);
  try {
    const qs = statusFilter !== "all" ? `&status=${statusFilter}` : "";
    const page = await api<{ runs: MonitorRun[]; hasMore: boolean; total: number; nextCursor: string | null }>(`/v1/monitors/${id}/runs?limit=100${qs}`, user.id);
    setRuns(page.runs); setRunsHasMore(page.hasMore); setRunsNextCursor(page.nextCursor); setRunsTotal(page.total);
  } catch {}
}, [id]);

const loadMoreRuns = useCallback(async () => {
  const user = getUser();
  if (!user || !runsNextCursor || runsLoadingMore) return;
  setRunsLoadingMore(true);
  try {
    const qs = runsStatusFilter !== "all" ? `&status=${runsStatusFilter}` : "";
    const page = await api<{ runs: MonitorRun[]; hasMore: boolean; total: number; nextCursor: string | null }>(`/v1/monitors/${id}/runs?limit=100&before=${encodeURIComponent(runsNextCursor)}${qs}`, user.id);
    setRuns((prev) => [...prev, ...page.runs]); setRunsHasMore(page.hasMore); setRunsNextCursor(page.nextCursor);
  } catch {} finally { setRunsLoadingMore(false); }
}, [id, runsNextCursor, runsLoadingMore, runsStatusFilter]);

const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 3000); };

const handleRunNow = async () => {
  const user = getUser();
  if (!user || !monitor) return;
  setRunning(true); setActionError("");
  try {
    await api("/v1/monitors/run", user.id, { method: "POST", body: JSON.stringify({ monitorId: monitor.id }) });
    showToast("Check triggered — refreshing results…");
    setTimeout(async () => {
      try {
        const updatedPage = await api<{ runs: MonitorRun[]; hasMore: boolean; total: number; nextCursor: string | null }>(`/v1/monitors/${id}/runs?limit=100${runsStatusFilter !== "all" ? `&status=${runsStatusFilter}` : ""}`, user.id);
        setRuns(updatedPage.runs); setRunsHasMore(updatedPage.hasMore); setRunsNextCursor(updatedPage.nextCursor); setRunsTotal(updatedPage.total);
        loadUptime(uptimePeriod);
      } catch {}
    }, 2500);
  } catch (e) { setActionError(e instanceof Error ? e.message : "Failed to trigger check"); }
  finally { setRunning(false); }
};

const handleToggle = async () => {
  const user = getUser();
  if (!user || !monitor) return;
  setToggling(true); setActionError("");
  try {
    await api(`/v1/monitors/${monitor.id}`, user.id, { method: "PATCH", body: JSON.stringify({ enabled: !monitor.enabled }) });
    setMonitor((m) => m ? { ...m, enabled: !m.enabled } : m);
    showToast(monitor.enabled ? "Monitor disabled" : "Monitor enabled");
  } catch (e) { setActionError(e instanceof Error ? e.message : "Failed to update monitor"); }
  finally { setToggling(false); }
};

const handleAddDependency = async () => {
  const user = getUser();
  if (!user || !addingDepId) return;
  setDepLoading(true);
  try {
    await api(`/v1/monitors/${id}/dependencies/${addingDepId}`, user.id, { method: "POST" });
    const deps = await api<MonitorDependency[]>(`/v1/monitors/${id}/dependencies`, user.id);
    setDependencies(deps); setAddingDepId(""); setShowAddDep(false);
  } catch (e) { setActionError(e instanceof Error ? e.message : "Failed to add dependency"); }
  finally { setDepLoading(false); }
};

const handleRemoveDependency = async (dependsOnId: string) => {
  const user = getUser();
  if (!user) return;
  try {
    await api(`/v1/monitors/${id}/dependencies/${dependsOnId}`, user.id, { method: "DELETE" });
    setDependencies((prev) => prev.filter((d) => d.dependsOnId !== dependsOnId));
  } catch (e) { setActionError(e instanceof Error ? e.message : "Failed to remove dependency"); }
};

const handleAddEvent = async () => {
  const user = getUser();
  if (!user || !newEventMsg.trim()) return;
  setAddingEvent(true); setEventError("");
  try {
    const ev = await api<MonitorEvent>(`/v1/monitors/${id}/events`, user.id, { method: "POST", body: JSON.stringify({ message: newEventMsg.trim(), eventType: newEventType }) });
    setEvents((prev) => [ev, ...prev]); setNewEventMsg("");
  } catch (e) { setEventError(e instanceof Error ? e.message : "Failed to create event"); }
  finally { setAddingEvent(false); }
};

const handleDeleteEvent = async (eventId: string) => {
  const user = getUser();
  if (!user) return;
  try {
    await api(`/v1/monitors/${id}/events/${eventId}`, user.id, { method: "DELETE" });
    setEvents((prev) => prev.filter((e) => e.id !== eventId));
  } catch (e) { setEventError(e instanceof Error ? e.message : "Failed to delete event"); }
};

const loadDiff = useCallback(async (runId: string) => {
  const user = getUser();
  if (!user || !monitor) return;
  setDiffRunId(runId); setDiffLoading(true); setDiffError(null); setDiffData(null);
  try {
    const result = await api<{ failedBody: string | null; baseBody: string | null; runId: string; baseRunId: string | null }>(`/v1/monitors/${id}/response-diff/${runId}`, user.id);
    setDiffData(result);
  } catch { setDiffError("Failed to load response diff"); }
  finally { setDiffLoading(false); }
}, [id, monitor]);

const handleGenerateShareToken = async () => {
  const user = getUser();
  if (!user || !monitor) return;
  setShareTokenLoading(true);
  try {
    const result = await api<{ shareToken: string }>(`/v1/monitors/${id}/share-token`, user.id, { method: "POST" });
    setMonitor((prev) => prev ? { ...prev, shareToken: result.shareToken } : prev);
  } catch { setActionError("Failed to generate share token"); }
  finally { setShareTokenLoading(false); }
};

const handleRevokeShareToken = async () => {
  const user = getUser();
  if (!user || !monitor) return;
  if (!confirm("Revoke share token? Anyone using the public status URL will no longer be able to access it.")) return;
  setShareTokenLoading(true);
  try {
    await api(`/v1/monitors/${id}/share-token`, user.id, { method: "DELETE" });
    setMonitor((prev) => prev ? { ...prev, shareToken: null } : prev);
  } catch { setActionError("Failed to revoke share token"); }
  finally { setShareTokenLoading(false); }
};

const handleCopyShareUrl = (token: string) => {
  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? `${window.location.protocol}//${window.location.hostname}:4321`;
  void navigator.clipboard.writeText(`${apiBase}/v1/public/monitor/${token}/status.json`).then(() => {
    setShareTokenCopied(true); setTimeout(() => setShareTokenCopied(false), 2000);
  });
};

const handleMute = async (minutes: number) => {
  const user = getUser();
  if (!user || !monitor) return;
  setMuteLoading(true); setShowMuteMenu(false);
  try {
    const result = await api<{ mutedUntil: string }>(`/v1/monitors/${id}/mute`, user.id, { method: "POST", body: JSON.stringify({ minutes }) });
    setMonitor((prev) => prev ? { ...prev, mutedUntil: result.mutedUntil } : prev);
    showToast(`Monitor muted for ${minutes < 60 ? `${minutes} min` : `${minutes / 60}h`}`);
  } catch (e) { setActionError(e instanceof Error ? e.message : "Failed to mute monitor"); }
  finally { setMuteLoading(false); }
};

const handleUnmute = async () => {
  const user = getUser();
  if (!user || !monitor) return;
  setMuteLoading(true);
  try {
    await api(`/v1/monitors/${id}/mute`, user.id, { method: "DELETE" });
    setMonitor((prev) => prev ? { ...prev, mutedUntil: null } : prev);
    showToast("Monitor unmuted");
  } catch (e) { setActionError(e instanceof Error ? e.message : "Failed to unmute monitor"); }
  finally { setMuteLoading(false); }
};

const handleAcknowledge = async () => {
  const user = getUser();
  if (!user || !monitor) return;
  setAckLoading(true);
  try {
    await api(`/v1/monitors/${id}/acknowledge`, user.id, { method: "POST", body: JSON.stringify({ note: ackNote || undefined }) });
    setMonitor((prev) => prev ? { ...prev, isAcknowledged: true } : prev);
    setAckNote(""); setShowAckModal(false); showToast("Alert acknowledged");
  } catch (e) { setActionError(e instanceof Error ? e.message : "Failed to acknowledge alert"); }
  finally { setAckLoading(false); }
};

const handleClearAck = async () => {
  const user = getUser();
  if (!user || !monitor) return;
  try {
    await api(`/v1/monitors/${id}/acknowledge`, user.id, { method: "DELETE" });
    setMonitor((prev) => prev ? { ...prev, isAcknowledged: false } : prev);
    showToast("Acknowledgement cleared");
  } catch (e) { setActionError(e instanceof Error ? e.message : "Failed to clear acknowledgement"); }
};

const handleSaveLatencyBudget = async () => {
  const val = parseInt(latencyBudgetInput, 10);
  if (!val || val < 100) return;
  const user = getUser();
  if (!user || !monitor) return;
  setLatencyBudgetSaving(true);
  try {
    await api(`/v1/monitors/${monitor.id}`, user.id, { method: "PATCH", body: JSON.stringify({ latencyBudgetMs: val }) });
    setMonitor((prev) => prev ? { ...prev, latencyBudgetMs: val } as typeof prev : prev);
    const r = await api<typeof latencyBudgetReport>(`/v1/monitors/${monitor.id}/latency-budget`, user.id);
    setLatencyBudgetReport(r); setLatencyBudgetInput("");
  } catch {} finally { setLatencyBudgetSaving(false); }
};

const handleAlertChannelNotifyChange = async (channelId: string, notifyOn: string) => {
  const user = getUser();
  if (!user) return;
  try {
    await api(`/v1/monitors/${id}/alerts/${channelId}`, user.id, { method: "PATCH", body: JSON.stringify({ notifyOn }) });
    setAlertChannels((prev) => prev.map((x) => x.alertChannelId === channelId ? { ...x, notifyOn } : x));
  } catch {}
};

const handleSimulate = async () => {
  const user = getUser();
  if (!user) return;
  setSimLoading(true); setSimError(null); setSimResult(null);
  try {
    const body: Record<string, unknown> = { confirmations: simConfirmations, flapDetection: simFlapDetection, flapWindow: simFlapWindow, flapThreshold: simFlapThreshold };
    if (simScheduleEnabled) { body.scheduleStartHour = simScheduleStartHour; body.scheduleEndHour = simScheduleEndHour; }
    const result = await api<SimResult>(`/v1/monitors/${id}/simulate-alerts`, user.id, { method: "POST", body: JSON.stringify(body) });
    setSimResult(result);
  } catch (e) { setSimError(e instanceof Error ? e.message : "Simulation failed"); }
  finally { setSimLoading(false); }
};

const handleApplySim = async () => {
  const user = getUser();
  if (!user) return;
  setApplyLoading(true);
  try {
    await api(`/v1/monitors/${id}`, user.id, { method: "PATCH", body: JSON.stringify({ confirmations: simConfirmations, flapDetectionEnabled: simFlapDetection, flapWindow: simFlapWindow, flapThreshold: simFlapThreshold, scheduleEnabled: simScheduleEnabled, ...(simScheduleEnabled ? { scheduleStartHour: simScheduleStartHour, scheduleEndHour: simScheduleEndHour } : {}) }) });
    setMonitor((prev) => prev ? { ...prev, confirmations: simConfirmations, flapDetectionEnabled: simFlapDetection, flapWindow: simFlapWindow, scheduleEnabled: simScheduleEnabled, ...(simScheduleEnabled ? { scheduleStartHour: simScheduleStartHour, scheduleEndHour: simScheduleEndHour } : {}) } : prev);
    setShowApplyConfirm(false); showToast("Monitor settings updated from simulation.");
  } catch (e) { setSimError(e instanceof Error ? e.message : "Failed to apply settings"); setShowApplyConfirm(false); }
  finally { setApplyLoading(false); }
};

const handlePerfPeriodChange = async (p: "24h" | "7d" | "30d") => {
  setPerfPeriod(p);
  const user = getUser();
  if (!user) return;
  setPerfLoading(true); setPerfError(null);
  try {
    const [data, comparison, txData] = await Promise.all([
      api<LatencyDistributionData>(`/v1/monitors/${id}/latency-distribution?period=${p}`, user.id),
      api<PeriodComparisonData>(`/v1/monitors/${id}/period-comparison?period=${p}`, user.id).catch(() => null),
      api<StatusTransitionsData>(`/v1/monitors/${id}/status-transitions?period=${p}`, user.id).catch(() => null),
    ]);
    setPerfData(data); setPerfComparison(comparison); setTransitionsData(txData);
  } catch { setPerfError("Failed to load performance data"); }
  finally { setPerfLoading(false); }
};

const handleMetricPeriodChange = async (days: number, onLoad: (data: MetricHistoryData) => void, onError: () => void) => {
  setMetricPeriod(days);
  const user = getUser();
  if (!user) return;
  setMetricLoading(true); setMetricError(null);
  try {
    const data = await api<MetricHistoryData>(`/v1/monitors/${id}/metric-history?periodDays=${days}&limit=200`, user.id);
    setMetricData(data); onLoad(data);
  } catch { setMetricError("Failed to load metric history"); onError(); }
  finally { setMetricLoading(false); }
};



return {
  id, router,
  // Core
  monitor, setMonitor, runs, uptime, uptimePeriod, setUptimePeriod, uptimeLoading,
  loading, chartPeriod, setChartPeriod, chartData, chartLoading,
  error, actionError, setActionError, running, toggling, toast, liveConnected,
  alertChannels, setAlertChannels, dependencies, allMonitors,
  showAddDep, setShowAddDep, addingDepId, setAddingDepId, depLoading,
  errorBudget, latencyBudgetReport, latencyBudgetInput, setLatencyBudgetInput, latencyBudgetSaving,
  healthScore, activeMainTab, setActiveMainTab,
  // Metric
  metricData, setMetricData, metricLoading, metricError, metricPeriod,
  // Config History
  configHistory, configHistoryLoading,
  // Simulate
  simConfirmations, setSimConfirmations, simFlapDetection, setSimFlapDetection,
  simFlapWindow, setSimFlapWindow, simFlapThreshold, setSimFlapThreshold,
  simScheduleEnabled, setSimScheduleEnabled, simScheduleStartHour, setSimScheduleStartHour,
  simScheduleEndHour, setSimScheduleEndHour, simLoading, simError, simResult,
  showApplyConfirm, setShowApplyConfirm, applyLoading,
  // Failures
  failurePatterns, failurePatternsLoading, failuresPeriod, setFailuresPeriod,
  // Annotations
  annotations, setAnnotations, annotationsLoading, setAnnotationsLoading,
  annotationText, setAnnotationText, annotationColor, setAnnotationColor,
  annotationDate, setAnnotationDate, annotationSaving, setAnnotationSaving,
  // Performance
  perfData, setPerfData, perfLoading, setPerfLoading, perfError, setPerfError,
  perfPeriod, setPerfPeriod, transitionsData, setTransitionsData, perfComparison, setPerfComparison,
  latencyHistory, latencyHistoryLoading, latencyHistoryDays, setLatencyHistoryDays,
  // Certificate
  certDetails, setCertDetails, certLoading, setCertLoading,
  // Misc
  deliveryHistory, linkedIncidents,
  shareTokenLoading, shareTokenCopied,
  showCertModal, setShowCertModal,
  diffRunId, diffData, diffLoading, diffError,
  showMuteMenu, setShowMuteMenu, muteLoading,
  showAckModal, setShowAckModal, ackNote, setAckNote, ackLoading,
  events, newEventMsg, setNewEventMsg, newEventType, setNewEventType, addingEvent, eventError,
  geoStats, geoStatsLoading, geoPeriod, setGeoPeriod,
  runsStatusFilter, runsHasMore, runsTotal, runsLoadingMore,
  expandedRunId, setExpandedRunId,
  // Callbacks
  loadFilteredRuns, loadMoreRuns, showToast,
  handleRunNow, handleToggle,
  handleAddDependency, handleRemoveDependency,
  handleAddEvent, handleDeleteEvent,
  loadDiff, handleGenerateShareToken, handleRevokeShareToken, handleCopyShareUrl,
  handleMute, handleUnmute, handleAcknowledge, handleClearAck,
  handleSaveLatencyBudget, handleAlertChannelNotifyChange,
  handleSimulate, handleApplySim, handlePerfPeriodChange, handleMetricPeriodChange,
};
}

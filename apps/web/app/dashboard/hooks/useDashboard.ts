"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "../../../lib/api";
import { createRealtimeSocket } from "../../../lib/realtime";
import { getUser } from "../../../components/auth";

export const VERSION_TYPES = new Set(["GIT_RELEASE", "DOCKER_IMAGE"]);
export const UPTIME_TYPES = new Set(["HTTP", "TCP", "SSL_CERT", "HEARTBEAT", "DNS", "PING", "SMTP", "BROWSER", "FTP", "IMAP", "POP3"]);

export type TimeRange = "1h" | "6h" | "24h" | "7d" | "30d";
export type SectionKey = "uptime" | "versions" | "monitors" | "slo" | "health";

export const SECTION_LABELS: Record<SectionKey, string> = {
  uptime: "Uptime Monitoring",
  versions: "Version Tracking",
  monitors: "Monitors",
  slo: "SLO Health",
  health: "Health Timeline",
};

export interface Monitor {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
}

export interface VersionSummaryItem {
  id: string;
  level: "green" | "yellow" | "red";
}

export interface MonitorRun {
  id: string;
  monitorId: string;
  monitorType?: string | null;
  ok: boolean;
  statusCode: number;
  latencyMs?: number;
  message: string;
  checkedAt: string;
  level?: "green" | "yellow" | "red";
}

export interface DashboardStats {
  totalMonitors: number;
  uptimeMonitors: number;
  uptimePct: number;
  uptimeGreen: number;
  uptimeYellow: number;
  uptimeRed: number;
  versionMonitors: number;
  versionUpToDate: number;
  versionUpdateAvailable: number;
  versionMajorBehind: number;
}

export interface SloMonitorSummary {
  monitorId: string;
  name: string;
  type: string;
  slaTarget: number;
  periodDays: number;
  actualUptime: number;
  totalChecks: number;
  status: "ok" | "warning" | "breached";
  budgetRemainingPct: number;
  hasLatencySli: boolean;
}

export interface SloSummary {
  monitors: SloMonitorSummary[];
  summary: { total: number; ok: number; warning: number; breached: number };
}

export interface HealthTimelineEntry {
  date: string;
  healthScore: number | null;
  green: number;
  total: number;
}

export interface ActiveIncident {
  id: string;
  title: string;
  status: string;
  severity: string;
  createdAt: string;
  monitors: { id: string; name: string }[];
}

const DEFAULT_SECTION_ORDER: SectionKey[] = ["uptime", "versions", "monitors", "slo", "health"];
const TIME_RANGE_MS: Record<string, number> = {
  "1h": 3600000,
  "6h": 21600000,
  "24h": 86400000,
  "7d": 604800000,
  "30d": 2592000000,
};

function computeStats(
  monitorsData: Monitor[],
  runsData: MonitorRun[],
  versionSummaryItems: VersionSummaryItem[] = [],
): DashboardStats {
  const uptimeMonitors = monitorsData.filter((m) => UPTIME_TYPES.has(m.type));
  const versionMonitors = monitorsData.filter((m) => VERSION_TYPES.has(m.type));

  let uptimeGreen = 0, uptimeYellow = 0, uptimeRed = 0;
  for (const m of uptimeMonitors) {
    if (!m.enabled) continue;
    const latest = runsData.find((r) => r.monitorId === m.id);
    if (!latest || latest.level === "green") uptimeGreen++;
    else if (latest.level === "yellow") uptimeYellow++;
    else uptimeRed++;
  }
  const uptimeTotal = uptimeMonitors.length;
  const uptimePct = uptimeTotal === 0 ? 100 : Math.round((uptimeGreen / uptimeTotal) * 10000) / 100;

  let versionUpToDate = 0, versionUpdateAvailable = 0, versionMajorBehind = 0;
  if (versionSummaryItems.length > 0) {
    const summaryMap = new Map(versionSummaryItems.map((item) => [item.id, item.level]));
    for (const m of versionMonitors) {
      if (!m.enabled) continue;
      const level = summaryMap.get(m.id);
      if (!level || level === "green") versionUpToDate++;
      else if (level === "yellow") versionUpdateAvailable++;
      else versionMajorBehind++;
    }
  } else {
    for (const m of versionMonitors) {
      if (!m.enabled) continue;
      const latest = runsData.find((r) => r.monitorId === m.id);
      if (!latest || latest.level === "green") versionUpToDate++;
      else if (latest.level === "yellow") versionUpdateAvailable++;
      else versionMajorBehind++;
    }
  }

  return {
    totalMonitors: monitorsData.length,
    uptimeMonitors: uptimeTotal,
    uptimePct,
    uptimeGreen,
    uptimeYellow,
    uptimeRed,
    versionMonitors: versionMonitors.length,
    versionUpToDate,
    versionUpdateAvailable,
    versionMajorBehind,
  };
}

export function useDashboard() {
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [runs, setRuns] = useState<MonitorRun[]>([]);
  const [versionItems, setVersionItems] = useState<VersionSummaryItem[]>([]);
  const [activeIncidents, setActiveIncidents] = useState<ActiveIncident[]>([]);
  const [sloSummary, setSloSummary] = useState<SloSummary | null>(null);
  const [healthTimeline, setHealthTimeline] = useState<HealthTimelineEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [user, setUser] = useState<ReturnType<typeof getUser> | null>(null);
  const [hasAlertChannels, setHasAlertChannels] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(30);
  const [timeRange, setTimeRange] = useState<TimeRange>(() => {
    try {
      const stored = localStorage.getItem("dashboard-time-range");
      if (stored && ["1h", "6h", "24h", "7d", "30d"].includes(stored)) return stored as TimeRange;
    } catch { /* ignore */ }
    return "24h";
  });
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [sectionOrder, setSectionOrder] = useState<SectionKey[]>(() => {
    try {
      const stored = localStorage.getItem("dashboard-section-order");
      if (stored) {
        const parsed = JSON.parse(stored) as string[];
        if (Array.isArray(parsed) && parsed.length >= 3)
          return [...new Set([...parsed, "slo", "health"])] as SectionKey[];
      }
    } catch { /* ignore */ }
    return [...DEFAULT_SECTION_ORDER];
  });
  const [showCustomize, setShowCustomize] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [seedingDemo, setSeedingDemo] = useState(false);
  const [monitorView, setMonitorView] = useState<"table" | "grid">(() => {
    try { return (localStorage.getItem("dashboard-monitor-view") as "table" | "grid") ?? "table"; } catch { return "table"; }
  });
  const [, setTick] = useState(0);
  const autoRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Expose monitors/versionItems via refs so socket callbacks can read latest
  const monitorsRef = useRef<Monitor[]>(monitors);
  const runsRef = useRef<MonitorRun[]>(runs);
  const versionItemsRef = useRef<VersionSummaryItem[]>(versionItems);
  useEffect(() => { monitorsRef.current = monitors; }, [monitors]);
  useEffect(() => { runsRef.current = runs; }, [runs]);
  useEffect(() => { versionItemsRef.current = versionItems; }, [versionItems]);

  const loadDashboard = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      else setRefreshing(true);
      setError("");

      const monitorsData = await api<Monitor[]>("/v1/monitors");
      const sinceMs = TIME_RANGE_MS[timeRange] ?? 86400000;
      const since = new Date(Date.now() - sinceMs).toISOString();
      const [runsData, versionSummary] = await Promise.all([
        api<MonitorRun[]>(`/v1/monitors/runs?limit=200&since=${encodeURIComponent(since)}`),
        api<{ stats: unknown; items: VersionSummaryItem[] }>("/v1/monitors/version-summary").catch(() => ({ stats: {}, items: [] })),
      ]);

      if (!silent) {
        try {
          const channels = await api<{ id: string }[]>("/v1/alert-channels");
          setHasAlertChannels(Array.isArray(channels) && channels.length > 0);
        } catch { /* non-critical */ }
      }

      setMonitors(monitorsData);
      setRuns(runsData);
      setVersionItems(versionSummary.items ?? []);
      setStats(computeStats(monitorsData, runsData, versionSummary.items ?? []));
      setLastRefreshed(new Date());

      api<SloSummary>("/v1/monitors/slo-summary").then(setSloSummary).catch(() => {});
      api<{ timeline: HealthTimelineEntry[] }>("/v1/dashboard/health-timeline?days=30")
        .then((d) => setHealthTimeline(d.timeline))
        .catch(() => {});
      api<ActiveIncident[]>("/v1/incidents?status=INVESTIGATING,IDENTIFIED,MONITORING&limit=10")
        .then((incidents) => setActiveIncidents(Array.isArray(incidents) ? incidents : []))
        .catch(() => {});
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeRange]);

  useEffect(() => {
    const currentUser = getUser();
    setUser(currentUser);
    if (!currentUser) { router.push("/login"); return; }

    loadDashboard();

    const socket = createRealtimeSocket(currentUser.id);
    socket.on("connect", () => { socket.emit("subscribe", { userId: currentUser.id }); });

    socket.on("monitor.created", (payload: Monitor) => {
      setMonitors((prev) => {
        const next = prev.some((m) => m.id === payload.id) ? prev : [payload, ...prev];
        setStats(computeStats(next, runsRef.current, versionItemsRef.current));
        return next;
      });
    });

    socket.on("monitor.updated", (payload: Monitor) => {
      setMonitors((prev) => {
        const next = prev.map((m) => (m.id === payload.id ? payload : m));
        setStats(computeStats(next, runsRef.current, versionItemsRef.current));
        return next;
      });
    });

    socket.on("monitor.deleted", (payload: { id: string }) => {
      setMonitors((prev) => {
        const next = prev.filter((m) => m.id !== payload.id);
        const nextRuns = runsRef.current.filter((r) => r.monitorId !== payload.id);
        setRuns(nextRuns);
        setVersionItems((vi) => vi.filter((v) => v.id !== payload.id));
        setStats(computeStats(next, nextRuns, versionItemsRef.current.filter((v) => v.id !== payload.id)));
        return next;
      });
    });

    socket.on("monitor.checked", (payload: { run: MonitorRun }) => {
      if (!payload?.run) return;
      if (payload.run.level) {
        setVersionItems((prev) => {
          const exists = prev.some((v) => v.id === payload.run.monitorId);
          if (!exists) return prev;
          return prev.map((v) =>
            v.id === payload.run.monitorId ? { ...v, level: payload.run.level as "green" | "yellow" | "red" } : v,
          );
        });
      }
      setRuns((prev) => {
        const nextRuns = [payload.run, ...prev.filter((r) => r.id !== payload.run.id)].slice(0, 200);
        setStats((existing) => existing ? computeStats(monitorsRef.current, nextRuns, versionItemsRef.current) : existing);
        return nextRuns;
      });
    });

    return () => { socket.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, loadDashboard]);

  // Tick for "last updated" text
  useEffect(() => {
    const t = setInterval(() => setTick((v) => v + 1), 5000);
    return () => clearInterval(t);
  }, []);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return;
    const tick = () => {
      loadDashboard(true);
      autoRefreshTimerRef.current = setTimeout(tick, refreshInterval * 1000);
    };
    autoRefreshTimerRef.current = setTimeout(tick, refreshInterval * 1000);
    return () => { if (autoRefreshTimerRef.current) clearTimeout(autoRefreshTimerRef.current); };
  }, [autoRefresh, refreshInterval, loadDashboard]);

  // Fullscreen
  useEffect(() => {
    function onFsChange() { setIsFullscreen(!!document.fullscreenElement); }
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  }

  function moveSectionUp(idx: number) {
    if (idx === 0) return;
    setSectionOrder((prev) => {
      const next = [...prev];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      try { localStorage.setItem("dashboard-section-order", JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }

  function moveSectionDown(idx: number) {
    setSectionOrder((prev) => {
      if (idx >= prev.length - 1) return prev;
      const next = [...prev];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      try { localStorage.setItem("dashboard-section-order", JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }

  function resetSectionOrder() {
    const defaults = [...DEFAULT_SECTION_ORDER] as SectionKey[];
    setSectionOrder(defaults);
    try { localStorage.setItem("dashboard-section-order", JSON.stringify(defaults)); } catch { /* ignore */ }
  }

  async function handleSeedDemo() {
    setSeedingDemo(true);
    try {
      const samples = [
        { name: "GitHub", type: "HTTP", target: "https://github.com", intervalMs: 60000, timeoutMs: 10000, enabled: true },
        { name: "Cloudflare", type: "HTTP", target: "https://cloudflare.com", intervalMs: 60000, timeoutMs: 10000, enabled: true },
        { name: "PulseDock API", type: "HTTP", target: "http://localhost:4321/health", intervalMs: 30000, timeoutMs: 5000, enabled: true },
      ];
      await Promise.all(samples.map((m) => api("/v1/monitors", undefined, { method: "POST", body: JSON.stringify(m) })));
      await loadDashboard();
    } catch { /* user can create manually */ }
    finally { setSeedingDemo(false); }
  }

  function setTimeRangeAndStore(r: TimeRange) {
    setTimeRange(r);
    try { localStorage.setItem("dashboard-time-range", r); } catch { /* ignore */ }
  }

  function setMonitorViewAndStore(v: "table" | "grid") {
    setMonitorView(v);
    try { localStorage.setItem("dashboard-monitor-view", v); } catch { /* ignore */ }
  }

  const lastRefreshedText = lastRefreshed
    ? `Updated ${Math.floor((Date.now() - lastRefreshed.getTime()) / 1000)}s ago`
    : null;

  const monitorTypeById = new Map(monitors.map((m) => [m.id, m.type]));
  const uptimeRuns = runs.filter((r) => {
    const type = r.monitorType ?? monitorTypeById.get(r.monitorId);
    if (type && VERSION_TYPES.has(type)) return false;
    if (type && UPTIME_TYPES.has(type)) return true;
    return true;
  });

  return {
    // data
    stats, monitors, runs, versionItems, activeIncidents, sloSummary, healthTimeline,
    // ui state
    loading, error, user, hasAlertChannels,
    autoRefresh, setAutoRefresh,
    refreshInterval, setRefreshInterval,
    timeRange, setTimeRange: setTimeRangeAndStore,
    lastRefreshedText, refreshing,
    sectionOrder, showCustomize, setShowCustomize,
    isFullscreen,
    seedingDemo,
    monitorView, setMonitorView: setMonitorViewAndStore,
    // derived
    uptimeRuns, monitorTypeById,
    // actions
    loadDashboard,
    toggleFullscreen,
    moveSectionUp, moveSectionDown, resetSectionOrder,
    handleSeedDemo,
  };
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, AlertCircle, CheckCircle2, ChevronDown, ChevronUp, Clock, LayoutDashboard, LayoutGrid, List, Maximize2, Minimize2, Pause, Play, Plus, RefreshCw, RotateCcw, TrendingUp, GitBranch, PackageCheck, Zap, Shield, AlertTriangle } from "lucide-react";
import { api } from "../../lib/api";
import { createRealtimeSocket } from "../../lib/realtime";
import { getUser } from "../../components/auth";
import { AppFrame } from "../../components/app-frame";
import { Card } from "../components/Card";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from "../components/Table";
import { FadeIn } from "../components/FadeIn";
import { StaggerList } from "../components/StaggerList";
import { CountUp } from "../components/CountUp";
import { relativeTime, formatMonitorType } from "../components/timeUtils";
import { OnboardingChecklist } from "../components/OnboardingChecklist";
import { MiniSparkline } from "../../components/charts";
import { ProductTour, type TourStep } from "../../components/product-tour";
import { brand } from "../../lib/brand";

const VERSION_TYPES = new Set(["GIT_RELEASE", "DOCKER_IMAGE"]);
const UPTIME_TYPES = new Set(["HTTP", "TCP", "SSL_CERT", "HEARTBEAT", "DNS", "PING", "SMTP", "BROWSER"]);

const DASHBOARD_TOUR_STEPS: TourStep[] = [
  {
    title: `Welcome to ${brand.name}! 👋`,
    content: `${brand.name} monitors your self-hosted tools, tracks versions, and builds beautiful status pages. Let's take a quick tour to get you started.`,
  },
  {
    target: "nav[aria-label='Navigation']",
    placement: "right",
    title: "Navigation",
    content: "Use the left sidebar to navigate between Monitors, Alerts, Versions, Status Pages, and more. Each section has its own tools and views.",
  },
  {
    target: "[data-tour='stats-row']",
    placement: "bottom",
    title: "Live Stats",
    content: "These cards show real-time counts of your monitors, uptime percentage, checks run today, and version tracking status. All update live via WebSocket.",
  },
  {
    target: "[data-tour='add-monitor']",
    placement: "bottom",
    title: "Add Your First Monitor",
    content: "Click here to add a monitor. Choose from HTTP uptime checks, SSL certificate monitoring, TCP port checks, Heartbeat monitors, or version tracking for 5000+ self-hosted tools.",
  },
  {
    target: "[data-tour='time-range']",
    placement: "bottom",
    title: "Time Range Selector",
    content: "Filter your dashboard view by time period — 1h, 6h, 24h, 7d, or 30d. The live indicator shows when auto-refresh is active.",
  },
];

interface Monitor {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
}

interface VersionSummaryItem {
  id: string;
  level: "green" | "yellow" | "red";
}

interface MonitorRun {
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

interface DashboardStats {
  totalMonitors: number;
  // Uptime monitors
  uptimeMonitors: number;
  uptimePct: number;
  uptimeGreen: number;
  uptimeYellow: number;
  uptimeRed: number;
  // Version monitors
  versionMonitors: number;
  versionUpToDate: number;
  versionUpdateAvailable: number;
  versionMajorBehind: number;
}

export default function DashboardPage() {
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [runs, setRuns] = useState<MonitorRun[]>([]);
  const [versionItems, setVersionItems] = useState<VersionSummaryItem[]>([]);
  interface SloMonitorSummary {
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
  interface SloSummary {
    monitors: SloMonitorSummary[];
    summary: { total: number; ok: number; warning: number; breached: number };
  }
  interface HealthTimelineEntry {
    date: string;
    healthScore: number | null;
    green: number;
    total: number;
  }
  const [sloSummary, setSloSummary] = useState<SloSummary | null>(null);
  const [healthTimeline, setHealthTimeline] = useState<HealthTimelineEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [user, setUser] = useState<ReturnType<typeof getUser> | null>(null);
  const [hasAlertChannels, setHasAlertChannels] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(30); // seconds: 10, 30, 60, 300
  const [timeRange, setTimeRange] = useState<"1h" | "6h" | "24h" | "7d" | "30d">(() => {
    try {
      const stored = localStorage.getItem("dashboard-time-range");
      if (stored && ["1h", "6h", "24h", "7d", "30d"].includes(stored)) return stored as "1h" | "6h" | "24h" | "7d" | "30d";
    } catch { /* ignore */ }
    return "24h";
  });
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const autoRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [, setTick] = useState(0); // force re-render for "last updated" text

  const DEFAULT_SECTION_ORDER = ["uptime", "versions", "monitors", "slo", "health"] as const;
  type SectionKey = (typeof DEFAULT_SECTION_ORDER)[number];
  const [sectionOrder, setSectionOrder] = useState<SectionKey[]>(() => {
    try {
      const stored = localStorage.getItem("dashboard-section-order");
      if (stored) {
        const parsed = JSON.parse(stored) as string[];
        if (Array.isArray(parsed) && parsed.length >= 3) return [...new Set([...parsed, "slo", "health"])] as SectionKey[];
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

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  }

  useEffect(() => {
    function onFsChange() { setIsFullscreen(!!document.fullscreenElement); }
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  const moveSectionUp = (idx: number) => {
    if (idx === 0) return;
    setSectionOrder((prev) => {
      const next = [...prev];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      try { localStorage.setItem("dashboard-section-order", JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  const moveSectionDown = (idx: number) => {
    setSectionOrder((prev) => {
      if (idx >= prev.length - 1) return prev;
      const next = [...prev];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      try { localStorage.setItem("dashboard-section-order", JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  const resetSectionOrder = () => {
    const defaults = [...DEFAULT_SECTION_ORDER] as SectionKey[];
    setSectionOrder(defaults);
    try { localStorage.setItem("dashboard-section-order", JSON.stringify(defaults)); } catch { /* ignore */ }
  };

  const SECTION_LABELS: Record<SectionKey, string> = {
    uptime: "Uptime Monitoring",
    versions: "Version Tracking",
    monitors: "Monitors",
    slo: "SLO Health",
    health: "Health Timeline",
  };

  const timeRangeToMs: Record<string, number> = { "1h": 3600000, "6h": 21600000, "24h": 86400000, "7d": 604800000, "30d": 2592000000 };

  const loadDashboard = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      else setRefreshing(true);
      setError("");

      const monitorsData = await api<Monitor[]>("/v1/monitors");
      const sinceMs = timeRangeToMs[timeRange] ?? 86400000;
      const since = new Date(Date.now() - sinceMs).toISOString();
      const [runsData, versionSummary] = await Promise.all([
        api<MonitorRun[]>(`/v1/monitors/runs?limit=200&since=${encodeURIComponent(since)}`),
        api<{ stats: unknown; items: VersionSummaryItem[] }>("/v1/monitors/version-summary").catch(() => ({ stats: {}, items: [] })),
      ]);
      if (!silent) {
        try {
          const channels = await api<{ id: string }[]>("/v1/alert-channels");
          setHasAlertChannels(Array.isArray(channels) && channels.length > 0);
        } catch {
          // non-critical
        }
      }

      setMonitors(monitorsData);
      setRuns(runsData);
      setVersionItems(versionSummary.items ?? []);
      setStats(computeStats(monitorsData, runsData, versionSummary.items ?? []));
      setLastRefreshed(new Date());

      // Non-critical: fetch SLO summary and health timeline (won't block main render)
      api<SloSummary>("/v1/monitors/slo-summary").then(setSloSummary).catch(() => {});
      api<{ timeline: HealthTimelineEntry[] }>("/v1/dashboard/health-timeline?days=30")
        .then((d) => setHealthTimeline(d.timeline))
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
    if (!currentUser) {
      router.push("/login");
      return;
    }

    loadDashboard();

    const socket = createRealtimeSocket(currentUser.id);
    socket.on("connect", () => { socket.emit("subscribe", { userId: currentUser.id }); });

    socket.on("monitor.created", (payload: Monitor) => {
      setMonitors((prev) => {
        const next = prev.some((m) => m.id === payload.id) ? prev : [payload, ...prev];
        setStats(computeStats(next, runs, versionItems));
        return next;
      });
    });

    socket.on("monitor.updated", (payload: Monitor) => {
      setMonitors((prev) => {
        const next = prev.map((m) => (m.id === payload.id ? payload : m));
        setStats(computeStats(next, runs, versionItems));
        return next;
      });
    });

    socket.on("monitor.deleted", (payload: { id: string }) => {
      setMonitors((prev) => {
        const next = prev.filter((m) => m.id !== payload.id);
        const nextRuns = runs.filter((r) => r.monitorId !== payload.id);
        setRuns(nextRuns);
        setVersionItems((prev) => prev.filter((v) => v.id !== payload.id));
        setStats(computeStats(next, nextRuns, versionItems.filter((v) => v.id !== payload.id)));
        return next;
      });
    });

    socket.on("monitor.checked", (payload: { run: MonitorRun }) => {
      if (!payload?.run) return;
      // Update versionItems if this is a version monitor check
      if (payload.run.level) {
        setVersionItems((prev) => {
          const exists = prev.some((v) => v.id === payload.run.monitorId);
          if (!exists) return prev;
          return prev.map((v) => v.id === payload.run.monitorId ? { ...v, level: payload.run.level as "green" | "yellow" | "red" } : v);
        });
      }
      setRuns((prev) => {
        const nextRuns = [payload.run, ...prev.filter((r) => r.id !== payload.run.id)].slice(0, 20);
        setStats((existing) => existing ? computeStats(monitors, nextRuns, versionItems) : existing);
        return nextRuns;
      });
    });

    return () => { socket.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, loadDashboard]);

  // Tick every 5s to keep "last updated" text fresh
  useEffect(() => {
    const t = setInterval(() => setTick((v) => v + 1), 5000);
    return () => clearInterval(t);
  }, []);

  // Auto-refresh timer
  useEffect(() => {
    if (!autoRefresh) return;
    const tick = () => {
      loadDashboard(true);
      autoRefreshTimerRef.current = setTimeout(tick, refreshInterval * 1000);
    };
    autoRefreshTimerRef.current = setTimeout(tick, refreshInterval * 1000);
    return () => { if (autoRefreshTimerRef.current) clearTimeout(autoRefreshTimerRef.current); };
  }, [autoRefresh, refreshInterval, loadDashboard]);

  // Seed sample monitors for demo/onboarding
  const handleSeedDemo = async () => {
    setSeedingDemo(true);
    try {
      const sampleMonitors = [
        { name: "GitHub", type: "HTTP", target: "https://github.com", intervalMs: 60000, timeoutMs: 10000, enabled: true },
        { name: "Cloudflare", type: "HTTP", target: "https://cloudflare.com", intervalMs: 60000, timeoutMs: 10000, enabled: true },
        { name: `${brand.name} API`, type: "HTTP", target: "http://localhost:4321/health", intervalMs: 30000, timeoutMs: 5000, enabled: true },
      ];
      await Promise.all(sampleMonitors.map((m) => api("/v1/monitors", undefined, { method: "POST", body: JSON.stringify(m) })));
      await loadDashboard();
    } catch {
      // ignore — user can create manually
    } finally {
      setSeedingDemo(false);
    }
  };

  if (!user) return null;

  if (loading) {
    return (
      <AppFrame title="Dashboard" subtitle="Loading...">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-12 w-12 border-2 border-accent border-t-transparent" />
        </div>
      </AppFrame>
    );
  }

  const uptimeMonitors = monitors.filter((m) => UPTIME_TYPES.has(m.type));
  const versionMonitors = monitors.filter((m) => VERSION_TYPES.has(m.type));
  // Build a lookup: monitorId → monitorType from the monitors list (used when run.monitorType is absent)
  const monitorTypeById = new Map(monitors.map((m) => [m.id, m.type]));
  const uptimeRuns = runs.filter((r) => {
    const type = r.monitorType ?? monitorTypeById.get(r.monitorId);
    // If type is known and is a version type → exclude
    if (type && VERSION_TYPES.has(type)) return false;
    // If type is known and is an uptime type → include
    if (type && UPTIME_TYPES.has(type)) return true;
    // Unknown type (shouldn't happen after fix) → include as fallback
    return true;
  });

  // Format last refreshed time
  const lastRefreshedText = lastRefreshed
    ? `Updated ${Math.floor((Date.now() - lastRefreshed.getTime()) / 1000)}s ago`
    : null;

  return (
    <AppFrame title="Dashboard" subtitle={`Welcome back, ${user.name || "there"}!`} breadcrumbs={[{ label: "Dashboard" }]}>
      <div className="space-y-8">
        {/* Heading row with Live indicator and time range label */}
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold text-text-primary">
            Last {timeRange === "1h" ? "1 hour" : timeRange === "6h" ? "6 hours" : timeRange === "24h" ? "24 hours" : timeRange === "7d" ? "7 days" : "30 days"}
          </h2>
          {autoRefresh && (
            <span className="flex items-center gap-1.5 text-xs text-green-400 font-medium">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
              </span>
              Live
            </span>
          )}
        </div>
        {/* Controls row: time range + auto-refresh */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          {/* Time range selector */}
          <div className="flex items-center gap-1 rounded-lg border border-border bg-surface overflow-hidden" data-tour="time-range">
            {(["1h", "6h", "24h", "7d", "30d"] as const).map((r) => (
              <button
                key={r}
                onClick={() => { setTimeRange(r); try { localStorage.setItem("dashboard-time-range", r); } catch { /* ignore */ } }}
                className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  timeRange === r
                    ? "bg-accent/10 text-accent"
                    : "text-text-secondary hover:text-text-primary"
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
            onChange={(e) => setRefreshInterval(Number(e.target.value))}
            className="text-xs px-2 py-1 bg-surface border border-border rounded-md text-text-secondary focus:outline-none focus:ring-1 focus:ring-accent"
          >
            <option value={10}>10s</option>
            <option value={30}>30s</option>
            <option value={60}>1m</option>
            <option value={300}>5m</option>
          </select>
          <button
            onClick={() => setAutoRefresh((v) => !v)}
            title={autoRefresh ? "Pause auto-refresh" : "Resume auto-refresh"}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md border border-border bg-surface text-text-secondary hover:text-text-primary hover:border-accent/50 transition-colors"
          >
            {autoRefresh ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
            {autoRefresh ? "Live" : "Paused"}
          </button>
          <button
            onClick={() => loadDashboard(true)}
            title="Refresh now"
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md border border-border bg-surface text-text-secondary hover:text-text-primary hover:border-accent/50 transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            Refresh
          </button>
          <button
            onClick={() => setShowCustomize((v) => !v)}
            title="Customize layout"
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md border transition-colors ${showCustomize ? "border-accent/50 bg-accent/10 text-accent" : "border-border bg-surface text-text-secondary hover:text-text-primary hover:border-accent/50"}`}
          >
            <LayoutDashboard className="w-3 h-3" />
            Customize
          </button>
          <button
            onClick={toggleFullscreen}
            title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            className="p-1.5 rounded-md border border-border bg-surface text-text-secondary hover:text-text-primary hover:border-accent/50 transition-colors"
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
          </div>
        </div>

        {/* Customize section order panel */}
        {showCustomize && (
          
            <div className="rounded-xl border border-border bg-surface/60 p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-text-primary flex items-center gap-2">
                  <LayoutDashboard className="w-4 h-4 text-accent" />
                  Customize Layout
                </span>
                <button
                  onClick={resetSectionOrder}
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
                        onClick={() => moveSectionUp(idx)}
                        disabled={idx === 0}
                        className="p-0.5 rounded text-text-secondary hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        aria-label={`Move ${SECTION_LABELS[key]} up`}
                      >
                        <ChevronUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => moveSectionDown(idx)}
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
        {error && (
          
            <div className="flex items-start gap-3 p-4 rounded-xl bg-danger/10 border border-danger/20">
              <AlertCircle className="w-5 h-5 text-danger mt-0.5 shrink-0" />
              <span className="text-danger text-sm">{error}</span>
            </div>
          
        )}

        
          <OnboardingChecklist
            userId={user.id}
            hasMonitors={monitors.length > 0}
            hasAlertChannels={hasAlertChannels}
          />
          <ProductTour
            storageKey={`pulsedock_tour_dashboard_${user.id}`}
            autoStart={monitors.length === 0}
            steps={DASHBOARD_TOUR_STEPS}
          />
        

        {/* ── Ordered sections ─────────────────────────────────────── */}
        {sectionOrder.map((sectionKey) => {
          if (sectionKey === "uptime") {
            if (!stats) return null;
            return (
              
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-text-secondary" />
                    <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wide">Uptime Monitoring</h2>
                    <span className="text-xs text-text-secondary opacity-60">HTTP · TCP · SSL · Heartbeat</span>
                  </div>
                  <div data-tour="stats-row"><StaggerList className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <Card>
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-text-secondary text-sm mb-1">Monitors</p>
                          <p className="text-3xl font-bold text-text-primary"><CountUp value={`${stats.uptimeMonitors}`} duration={800} /></p>
                        </div>
                        <div className="p-3 rounded-xl bg-accent/10">
                          <Activity className="w-6 h-6 text-accent" />
                        </div>
                      </div>
                    </Card>
                    <Card>
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-text-secondary text-sm mb-1">Uptime</p>
                          <p className="text-3xl font-bold text-text-primary">
                            <CountUp value={`${stats.uptimePct}%`} duration={1200} />
                          </p>
                        </div>
                        <div className="p-3 rounded-xl bg-accent/10">
                          <TrendingUp className="w-6 h-6 text-accent" />
                        </div>
                      </div>
                    </Card>
                    <Card>
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-text-secondary text-sm mb-1">Operational</p>
                          <p className="text-3xl font-bold text-success"><CountUp value={`${stats.uptimeGreen}`} duration={900} /></p>
                        </div>
                        <div className="p-3 rounded-xl bg-success/10">
                          <CheckCircle2 className="w-6 h-6 text-success" />
                        </div>
                      </div>
                    </Card>
                    <Card>
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-text-secondary text-sm mb-1">Down / Degraded</p>
                          <p className="text-3xl font-bold text-danger"><CountUp value={`${stats.uptimeRed + stats.uptimeYellow}`} duration={800} /></p>
                        </div>
                        <div className={`p-3 rounded-xl ${stats.uptimeRed + stats.uptimeYellow > 0 ? "bg-danger/10" : "bg-surface-elevated"}`}>
                          <AlertCircle className={`w-6 h-6 ${stats.uptimeRed + stats.uptimeYellow > 0 ? "text-danger" : "text-text-secondary"}`} />
                        </div>
                      </div>
                    </Card>
                  </StaggerList></div>
                </div>
              
            );
          }

          if (sectionKey === "versions") {
            if (!stats || stats.versionMonitors === 0) return null;
            return (
              
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <GitBranch className="w-4 h-4 text-text-secondary" />
                    <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wide">Version Tracking</h2>
                    <span className="text-xs text-text-secondary opacity-60">Git releases · Docker images</span>
                  </div>
                  <StaggerList className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <Card>
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-text-secondary text-sm mb-1">Tracked</p>
                          <p className="text-3xl font-bold text-text-primary"><CountUp value={`${stats.versionMonitors}`} duration={800} /></p>
                        </div>
                        <div className="p-3 rounded-xl bg-accent/10">
                          <GitBranch className="w-6 h-6 text-accent" />
                        </div>
                      </div>
                    </Card>
                    <Card>
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-text-secondary text-sm mb-1">Up to Date</p>
                          <p className="text-3xl font-bold text-success"><CountUp value={`${stats.versionUpToDate}`} duration={900} /></p>
                        </div>
                        <div className="p-3 rounded-xl bg-success/10">
                          <PackageCheck className="w-6 h-6 text-success" />
                        </div>
                      </div>
                    </Card>
                    <Card>
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-text-secondary text-sm mb-1">Updates Available</p>
                          <p className="text-3xl font-bold text-warning"><CountUp value={`${stats.versionUpdateAvailable + stats.versionMajorBehind}`} duration={800} /></p>
                          {stats.versionMajorBehind > 0 && (
                            <p className="text-xs text-danger mt-1">{stats.versionMajorBehind} major version{stats.versionMajorBehind !== 1 ? "s" : ""} behind</p>
                          )}
                        </div>
                        <div className={`p-3 rounded-xl ${stats.versionUpdateAvailable + stats.versionMajorBehind > 0 ? "bg-warning/10" : "bg-surface-elevated"}`}>
                          <GitBranch className={`w-6 h-6 ${stats.versionUpdateAvailable + stats.versionMajorBehind > 0 ? "text-warning" : "text-text-secondary"}`} />
                        </div>
                      </div>
                    </Card>
                  </StaggerList>
                </div>
              
            );
          }

          if (sectionKey === "monitors") {
            return (
              
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-xl font-bold text-text-primary">Monitors</h2>
                      <p className="text-text-secondary text-sm mt-1">
                        {monitors.length} {monitors.length === 1 ? "monitor" : "monitors"} configured
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {monitors.length > 0 && (
                        <div className="flex items-center rounded-lg border border-border bg-surface overflow-hidden">
                          <button
                            onClick={() => { setMonitorView("table"); try { localStorage.setItem("dashboard-monitor-view","table"); } catch {} }}
                            className={`p-1.5 transition-colors ${monitorView === "table" ? "bg-accent/10 text-accent" : "text-text-secondary hover:text-text-primary"}`}
                            title="Table view"
                          >
                            <List className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => { setMonitorView("grid"); try { localStorage.setItem("dashboard-monitor-view","grid"); } catch {} }}
                            className={`p-1.5 transition-colors ${monitorView === "grid" ? "bg-accent/10 text-accent" : "text-text-secondary hover:text-text-primary"}`}
                            title="Grid view"
                          >
                            <LayoutGrid className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                      <Button onClick={() => router.push("/monitors")} size="lg" className="flex items-center gap-2" data-tour="add-monitor">
                        <Plus className="w-4 h-4" /> Add Monitor
                      </Button>
                    </div>
                  </div>
                  {monitors.length === 0 ? (
                    <Card className="text-center py-16">
                      <div className="p-4 rounded-2xl bg-surface-elevated inline-block mb-4">
                        <Activity className="w-12 h-12 text-text-secondary opacity-50" />
                      </div>
                      <p className="text-text-primary text-lg font-medium mb-2">No monitors configured yet</p>
                      <p className="text-text-secondary text-sm mb-6">Start monitoring your services, APIs, and endpoints</p>
                      <div className="flex items-center justify-center gap-3 flex-wrap">
                        <Button onClick={() => router.push("/monitors")} size="lg">
                          <Plus className="w-4 h-4 mr-2" />
                          Create monitor
                        </Button>
                        <Button
                          variant="secondary"
                          size="lg"
                          onClick={handleSeedDemo}
                          disabled={seedingDemo}
                        >
                          {seedingDemo ? (
                            <span className="flex items-center gap-2">
                              <RefreshCw className="w-4 h-4 animate-spin" />
                              Loading…
                            </span>
                          ) : (
                            <span className="flex items-center gap-2">
                              <Zap className="w-4 h-4" />
                              Load sample monitors
                            </span>
                          )}
                        </Button>
                      </div>
                      <p className="text-xs text-text-muted mt-4">Sample monitors check GitHub, Cloudflare, and your local API</p>
                    </Card>
                  ) : monitorView === "grid" ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                      {monitors.map((monitor) => {
                        const lastRun = runs.find((r) => r.monitorId === monitor.id);
                        const isVersion = VERSION_TYPES.has(monitor.type);
                        const statusColor = !monitor.enabled
                          ? "border-border text-text-secondary"
                          : !lastRun
                          ? "border-border text-text-secondary"
                          : isVersion
                          ? lastRun.level === "red" ? "border-danger/40 text-danger" : lastRun.level === "yellow" ? "border-warning/40 text-warning" : "border-success/30 text-success"
                          : lastRun.ok
                          ? "border-success/30 text-success"
                          : lastRun.level === "yellow"
                          ? "border-warning/40 text-warning"
                          : "border-danger/40 text-danger";
                        const dot = !monitor.enabled
                          ? "bg-text-muted/40"
                          : !lastRun
                          ? "bg-text-muted/40"
                          : isVersion
                          ? lastRun.level === "red" ? "bg-danger" : lastRun.level === "yellow" ? "bg-warning" : "bg-success"
                          : lastRun.ok ? "bg-success" : lastRun.level === "yellow" ? "bg-warning" : "bg-danger";
                        return (
                          <button
                            key={monitor.id}
                            onClick={() => router.push(isVersion ? "/versions" : `/monitors/${monitor.id}`)}
                            className={`flex flex-col gap-2 rounded-xl border bg-surface p-3 text-left hover:bg-surface-elevated transition-colors ${statusColor}`}
                          >
                            <div className="flex items-center justify-between gap-1">
                              <span className={`h-2 w-2 rounded-full shrink-0 ${dot}`} />
                              {isVersion && <GitBranch className="w-3 h-3 text-text-muted/60 shrink-0" />}
                            </div>
                            <span className="text-xs font-medium text-text-primary truncate leading-tight">{monitor.name}</span>
                            {lastRun?.latencyMs != null && !isVersion && (
                              <span className="text-[10px] text-text-muted font-mono">{lastRun.latencyMs}ms</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <Card className="p-0">
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHead>
                            <tr>
                              <TableHeader>Name</TableHeader>
                              <TableHeader>Type</TableHeader>
                              <TableHeader>Status</TableHeader>
                              <TableHeader>Trend</TableHeader>
                              <TableHeader>Last Check</TableHeader>
                              <TableHeader>Actions</TableHeader>
                            </tr>
                          </TableHead>
                          <TableBody>
                            {monitors.map((monitor) => {
                              const lastRun = runs.find((r) => r.monitorId === monitor.id);
                              const isVersion = VERSION_TYPES.has(monitor.type);
                              return (
                                <TableRow key={monitor.id}>
                                  <TableCell className="font-medium">{monitor.name}</TableCell>
                                  <TableCell className="text-text-secondary">
                                    <div className="flex items-center gap-1.5">
                                      {isVersion && <GitBranch className="w-3.5 h-3.5 text-text-secondary opacity-60" />}
                                      {formatMonitorType(monitor.type)}
                                    </div>
                                  </TableCell>
                                  <TableCell>
                                    {!monitor.enabled ? (
                                      <Badge variant="warning">Disabled</Badge>
                                    ) : lastRun ? (
                                      isVersion ? (
                                        versionStatusBadge(lastRun.level)
                                      ) : (
                                        lastRun.level === "yellow" ? (
                                          <Badge variant="warning">Degraded</Badge>
                                        ) : lastRun.ok ? (
                                          <Badge variant="success">Operational</Badge>
                                        ) : (
                                          <Badge variant="danger">Down</Badge>
                                        )
                                      )
                                    ) : (
                                      <Badge variant="default">Pending</Badge>
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    <MiniSparkline
                                      data={runs
                                        .filter((r) => r.monitorId === monitor.id)
                                        .slice(0, 20)
                                        .reverse()
                                        .map((r) => ({ value: r.latencyMs ?? 0, ok: r.ok }))}
                                      height={28}
                                      color={!lastRun || lastRun.ok ? "#3fb950" : "#f85149"}
                                      className="w-20"
                                    />
                                  </TableCell>
                                  <TableCell className="text-text-secondary text-sm">
                                    {lastRun ? relativeTime(lastRun.checkedAt) : "Never"}
                                  </TableCell>
                                  <TableCell>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => router.push(isVersion ? `/versions` : `/monitors?id=${monitor.id}`)}
                                      className="text-accent hover:text-accent-hover"
                                    >
                                      View →
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    </Card>
                  )}
                </div>
              
            );
          }

          if (sectionKey === "slo") {
            if (!sloSummary || sloSummary.summary.total === 0) return null;
            const { summary, monitors: sloMonitors } = sloSummary;
            return (
              <div key="slo" className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-text-primary flex items-center gap-2">
                      <Shield className="w-5 h-5 text-accent" />
                      SLO Health
                    </h2>
                    <p className="text-text-secondary text-sm mt-1">
                      {summary.total} monitor{summary.total !== 1 ? "s" : ""} with SLA targets
                    </p>
                  </div>
                  <Button variant="secondary" size="lg" onClick={() => router.push("/monitors")}>
                    Manage SLOs →
                  </Button>
                </div>

                {/* Summary bar */}
                <div className="grid grid-cols-3 gap-3">
                  <Card className="p-4 text-center">
                    <div className="text-3xl font-bold text-green-400">{summary.ok}</div>
                    <div className="text-xs text-text-muted mt-1">Meeting SLO</div>
                  </Card>
                  <Card className="p-4 text-center">
                    <div className="text-3xl font-bold text-yellow-400">{summary.warning}</div>
                    <div className="text-xs text-text-muted mt-1">At Risk</div>
                  </Card>
                  <Card className="p-4 text-center">
                    <div className="text-3xl font-bold text-red-400">{summary.breached}</div>
                    <div className="text-xs text-text-muted mt-1">Breached</div>
                  </Card>
                </div>

                {/* Per-monitor SLO rows */}
                <Card>
                  <div className="divide-y divide-border">
                    {sloMonitors.map((m) => (
                      <div
                        key={m.monitorId}
                        className="flex items-center justify-between px-4 py-3 hover:bg-surface-elevated/40 transition-colors cursor-pointer"
                        onClick={() => router.push(`/monitors/${m.monitorId}`)}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${
                            m.status === "ok" ? "bg-green-400" : m.status === "warning" ? "bg-yellow-400" : "bg-red-400"
                          }`} />
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-text-primary truncate">{m.name}</div>
                            <div className="text-xs text-text-muted">Target: {m.slaTarget}% · {m.periodDays}d window</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 shrink-0 ml-3">
                          <div className="text-right hidden sm:block">
                            <div className={`text-sm font-bold tabular-nums ${
                              m.actualUptime >= m.slaTarget ? "text-green-400" : "text-red-400"
                            }`}>
                              {m.actualUptime.toFixed(2)}%
                            </div>
                            <div className="text-xs text-text-muted">actual</div>
                          </div>
                          <div className="hidden md:block text-right">
                            <div className="text-sm text-text-secondary tabular-nums">{m.budgetRemainingPct.toFixed(0)}%</div>
                            <div className="text-xs text-text-muted">budget left</div>
                          </div>
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
                            m.status === "ok"
                              ? "bg-green-500/10 text-green-400 border-green-500/20"
                              : m.status === "warning"
                              ? "bg-yellow-500/10 text-yellow-400 border-yellow-500/20"
                              : "bg-red-500/10 text-red-400 border-red-500/20"
                          }`}>
                            {m.status === "ok" ? "OK" : m.status === "warning" ? "AT RISK" : "BREACHED"}
                          </span>
                          {m.hasLatencySli && (
                            <span title="Latency SLI configured"><AlertTriangle className="w-3.5 h-3.5 text-purple-400 shrink-0" /></span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            );
          }

          if (sectionKey === "health") {
            const hasData = healthTimeline && healthTimeline.some((d) => d.healthScore !== null);
            if (!hasData) return null;
            const maxBarH = 80;
            const scores = healthTimeline!.map((d) => d.healthScore ?? 0);
            const avgScore = scores.filter((_, i) => healthTimeline![i].healthScore !== null).reduce((a, b) => a + b, 0) / (healthTimeline!.filter((d) => d.healthScore !== null).length || 1);
            const trend = (() => {
              const valid = healthTimeline!.filter((d) => d.healthScore !== null);
              if (valid.length < 7) return 0;
              const recent = valid.slice(-7).reduce((a, d) => a + (d.healthScore ?? 0), 0) / 7;
              const earlier = valid.slice(-14, -7).reduce((a, d) => a + (d.healthScore ?? 0), 0) / Math.max(valid.slice(-14, -7).length, 1);
              return recent - earlier;
            })();
            return (
              <div key="health" className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-text-primary flex items-center gap-2">
                      <TrendingUp className="w-5 h-5 text-accent" />
                      Infrastructure Health
                    </h2>
                    <p className="text-text-secondary text-sm mt-1">
                      30-day uptime health score — % of monitors green per day
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className={`text-2xl font-bold tabular-nums ${avgScore >= 99 ? "text-green-400" : avgScore >= 95 ? "text-yellow-400" : "text-red-400"}`}>
                        {avgScore.toFixed(1)}%
                      </div>
                      <div className="text-xs text-text-muted">30-day avg</div>
                    </div>
                    {Math.abs(trend) >= 0.5 && (
                      <div className={`flex items-center gap-1 text-sm font-medium ${trend > 0 ? "text-green-400" : "text-red-400"}`}>
                        <TrendingUp className={`w-4 h-4 ${trend < 0 ? "rotate-180" : ""}`} />
                        {trend > 0 ? "+" : ""}{trend.toFixed(1)}%
                      </div>
                    )}
                  </div>
                </div>
                <Card className="p-4">
                  <div className="flex items-end gap-0.5 h-20" style={{ height: maxBarH }}>
                    {healthTimeline!.map((day) => {
                      const score = day.healthScore;
                      const barH = score === null ? 2 : Math.max(4, (score / 100) * maxBarH);
                      const color = score === null ? "bg-border" : score >= 99 ? "bg-green-500" : score >= 90 ? "bg-yellow-500" : "bg-red-500";
                      const dateLabel = new Date(day.date + "T00:00:00Z").toLocaleDateString(undefined, { month: "short", day: "numeric" });
                      return (
                        <div
                          key={day.date}
                          className="flex-1 flex flex-col items-center justify-end group relative cursor-default"
                          style={{ height: maxBarH }}
                          title={score === null ? `${dateLabel}: No data` : `${dateLabel}: ${score}% (${day.green}/${day.total} monitors green)`}
                        >
                          <div
                            className={`w-full rounded-sm transition-opacity group-hover:opacity-80 ${color}`}
                            style={{ height: barH }}
                          />
                          {/* Tooltip */}
                          <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-surface-elevated border border-border rounded px-2 py-1 text-xs text-text-primary whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-10 shadow-lg">
                            {dateLabel}: {score === null ? "No data" : `${score}%`}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex justify-between mt-2 text-xs text-text-muted">
                    <span>{new Date(healthTimeline![0].date + "T00:00:00Z").toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
                    <span className="flex items-center gap-3">
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-green-500 inline-block" />≥99%</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-yellow-500 inline-block" />90–99%</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-red-500 inline-block" />&lt;90%</span>
                    </span>
                    <span>Today</span>
                  </div>
                </Card>
              </div>
            );
          }

          return null;
        })}

        {/* ── Recent Activity ──────────────────────────────────────── */}
        
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-text-primary">Recent Activity</h2>
            {runs.length === 0 ? (
              <Card className="text-center py-12">
                <div className="p-4 rounded-2xl bg-surface-elevated inline-block mb-4">
                  <Clock className="w-10 h-10 text-text-secondary opacity-50" />
                </div>
                <p className="text-text-primary font-medium mb-1">No activity yet</p>
                <p className="text-text-secondary text-sm">Monitor runs will appear here once checks start running</p>
              </Card>
            ) : (
              <div className="space-y-4">
                {uptimeRuns.length > 0 && (
                  <Card>
                    <div className="space-y-1">
                      {uptimeRuns.slice(0, 5).map((run) => (
                        <div key={run.id} className="flex items-center justify-between py-3 px-3 rounded-lg hover:bg-surface-elevated/50 transition-colors border-b border-border last:border-b-0">
                          <div className="flex items-center gap-3">
                            {run.ok ? (
                              <div className="p-1.5 rounded-full bg-success/10">
                                <CheckCircle2 className="w-4 h-4 text-success" />
                              </div>
                            ) : (
                              <div className="p-1.5 rounded-full bg-danger/10">
                                <AlertCircle className="w-4 h-4 text-danger" />
                              </div>
                            )}
                            <div>
                              <p className="font-medium text-text-primary">{run.message}</p>
                              <p className="text-text-secondary text-xs">{relativeTime(run.checkedAt)}</p>
                            </div>
                          </div>
                          <Badge variant={run.ok ? "success" : "danger"}>{String(run.statusCode)}</Badge>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}
              </div>
            )}
          </div>
        
      </div>
    </AppFrame>
  );
}

// ── helpers ──────────────────────────────────────────────────────────────────

function computeStats(monitorsData: Monitor[], runsData: MonitorRun[], versionSummaryItems: VersionSummaryItem[] = []): DashboardStats {
  const VERSION_TYPES = new Set(["GIT_RELEASE", "DOCKER_IMAGE"]);
  const UPTIME_TYPES = new Set(["HTTP", "TCP", "SSL_CERT", "HEARTBEAT", "DNS", "PING", "SMTP", "BROWSER"]);

  const uptimeMonitors = monitorsData.filter((m) => UPTIME_TYPES.has(m.type));
  const versionMonitors = monitorsData.filter((m) => VERSION_TYPES.has(m.type));

  // Uptime: use latest run per monitor from runsData
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

  // Version: use version-summary API data (always most recent run, not time-range limited)
  // Fall back to runsData if summary not available
  let versionUpToDate = 0, versionUpdateAvailable = 0, versionMajorBehind = 0;
  if (versionSummaryItems.length > 0) {
    // Build a map for quick lookup
    const summaryMap = new Map(versionSummaryItems.map((item) => [item.id, item.level]));
    for (const m of versionMonitors) {
      if (!m.enabled) continue;
      const level = summaryMap.get(m.id);
      if (!level || level === "green") versionUpToDate++;
      else if (level === "yellow") versionUpdateAvailable++;
      else versionMajorBehind++;
    }
  } else {
    // Fallback: use time-range runs (may be inaccurate if monitor hasn't checked in range)
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

function versionStatusBadge(level?: "green" | "yellow" | "red") {
  if (level === "green") return <Badge variant="success">Up to date</Badge>;
  if (level === "yellow") return <Badge variant="warning">Update available</Badge>;
  if (level === "red") return <Badge variant="danger">Major update</Badge>;
  return <Badge variant="default">Pending</Badge>;
}

"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { AlertCircle, ArrowLeft, Activity, Clock, TrendingUp, Zap, Settings, Play, Power, PowerOff } from "lucide-react";
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
  type: "HTTP" | "GIT_RELEASE" | "DOCKER_IMAGE" | "TCP" | "SSL_CERT" | "HEARTBEAT";
  target: string;
  intervalSec: number;
  enabled: boolean;
  createdAt: string;
  config?: Record<string, unknown>;
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
        const [monitors, monitorRuns, alertChs] = await Promise.all([
          api<MonitorItem[]>("/v1/monitors", user!.id),
          api<MonitorRun[]>(`/v1/monitors/${id}/runs`, user!.id),
          api<AlertChannelInfo[]>(`/v1/monitors/${id}/alerts`, user!.id).catch(() => []),
        ]);
        const found = monitors.find((m) => m.id === id) ?? null;
        if (!found) {
          router.push("/monitors");
          return;
        }
        setMonitor(found);
        setRuns(monitorRuns);
        setAlertChannels(alertChs);
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

        {/* Response time trend (LineSparkline) */}
        {monitor.type !== "HEARTBEAT" && (
          
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
              const chartData = runs
                .slice(0, 50)
                .reverse()
                .filter((r) => r.latencyMs !== null)
                .map((r) => ({
                  time: new Date(r.checkedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
                  value: r.latencyMs as number,
                  ok: r.ok,
                }));
              const avg =
                chartData.length > 0
                  ? Math.round(chartData.reduce((s, d) => s + d.value, 0) / chartData.length)
                  : undefined;
              return (
                <ResponseAreaChart
                  data={chartData}
                  height={160}
                  avgLine={avg}
                  color="#58a6ff"
                />
              );
            })()}
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
        

        {/* Run history table */}
        
          <Card className="p-0">
            <div className="px-4 py-3 border-b border-border">
              <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">
                Last 20 Checks
              </h2>
            </div>
            <div className="overflow-x-auto">
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
                    {runs.slice(0, 20).map((run) => (
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

      </div>
    </AppFrame>
  );
}

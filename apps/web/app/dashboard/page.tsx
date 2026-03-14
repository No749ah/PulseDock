"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, AlertCircle, CheckCircle2, Clock, Plus, TrendingUp } from "lucide-react";
import { api } from "../../lib/api";
import { createRealtimeSocket } from "../../lib/realtime";
import { getUser } from "../../components/auth";
import { AppFrame } from "../../components/app-frame";
import { Card } from "../components/Card";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from "../components/Table";
import { FadeIn } from "../components/FadeIn";
import { relativeTime, formatMonitorType } from "../components/timeUtils";
import { OnboardingChecklist } from "../components/OnboardingChecklist";

interface Monitor {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
}

interface MonitorRun {
  id: string;
  monitorId: string;
  ok: boolean;
  statusCode: number;
  latencyMs?: number;
  message: string;
  checkedAt: string;
}

interface DashboardStats {
  totalMonitors: number;
  activeMonitors: number;
  uptime: number;
  lastCheck: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [runs, setRuns] = useState<MonitorRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [user, setUser] = useState<ReturnType<typeof getUser> | null>(null);
  const [hasAlertChannels, setHasAlertChannels] = useState(false);

  useEffect(() => {
    const currentUser = getUser();
    setUser(currentUser);
    if (!currentUser) {
      router.push("/login");
      return;
    }

    const computeStats = (monitorsData: Monitor[], runsData: MonitorRun[]) => {
      const active = monitorsData.filter((m) => m.enabled).length;
      const upMonitors = runsData.filter((r) => r.ok).length;
      const uptime = runsData.length > 0 ? Math.round((upMonitors / runsData.length) * 100) : 100;

      setStats({
        totalMonitors: monitorsData.length,
        activeMonitors: active,
        uptime,
        lastCheck: new Date().toISOString(),
      });
    };

    async function loadDashboard() {
      try {
        setLoading(true);
        setError("");

        const monitorsData = await api<Monitor[]>("/v1/monitors");
        const runsData = await api<MonitorRun[]>("/v1/monitors/runs?limit=10");
        // Check if user has any alert channels (for onboarding)
        try {
          const channels = await api<{ id: string }[]>("/v1/alert-channels");
          setHasAlertChannels(Array.isArray(channels) && channels.length > 0);
        } catch {
          // non-critical, ignore
        }

        setMonitors(monitorsData);
        setRuns(runsData);
        computeStats(monitorsData, runsData);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load dashboard");
      } finally {
        setLoading(false);
      }
    }

    loadDashboard();

    const socket = createRealtimeSocket(currentUser.id);

    socket.on("connect", () => {
      socket.emit("subscribe", { userId: currentUser.id });
    });

    socket.on("monitor.created", (payload: Monitor) => {
      setMonitors((prev) => {
        const next = prev.some((m) => m.id === payload.id) ? prev : [payload, ...prev];
        setStats((existing) =>
          existing
            ? { ...existing, totalMonitors: next.length, activeMonitors: next.filter((m) => m.enabled).length }
            : existing,
        );
        return next;
      });
    });

    socket.on("monitor.updated", (payload: Monitor) => {
      setMonitors((prev) => {
        const next = prev.map((m) => (m.id === payload.id ? payload : m));
        setStats((existing) =>
          existing ? { ...existing, activeMonitors: next.filter((m) => m.enabled).length } : existing,
        );
        return next;
      });
    });

    socket.on("monitor.deleted", (payload: { id: string }) => {
      setMonitors((prev) => {
        const next = prev.filter((m) => m.id !== payload.id);
        setStats((existing) =>
          existing
            ? { ...existing, totalMonitors: next.length, activeMonitors: next.filter((m) => m.enabled).length }
            : existing,
        );
        return next;
      });
      setRuns((prev) => prev.filter((r) => r.monitorId !== payload.id));
    });

    socket.on("monitor.checked", (payload: { run: MonitorRun }) => {
      if (!payload?.run) return;
      setRuns((prev) => {
        const nextRuns = [payload.run, ...prev.filter((r) => r.id !== payload.run.id)].slice(0, 10);
        setStats((existing) => {
          if (!existing) return existing;
          const upMonitors = nextRuns.filter((r) => r.ok).length;
          const uptime = nextRuns.length > 0 ? Math.round((upMonitors / nextRuns.length) * 100) : 100;
          return { ...existing, uptime, lastCheck: payload.run.checkedAt };
        });
        return nextRuns;
      });
    });

    return () => {
      socket.disconnect();
    };
  }, [router]);

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

  return (
    <AppFrame title="Dashboard" subtitle={`Welcome back, ${user.name || "there"}!`}>
      <div className="space-y-8">
        {/* Error */}
        {error && (
          <FadeIn>
            <div className="flex items-start gap-3 p-4 rounded-xl bg-danger/10 border border-danger/20">
              <AlertCircle className="w-5 h-5 text-danger mt-0.5 shrink-0" />
              <span className="text-danger text-sm">{error}</span>
            </div>
          </FadeIn>
        )}

        {/* Onboarding Checklist — shown to new users */}
        <FadeIn>
          <OnboardingChecklist
            userId={user.id}
            hasMonitors={monitors.length > 0}
            hasAlertChannels={hasAlertChannels}
          />
        </FadeIn>

        {/* Stats Grid */}
        {stats && (
          <FadeIn>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <Card>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-text-secondary text-sm mb-1">Total Monitors</p>
                    <p className="text-3xl font-bold text-text-primary">{stats.totalMonitors}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-accent/10">
                    <Activity className="w-6 h-6 text-accent" />
                  </div>
                </div>
              </Card>

              <Card>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-text-secondary text-sm mb-1">Active</p>
                    <p className="text-3xl font-bold text-text-primary">{stats.activeMonitors}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-success/10">
                    <CheckCircle2 className="w-6 h-6 text-success" />
                  </div>
                </div>
              </Card>

              <Card>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-text-secondary text-sm mb-1">Uptime</p>
                    <p className="text-3xl font-bold text-text-primary">
                      {stats.uptime}
                      <span className="text-lg text-text-secondary">%</span>
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
                    <p className="text-text-secondary text-sm mb-1">Last Check</p>
                    <p className="text-lg font-mono text-text-primary mt-1">
                      {relativeTime(stats.lastCheck)}
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-surface-elevated">
                    <Clock className="w-6 h-6 text-text-secondary" />
                  </div>
                </div>
              </Card>
            </div>
          </FadeIn>
        )}

        {/* Monitors Section */}
        <FadeIn delay={0.1}>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-text-primary">Monitors</h2>
                <p className="text-text-secondary text-sm mt-1">
                  {monitors.length} {monitors.length === 1 ? "monitor" : "monitors"} configured
                </p>
              </div>
              <Button onClick={() => router.push("/monitors")} size="lg" className="flex items-center gap-2">
                <Plus className="w-4 h-4" /> Add Monitor
              </Button>
            </div>

            {monitors.length === 0 ? (
              <Card className="text-center py-16">
                <div className="p-4 rounded-2xl bg-surface-elevated inline-block mb-4">
                  <Activity className="w-12 h-12 text-text-secondary opacity-50" />
                </div>
                <p className="text-text-primary text-lg font-medium mb-2">No monitors configured yet</p>
                <p className="text-text-secondary text-sm mb-6">Start monitoring your services, APIs, and endpoints</p>
                <Button onClick={() => router.push("/monitors")} size="lg">Create your first monitor</Button>
              </Card>
            ) : (
              <Card className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHead>
                      <tr>
                        <TableHeader>Name</TableHeader>
                        <TableHeader>Type</TableHeader>
                        <TableHeader>Status</TableHeader>
                        <TableHeader>Last Check</TableHeader>
                        <TableHeader>Actions</TableHeader>
                      </tr>
                    </TableHead>
                    <TableBody>
                      {monitors.map((monitor) => {
                        const lastRun = runs.find((r) => r.monitorId === monitor.id);
                        return (
                          <TableRow key={monitor.id}>
                            <TableCell className="font-medium">{monitor.name}</TableCell>
                            <TableCell className="text-text-secondary">{formatMonitorType(monitor.type)}</TableCell>
                            <TableCell>
                              {monitor.enabled ? (
                                lastRun ? (
                                  <Badge variant={lastRun.ok ? "success" : "danger"}>
                                    {lastRun.ok ? "OK" : "Failed"}
                                  </Badge>
                                ) : (
                                  <Badge variant="default">Pending</Badge>
                                )
                              ) : (
                                <Badge variant="warning">Disabled</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-text-secondary text-sm">
                              {lastRun ? relativeTime(lastRun.checkedAt) : "Never"}
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => router.push(`/monitors?id=${monitor.id}`)}
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
        </FadeIn>

        {/* Recent Activity */}
        <FadeIn delay={0.2}>
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
              <Card>
                <div className="space-y-1">
                  {runs.slice(0, 5).map((run) => (
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
                          <p className="text-text-secondary text-xs">
                            {relativeTime(run.checkedAt)}
                          </p>
                        </div>
                      </div>
                      <Badge variant={run.ok ? "success" : "danger"}>{String(run.statusCode)}</Badge>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        </FadeIn>
      </div>
    </AppFrame>
  );
}

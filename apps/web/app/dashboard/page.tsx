"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, AlertCircle, CheckCircle2, Clock, Plus, TrendingUp } from "lucide-react";
import { api } from "../../lib/api";
import { getUser } from "../../components/auth";
import { AppFrame } from "../../components/app-frame";
import { Card } from "../components/Card";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from "../components/Table";
import { FadeIn } from "../components/FadeIn";

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
  status: number;
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

  useEffect(() => {
    const currentUser = getUser();
    setUser(currentUser);
    if (!currentUser) {
      router.push("/login");
      return;
    }

    const userId = currentUser.id;

    async function loadDashboard() {
      try {
        setLoading(true);
        setError("");

        // Fetch monitors
        const monitorsData = await api<Monitor[]>("/v1/monitors", userId);
        setMonitors(monitorsData);

        // Fetch recent runs
        const runsData = await api<MonitorRun[]>("/v1/monitors/runs?limit=10", userId);
        setRuns(runsData);

        // Calculate stats
        const active = monitorsData.filter((m) => m.enabled).length;
        const upMonitors = runsData.filter((r) => r.ok).length;
        const uptime =
          runsData.length > 0 ? Math.round((upMonitors / runsData.length) * 100) : 100;

        setStats({
          totalMonitors: monitorsData.length,
          activeMonitors: active,
          uptime,
          lastCheck: new Date().toISOString(),
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load dashboard");
      } finally {
        setLoading(false);
      }
    }

    loadDashboard();
  }, [user, router]);

  if (!user) return null;
  if (loading) {
    return (
      <AppFrame title="Dashboard" subtitle="Loading...">
        <div className="flex items-center justify-center py-20">
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

        {/* Stats Grid */}
        {stats && (
          <FadeIn>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="lg:col-span-1">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-text-muted text-sm mb-1">Total Monitors</p>
                    <p className="text-3xl font-bold">{stats.totalMonitors}</p>
                  </div>
                  <Activity className="w-8 h-8 text-accent" />
                </div>
              </Card>

              <Card className="lg:col-span-1">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-text-muted text-sm mb-1">Active</p>
                    <p className="text-3xl font-bold">{stats.activeMonitors}</p>
                  </div>
                  <CheckCircle2 className="w-8 h-8 text-success" />
                </div>
              </Card>

              <Card className="lg:col-span-1">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-text-muted text-sm mb-1">Uptime</p>
                    <p className="text-3xl font-bold">{stats.uptime}%</p>
                  </div>
                  <TrendingUp className="w-8 h-8 text-accent" />
                </div>
              </Card>

              <Card className="lg:col-span-1">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-text-muted text-sm mb-1">Last Check</p>
                    <p className="text-sm font-mono text-text-secondary">
                      {new Date(stats.lastCheck).toLocaleTimeString()}
                    </p>
                  </div>
                  <Clock className="w-8 h-8 text-text-muted" />
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
                <h2 className="text-2xl font-bold">Monitors</h2>
                <p className="text-text-muted text-sm mt-1">
                  {monitors.length} {monitors.length === 1 ? "monitor" : "monitors"} configured
                </p>
              </div>
              <Button onClick={() => router.push("/monitors")} className="flex items-center gap-2">
                <Plus className="w-4 h-4" /> Add Monitor
              </Button>
            </div>

            {monitors.length === 0 ? (
              <Card className="text-center py-12">
                <Activity className="w-12 h-12 text-text-muted mx-auto mb-4 opacity-50" />
                <p className="text-text-muted mb-4">No monitors configured yet</p>
                <Button onClick={() => router.push("/monitors")}>Create your first monitor</Button>
              </Card>
            ) : (
              <Card>
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
                          <TableCell>{monitor.type}</TableCell>
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
                          <TableCell className="text-text-muted text-sm">
                            {lastRun
                              ? new Date(lastRun.checkedAt).toLocaleDateString()
                              : "Never"}
                          </TableCell>
                          <TableCell className="text-right">
                            <button
                              onClick={() => router.push(`/monitors?id=${monitor.id}`)}
                              className="text-accent hover:text-accent-hover text-sm transition-colors"
                            >
                              View
                            </button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </Card>
            )}
          </div>
        </FadeIn>

        {/* Recent Activity */}
        {runs.length > 0 && (
          <FadeIn delay={0.2}>
            <div className="space-y-4">
              <h2 className="text-2xl font-bold">Recent Activity</h2>
              <Card>
                <div className="space-y-3">
                  {runs.slice(0, 5).map((run) => (
                    <div key={run.id} className="flex items-center justify-between py-3 border-b border-border last:border-b-0">
                      <div className="flex items-center gap-3">
                        {run.ok ? (
                          <CheckCircle2 className="w-5 h-5 text-success" />
                        ) : (
                          <AlertCircle className="w-5 h-5 text-danger" />
                        )}
                        <div>
                          <p className="font-medium">{run.message}</p>
                          <p className="text-text-muted text-xs">
                            {new Date(run.checkedAt).toLocaleString()}
                          </p>
                        </div>
                      </div>
                      <span className="text-xs font-mono text-text-muted">{run.status}</span>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          </FadeIn>
        )}
      </div>
    </AppFrame>
  );
}

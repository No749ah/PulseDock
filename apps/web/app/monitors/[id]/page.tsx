"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { AlertCircle, ArrowLeft } from "lucide-react";
import { api } from "../../../lib/api";
import { getUser } from "../../../components/auth";
import { AppFrame } from "../../../components/app-frame";
import { Card } from "../../components/Card";
import { Badge } from "../../components/Badge";
import { FadeIn } from "../../components/FadeIn";
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from "../../components/Table";
import { ResponseTimeChart } from "../../components/ResponseTimeChart";
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

export default function MonitorDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params.id === "string" ? params.id : Array.isArray(params.id) ? params.id[0] : "";

  const [monitor, setMonitor] = useState<MonitorItem | null>(null);
  const [runs, setRuns] = useState<MonitorRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
        const [monitors, monitorRuns] = await Promise.all([
          api<MonitorItem[]>("/v1/monitors", user!.id),
          api<MonitorRun[]>(`/v1/monitors/${id}/runs`, user!.id),
        ]);
        const found = monitors.find((m) => m.id === id) ?? null;
        if (!found) {
          router.push("/monitors");
          return;
        }
        setMonitor(found);
        setRuns(monitorRuns);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load monitor");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [id, router]);

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

  // Stats
  const last30 = runs.slice(0, 30);
  const passing = last30.filter((r) => r.ok).length;
  const uptimePct = last30.length > 0 ? Math.round((passing / last30.length) * 100) : null;

  const withLatency = runs.filter((r) => r.latencyMs !== null);
  const avgLatency =
    withLatency.length > 0
      ? Math.round(withLatency.reduce((sum, r) => sum + (r.latencyMs as number), 0) / withLatency.length)
      : null;

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
      : `${streak} consecutive ${runs[0].ok ? "OK" : "Failed"}`;

  return (
    <AppFrame title={monitor.name}>
      <div className="space-y-6">
        {/* Back link */}
        <FadeIn>
          <Link
            href="/monitors"
            className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-accent transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Monitors
          </Link>
        </FadeIn>

        {/* Header */}
        <FadeIn delay={0.05}>
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-bold text-text-primary">{monitor.name}</h1>
              <Badge variant="default">{formatMonitorType(monitor.type)}</Badge>
              <Badge variant={monitor.enabled ? "success" : "warning"}>
                {monitor.enabled ? "Enabled" : "Disabled"}
              </Badge>
            </div>
            <p
              className="text-sm text-text-secondary font-mono truncate max-w-[600px]"
              title={monitor.target}
            >
              {monitor.target}
            </p>
          </div>
        </FadeIn>

        {/* Stats row */}
        <FadeIn delay={0.1}>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Card className="flex flex-col gap-1 p-4">
              <span className="text-xs text-text-secondary uppercase tracking-wider">Uptime</span>
              <span className="text-2xl font-bold text-text-primary">
                {uptimePct !== null ? `${uptimePct}%` : "—"}
              </span>
              <span className="text-xs text-text-secondary">last 30 checks</span>
            </Card>
            <Card className="flex flex-col gap-1 p-4">
              <span className="text-xs text-text-secondary uppercase tracking-wider">Avg Latency</span>
              <span className="text-2xl font-bold text-text-primary">
                {avgLatency !== null ? `${avgLatency}ms` : "N/A"}
              </span>
              <span className="text-xs text-text-secondary">all runs</span>
            </Card>
            <Card className="flex flex-col gap-1 p-4">
              <span className="text-xs text-text-secondary uppercase tracking-wider">Last Status</span>
              <div className="mt-1">
                {lastRun ? (
                  <Badge variant={lastRun.ok ? "success" : "danger"}>
                    {lastRun.ok ? "OK" : "Failed"}
                  </Badge>
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
            </Card>
          </div>
        </FadeIn>

        {/* Heartbeat info card */}
        {monitor.type === "HEARTBEAT" && (
          <FadeIn delay={0.12}>
            <Card className="p-4 space-y-3">
              <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">Heartbeat Config</h2>
              <div className="space-y-2">
                <div>
                  <span className="text-xs text-text-secondary">Ping URL</span>
                  <p className="font-mono text-xs text-text-primary bg-surface-elevated rounded px-2 py-1 mt-1 break-all">
                    {typeof window !== "undefined" ? `${window.location.origin}/api/v1/heartbeat/${monitor.config?.token ?? "—"}` : `…/v1/heartbeat/${monitor.config?.token ?? "—"}`}
                  </p>
                  <p className="text-xs text-text-secondary mt-1">Send a POST to this URL from your cron job or service to mark it healthy.</p>
                </div>
                <div className="flex gap-6 text-sm">
                  <div>
                    <span className="text-xs text-text-secondary block">Timeout</span>
                    <span className="font-medium text-text-primary">{String(monitor.config?.timeoutMin ?? 5)} min</span>
                  </div>
                </div>
              </div>
            </Card>
          </FadeIn>
        )}

        {/* Response time chart */}
        <FadeIn delay={0.15}>
          <Card className="p-4 space-y-3">
            <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">
              {monitor.type === "HEARTBEAT" ? "Heartbeat History" : "Response Time"}
            </h2>
            <ResponseTimeChart runs={runs} height={80} />
          </Card>
        </FadeIn>

        {/* Run history table */}
        <FadeIn delay={0.2}>
          <Card className="p-0">
            <div className="px-4 py-3 border-b border-border">
              <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">
                Last 20 Runs
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
                          <Badge variant={run.ok ? "success" : "danger"}>
                            {run.ok ? "OK" : "Failed"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm font-mono text-text-secondary">
                          {run.latencyMs !== null ? `${run.latencyMs}ms` : "—"}
                        </TableCell>
                        <TableCell className="text-sm font-mono text-text-secondary">
                          {run.statusCode || "—"}
                        </TableCell>
                        <TableCell className="text-sm text-text-secondary max-w-[300px] truncate" title={run.message}>
                          {run.message.length > 60 ? run.message.slice(0, 60) + "…" : run.message}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </Card>
        </FadeIn>
      </div>
    </AppFrame>
  );
}

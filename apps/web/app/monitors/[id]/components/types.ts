export interface MonitorItem {
  id: string;
  name: string;
  type: "HTTP" | "GIT_RELEASE" | "DOCKER_IMAGE" | "TCP" | "SSL_CERT" | "HEARTBEAT" | "DNS" | "PING" | "SMTP" | "BROWSER" | "WHOIS";
  target: string;
  intervalSec: number;
  enabled: boolean;
  createdAt: string;
  config?: Record<string, unknown>;
  slaTarget?: number | null;
  slaPeriodDays?: number | null;
  sliLatencyTarget?: number | null;
  sliLatencyWindow?: number | null;
  tags?: Array<{ id: string; name: string; color?: string | null }>;
  description?: string | null;
  runbookUrl?: string | null;
  confirmations?: number | null;
  retryCount?: number | null;
  isFlapping?: boolean;
  flapDetectionEnabled?: boolean;
  flapAlertedAt?: string | null;
  mutedUntil?: string | null;
  isAcknowledged?: boolean;
  activeAck?: { id: string; note: string | null; acknowledgedAt: string } | null;
  autoIncident?: boolean;
  autoIncidentSeverity?: string | null;
  latencyAlertMs?: number | null;
  anomalyDetection?: boolean;
  anomalyMultiplier?: number | null;
  scheduleEnabled?: boolean;
  scheduleDays?: string | null;
  scheduleStartHour?: number | null;
  scheduleEndHour?: number | null;
}

export interface SloReport {
  monitorId: string;
  period: { days: number; from: string; to: string };
  uptime: {
    target: number;
    actual: number;
    status: "ok" | "warning" | "breached";
    totalChecks: number;
    failedChecks: number;
    remainingBudgetMinutes: number;
  };
  latency?: {
    target: number;
    p50: number;
    p95: number;
    p99: number;
    status: "ok" | "warning" | "breached";
    window: number;
    totalChecks: number;
    exceedingChecks: number;
  };
  errorBudget: {
    uptimeBudgetMinutes: number;
    uptimeBurnedMinutes: number;
    uptimeBurnRate: number;
    latencyBudgetPct: number;
    latencyBurnedPct: number;
    latencyBurnRate: number;
    overallHealth: "ok" | "warning" | "breached";
  };
}

export interface AlertChannelInfo {
  alertChannelId: string;
  notifyOn: string;
  alertChannel: {
    id: string;
    name: string;
    type: string;
  };
  escalationPolicyId?: string | null;
  escalationPolicy?: { id: string; name: string } | null;
}

export interface MonitorDependency {
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

export interface RunTimings {
  dnsMs: number | null;
  tcpMs: number | null;
  tlsMs: number | null;
  ttfbMs: number | null;
  downloadMs: number | null;
}

export interface MonitorRun {
  id: string;
  monitorId: string;
  ok: boolean;
  statusCode: number;
  latencyMs: number | null;
  message: string;
  checkedAt: string;
  level?: string;
  /** First 500 chars of response body on failure, for debugging */
  responseBody?: string | null;
  /** HTTP timing breakdown (DNS, TCP, TLS, TTFB, Download). Only for HTTP/BROWSER monitors. */
  timings?: RunTimings | null;
}

export type UptimePeriod = "1d" | "7d" | "30d" | "90d";

export interface UptimeStats {
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

export interface ErrorBudget {
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

export interface HealthScore {
  score: number;
  grade: string;
  breakdown: { uptime: number; latency: number; sla: number; streak: number };
}

export interface MonitorEvent {
  id: string;
  message: string;
  eventType: string;
  createdAt: string;
  userId: string;
}

export interface ChartPoint {
  ts: string;
  avgLatencyMs: number | null;
  p95LatencyMs: number | null;
  uptimePct: number;
  checkCount: number;
}

export const PERIOD_LABELS: Record<UptimePeriod, string> = {
  "1d": "24h",
  "7d": "7d",
  "30d": "30d",
  "90d": "90d",
};

export function formatDuration(sec: number): string {
  if (sec === 0) return "0s";
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.round(sec / 60)}m`;
  if (sec < 86400) return `${Math.round(sec / 3600)}h`;
  return `${Math.round(sec / 86400)}d`;
}

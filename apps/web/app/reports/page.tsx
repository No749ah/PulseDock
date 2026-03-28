'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  BarChart2,
  Download,
  FileText,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  Activity,
  Gauge,
  Flame,
  TrendingDown,
  Mail,
  Send,
} from 'lucide-react';
import { AppFrame } from '../../components/app-frame';
import { Card } from '../components/Card';
import { Badge } from '../components/Badge';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '../components/Table';
import { Button } from '../components/Button';
import { getUser } from '../../components/auth';
import { api } from '../../lib/api';
import { exportCSV } from '../../lib/useTableSort';
import { useToast } from '../../components/ui/toast';
import { FadeIn } from '../components/FadeIn';

type Period = '7d' | '30d' | '90d';

interface Monitor {
  id: string;
  name: string;
  type: string;
  status: string;
  enabled: boolean;
  target?: string;
  slaTarget?: number | null;
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
  actualUptimePct: number;
  burnRate: number;
  burnRate1h: number;
  burnRate6h: number;
  burnRate24h: number;
  status: 'healthy' | 'warning' | 'critical' | 'exhausted';
  projectedExhaustionDate: string | null;
}

interface ErrorBudgetRow {
  monitor: Monitor;
  budget: ErrorBudget | null;
  loading: boolean;
  error: boolean;
}

interface UptimeStats {
  monitorId: string;
  period: string;
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

interface MonitorRow {
  monitor: Monitor;
  stats: UptimeStats | null;
  loading: boolean;
  error: boolean;
}

const UPTIME_TYPES = new Set(['HTTP', 'TCP', 'SSL_CERT', 'HEARTBEAT']);

function formatMinutes(min: number): string {
  if (min < 1) return `${Math.round(min * 60)}s`;
  if (min < 60) return `${min.toFixed(1)}m`;
  if (min < 1440) return `${(min / 60).toFixed(1)}h`;
  return `${(min / 1440).toFixed(1)}d`;
}

function budgetStatusBadgeVariant(status: ErrorBudget['status']): 'success' | 'warning' | 'danger' | 'default' {
  if (status === 'healthy') return 'success';
  if (status === 'warning') return 'warning';
  if (status === 'critical' || status === 'exhausted') return 'danger';
  return 'default';
}

function budgetBarColor(status: ErrorBudget['status']): string {
  if (status === 'healthy') return 'bg-success';
  if (status === 'warning') return 'bg-warning';
  return 'bg-danger';
}

function formatDuration(sec: number): string {
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
  return `${Math.floor(sec / 86400)}d ${Math.floor((sec % 86400) / 3600)}h`;
}

function uptimeBadgeVariant(pct: number | null): 'success' | 'warning' | 'danger' | 'default' {
  if (pct === null) return 'default';
  if (pct >= 99) return 'success';
  if (pct >= 95) return 'warning';
  return 'danger';
}

function statusBadgeVariant(status: string): 'success' | 'warning' | 'danger' | 'default' {
  if (status === 'UP' || status === 'OK') return 'success';
  if (status === 'DEGRADED') return 'warning';
  if (status === 'DOWN' || status === 'ERROR') return 'danger';
  return 'default';
}

interface ScheduledReportConfig {
  id: string;
  enabled: boolean;
  frequency: 'daily' | 'weekly';
  dayOfWeek: number;
  hourUtc: number;
  lastSentAt: string | null;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function ReportsPage() {
  const router = useRouter();
  const toastCtx = useToast();
  const [period, setPeriod] = useState<Period>('30d');
  const [rows, setRows] = useState<MonitorRow[]>([]);
  const [errorBudgetRows, setErrorBudgetRows] = useState<ErrorBudgetRow[]>([]);
  const [loadingMonitors, setLoadingMonitors] = useState(true);
  const [exporting, setExporting] = useState(false);
  const tableRef = useRef<HTMLDivElement>(null);

  // Scheduled report state
  const [reportConfig, setReportConfig] = useState<ScheduledReportConfig | null>(null);
  const [reportLoading, setReportLoading] = useState(true);
  const [reportSaving, setReportSaving] = useState(false);
  const [reportSendingNow, setReportSendingNow] = useState(false);
  const [reportForm, setReportForm] = useState<{ enabled: boolean; frequency: 'daily' | 'weekly'; dayOfWeek: number; hourUtc: number }>({
    enabled: true,
    frequency: 'weekly',
    dayOfWeek: 1,
    hourUtc: 8,
  });

  useEffect(() => {
    const u = getUser();
    if (!u) router.replace('/login');
  }, [router]);

  // Load scheduled report config
  useEffect(() => {
    const u = getUser();
    if (!u) return;
    setReportLoading(true);
    api<ScheduledReportConfig | null>('/v1/reports', u.id)
      .then((cfg) => {
        setReportConfig(cfg ?? null);
        if (cfg) {
          setReportForm({
            enabled: cfg.enabled,
            frequency: cfg.frequency as 'daily' | 'weekly',
            dayOfWeek: cfg.dayOfWeek,
            hourUtc: cfg.hourUtc,
          });
        }
      })
      .catch(() => setReportConfig(null))
      .finally(() => setReportLoading(false));
  }, []);

  async function handleSaveReport() {
    const u = getUser();
    if (!u) return;
    setReportSaving(true);
    try {
      const cfg = await api<ScheduledReportConfig>('/v1/reports', u.id, {
        method: 'PUT',
        body: JSON.stringify(reportForm),
      });
      setReportConfig(cfg);
      toastCtx.success('Report schedule saved');
    } catch {
      toastCtx.error('Failed to save report schedule');
    } finally {
      setReportSaving(false);
    }
  }

  async function handleDeleteReport() {
    const u = getUser();
    if (!u) return;
    if (!confirm('Disable scheduled reports? Your config will be deleted.')) return;
    setReportSaving(true);
    try {
      await api('/v1/reports', u.id, { method: 'DELETE' });
      setReportConfig(null);
      setReportForm({ enabled: true, frequency: 'weekly', dayOfWeek: 1, hourUtc: 8 });
      toastCtx.success('Scheduled reports disabled');
    } catch {
      toastCtx.error('Failed to delete report schedule');
    } finally {
      setReportSaving(false);
    }
  }

  async function handleSendNow() {
    const u = getUser();
    if (!u) return;
    setReportSendingNow(true);
    try {
      await api('/v1/reports/send-now', u.id, { method: 'POST' });
      toastCtx.success('Test report sent to your email');
    } catch {
      toastCtx.error('Failed to send test report');
    } finally {
      setReportSendingNow(false);
    }
  }

  async function fetchData(p: Period) {
    setLoadingMonitors(true);
    try {
      const monitors = await api<Monitor[]>('/v1/monitors');
      const uptimeMonitors = monitors.filter((m) => UPTIME_TYPES.has(m.type));

      // Initialize rows
      const initial: MonitorRow[] = uptimeMonitors.map((m) => ({
        monitor: m,
        stats: null,
        loading: true,
        error: false,
      }));
      setRows(initial);
      setLoadingMonitors(false);

      // Fetch uptime stats for each monitor
      const updated = await Promise.all(
        uptimeMonitors.map(async (m) => {
          try {
            const stats = await api<UptimeStats>(`/v1/monitors/${m.id}/uptime?period=${p}`);
            return { monitor: m, stats, loading: false, error: false };
          } catch {
            return { monitor: m, stats: null, loading: false, error: true };
          }
        })
      );
      setRows(updated);

      // Fetch error budgets for uptime monitors
      const budgetInitial: ErrorBudgetRow[] = uptimeMonitors.map((m) => ({
        monitor: m,
        budget: null,
        loading: true,
        error: false,
      }));
      setErrorBudgetRows(budgetInitial);
      const budgetUpdated = await Promise.all(
        uptimeMonitors.map(async (m) => {
          const slaTarget = m.slaTarget ?? 99.9;
          try {
            const budget = await api<ErrorBudget>(`/v1/monitors/${m.id}/error-budget?slaTarget=${slaTarget}&period=${p}`);
            return { monitor: m, budget, loading: false, error: false };
          } catch {
            return { monitor: m, budget: null, loading: false, error: true };
          }
        })
      );
      setErrorBudgetRows(budgetUpdated);
    } catch {
      toastCtx.error('Failed to load monitors');
      setLoadingMonitors(false);
    }
  }

  useEffect(() => {
    fetchData(period);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  const readyRows = rows.filter((r) => !r.loading && !r.error && r.stats);

  // Overall uptime: weighted average by totalChecks
  const totalChecksAll = readyRows.reduce((s, r) => s + (r.stats?.totalChecks ?? 0), 0);
  const overallUptime =
    totalChecksAll > 0
      ? readyRows.reduce((s, r) => s + (r.stats?.uptimePct ?? 0) * (r.stats?.totalChecks ?? 0), 0) / totalChecksAll
      : null;

  const totalIncidents = readyRows.reduce((s, r) => s + (r.stats?.incidents ?? 0), 0);

  // Top incidents across all monitors
  const allIncidents = readyRows
    .flatMap((r) =>
      (r.stats?.incidentList ?? []).map((inc) => ({
        ...inc,
        monitorName: r.monitor.name,
        monitorType: r.monitor.type,
      }))
    )
    .sort((a, b) => b.durationSec - a.durationSec)
    .slice(0, 10);

  function handleExportCSV() {
    const csvRows = readyRows.map((r) => ({
      Monitor: r.monitor.name,
      Type: r.monitor.type,
      Status: r.monitor.status,
      'Uptime%': r.stats?.uptimePct?.toFixed(2) ?? '',
      DowntimeEvents: r.stats?.incidents ?? 0,
      'AvgResponseMs': r.stats?.avgLatencyMs ?? '',
      TotalChecks: r.stats?.totalChecks ?? 0,
      FailedChecks: r.stats?.failedChecks ?? 0,
      'TotalDowntime': r.stats ? formatDuration(r.stats.totalDowntimeSec) : '',
      'MTTR': r.stats ? formatDuration(r.stats.mttrSec) : '',
    }));
    exportCSV(`pulsedock-report-${period}-${new Date().toISOString().slice(0, 10)}.csv`, csvRows);
  }

  async function handleExportPDF() {
    if (!tableRef.current) return;
    setExporting(true);
    try {
      const [html2canvasModule, jsPDFModule] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ]);
      const html2canvas = html2canvasModule.default;
      const { jsPDF } = jsPDFModule;

      const canvas = await html2canvas(tableRef.current, {
        backgroundColor: '#0a0a0f',
        scale: 1.5,
        useCORS: true,
        allowTaint: false,
        logging: false,
        ignoreElements: (el) =>
          el.classList.contains('no-print') ||
          el.getAttribute('data-html2canvas-ignore') === 'true',
      });

      const imgData = canvas.toDataURL('image/png');
      const imgWidth = canvas.width;
      const imgHeight = canvas.height;
      const pdfWidth = 297; // A4 landscape
      const pdfHeight = (imgHeight * pdfWidth) / imgWidth;

      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4',
        compress: true,
      });

      const pageHeightMM = pdf.internal.pageSize.getHeight();
      const totalPages = Math.ceil(pdfHeight / pageHeightMM);

      for (let i = 0; i < totalPages; i++) {
        if (i > 0) pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, -i * pageHeightMM, pdfWidth, pdfHeight);
      }

      pdf.save(`pulsedock-report-${period}-${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (_err) {
      toastCtx.error('PDF export failed');
    } finally {
      setExporting(false);
    }
  }

  const periodLabel: Record<Period, string> = {
    '7d': 'Last 7 days',
    '30d': 'Last 30 days',
    '90d': 'Last 90 days',
  };

  return (
    <AppFrame
      title="Reports"
      subtitle={`Uptime report — ${periodLabel[period]}`}
      breadcrumbs={[{ label: 'Reports' }]}
    >
      <FadeIn>
        {/* ── Toolbar ─────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6" data-html2canvas-ignore="true">
          {/* Period selector */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-text-muted">Period:</span>
            <div className="flex gap-1 rounded-lg border border-border bg-surface p-1">
              {(['7d', '30d', '90d'] as Period[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                    period === p
                      ? 'bg-accent text-bg'
                      : 'text-text-secondary hover:text-text-primary'
                  }`}
                >
                  {p === '7d' ? '7 days' : p === '30d' ? '30 days' : '90 days'}
                </button>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchData(period)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface/60 px-3 py-1.5 text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh
            </button>
            <button
              onClick={handleExportCSV}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface/60 px-3 py-1.5 text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              CSV
            </button>
            <button
              onClick={handleExportPDF}
              disabled={exporting}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface/60 px-3 py-1.5 text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FileText className="w-3.5 h-3.5" />
              {exporting ? 'Generating…' : 'PDF'}
            </button>
          </div>
        </div>

        {/* ── Summary cards ────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card className="flex flex-col gap-1">
            <div className="text-xs text-text-muted uppercase tracking-wide">Monitors</div>
            <div className="text-3xl font-bold text-text-primary">
              {loadingMonitors ? '—' : rows.length}
            </div>
            <div className="text-xs text-text-muted">Uptime monitors</div>
          </Card>
          <Card className="flex flex-col gap-1">
            <div className="text-xs text-text-muted uppercase tracking-wide">Overall Uptime</div>
            <div
              className={`text-3xl font-bold ${
                overallUptime === null
                  ? 'text-text-muted'
                  : overallUptime >= 99
                  ? 'text-success'
                  : overallUptime >= 95
                  ? 'text-warning'
                  : 'text-danger'
              }`}
            >
              {overallUptime === null ? '—' : `${overallUptime.toFixed(2)}%`}
            </div>
            <div className="text-xs text-text-muted">{periodLabel[period]}</div>
          </Card>
          <Card className="flex flex-col gap-1">
            <div className="text-xs text-text-muted uppercase tracking-wide">Total Checks</div>
            <div className="text-3xl font-bold text-text-primary">
              {totalChecksAll.toLocaleString()}
            </div>
            <div className="text-xs text-text-muted">Across all monitors</div>
          </Card>
          <Card className="flex flex-col gap-1">
            <div className="text-xs text-text-muted uppercase tracking-wide">Incidents</div>
            <div
              className={`text-3xl font-bold ${totalIncidents > 0 ? 'text-danger' : 'text-success'}`}
            >
              {totalIncidents}
            </div>
            <div className="text-xs text-text-muted">Downtime events</div>
          </Card>
        </div>

        {/* ── Error Budgets ────────────────────────────────────────────── */}
        {errorBudgetRows.length > 0 && (
          <Card className="mb-6">
            <div className="flex items-center gap-2 mb-4">
              <Gauge className="w-4 h-4 text-accent" />
              <h2 className="text-sm font-semibold text-text-primary">Error Budgets</h2>
              <span className="text-xs text-text-muted ml-auto">SLO budget consumption {periodLabel[period]}</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {errorBudgetRows.map((row) => (
                <div
                  key={row.monitor.id}
                  className="rounded-lg border border-border bg-surface/40 p-4 flex flex-col gap-3"
                >
                  {/* Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium text-text-primary text-sm truncate">{row.monitor.name}</div>
                      <div className="text-xs text-text-muted mt-0.5">SLA target: {row.budget?.slaTarget ?? (row.monitor.slaTarget ?? 99.9)}%</div>
                    </div>
                    {row.loading ? (
                      <span className="text-xs text-text-muted shrink-0">Loading…</span>
                    ) : row.error ? (
                      <Badge variant="default">N/A</Badge>
                    ) : row.budget ? (
                      <Badge variant={budgetStatusBadgeVariant(row.budget.status)}>
                        {row.budget.status}
                      </Badge>
                    ) : null}
                  </div>

                  {/* Progress bar */}
                  {!row.loading && !row.error && row.budget && (
                    <>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-text-muted">Budget consumed</span>
                          <span className="text-xs font-medium text-text-secondary">
                            {row.budget.budgetConsumedPct.toFixed(1)}%
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-surface-elevated overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${budgetBarColor(row.budget.status)}`}
                            style={{ width: `${Math.min(100, row.budget.budgetConsumedPct)}%` }}
                          />
                        </div>
                      </div>

                      {/* Stats grid */}
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-text-muted">Remaining</span>
                          <span className="text-text-secondary font-medium">
                            {formatMinutes(row.budget.remainingDownMinutes)}
                          </span>
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-text-muted">Actual uptime</span>
                          <span className="text-text-secondary font-medium">
                            {row.budget.actualUptimePct.toFixed(3)}%
                          </span>
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-text-muted flex items-center gap-1">
                            <Flame className="w-3 h-3" /> Burn rate
                          </span>
                          <span
                            className={`font-medium ${
                              row.budget.burnRate24h > 2
                                ? 'text-danger'
                                : row.budget.burnRate24h > 1
                                ? 'text-warning'
                                : 'text-success'
                            }`}
                          >
                            {row.budget.burnRate24h.toFixed(2)}×
                          </span>
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-text-muted flex items-center gap-1">
                            <TrendingDown className="w-3 h-3" /> Exhaustion
                          </span>
                          <span className={`font-medium ${row.budget.projectedExhaustionDate ? 'text-warning' : 'text-success'}`}>
                            {row.budget.projectedExhaustionDate
                              ? new Date(row.budget.projectedExhaustionDate).toLocaleDateString()
                              : 'On track'}
                          </span>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* ── Per-monitor table ────────────────────────────────────────── */}
        <div ref={tableRef}>
          <Card className="mb-6">
            <div className="flex items-center gap-2 mb-4">
              <Activity className="w-4 h-4 text-accent" />
              <h2 className="text-sm font-semibold text-text-primary">Per-Monitor Uptime</h2>
              <span className="text-xs text-text-muted ml-auto">{periodLabel[period]}</span>
            </div>

            {loadingMonitors ? (
              <div className="text-center text-text-muted text-sm py-8">
                Loading monitors…
              </div>
            ) : rows.length === 0 ? (
              <div className="text-center text-text-muted text-sm py-8">
                No uptime monitors found. Add HTTP, TCP, SSL, or Heartbeat monitors to see reports.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableHeader>Monitor</TableHeader>
                      <TableHeader>Type</TableHeader>
                      <TableHeader>Status</TableHeader>
                      <TableHeader>Uptime %</TableHeader>
                      <TableHeader>Checks</TableHeader>
                      <TableHeader>Incidents</TableHeader>
                      <TableHeader>Downtime</TableHeader>
                      <TableHeader>Avg Response</TableHeader>
                      <TableHeader>MTTR</TableHeader>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {rows.map((row) => (
                      <TableRow key={row.monitor.id}>
                        <TableCell>
                          <div className="font-medium text-text-primary text-sm">{row.monitor.name}</div>
                          {row.monitor.target && (
                            <div className="text-xs text-text-muted truncate max-w-[200px]">{row.monitor.target}</div>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="text-xs font-mono text-text-secondary">{row.monitor.type}</span>
                        </TableCell>
                        <TableCell>
                          {row.monitor.enabled ? (
                            <Badge variant={statusBadgeVariant(row.monitor.status)}>
                              {row.monitor.status || 'UNKNOWN'}
                            </Badge>
                          ) : (
                            <Badge variant="default">PAUSED</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {row.loading ? (
                            <span className="text-text-muted text-xs">Loading…</span>
                          ) : row.error ? (
                            <span className="text-danger text-xs">Error</span>
                          ) : (
                            <Badge variant={uptimeBadgeVariant(row.stats?.uptimePct ?? null)}>
                              {`${row.stats?.uptimePct?.toFixed(2) ?? '—'}%`}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-text-secondary">
                            {row.loading ? '—' : (row.stats?.totalChecks ?? 0).toLocaleString()}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span
                            className={`text-sm font-medium ${
                              (row.stats?.incidents ?? 0) > 0 ? 'text-danger' : 'text-success'
                            }`}
                          >
                            {row.loading ? '—' : row.stats?.incidents ?? 0}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-text-secondary">
                            {row.loading || !row.stats
                              ? '—'
                              : row.stats.totalDowntimeSec > 0
                              ? formatDuration(row.stats.totalDowntimeSec)
                              : <span className="text-success text-xs">None</span>}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-text-secondary">
                            {row.loading ? '—' : row.stats?.avgLatencyMs != null ? `${row.stats.avgLatencyMs}ms` : '—'}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-text-secondary">
                            {row.loading || !row.stats
                              ? '—'
                              : row.stats.mttrSec > 0
                              ? formatDuration(row.stats.mttrSec)
                              : '—'}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Card>

          {/* ── Top incidents ─────────────────────────────────────────── */}
          {allIncidents.length > 0 && (
            <Card>
              <div className="flex items-center gap-2 mb-4">
                <XCircle className="w-4 h-4 text-danger" />
                <h2 className="text-sm font-semibold text-text-primary">Top Incidents</h2>
                <span className="text-xs text-text-muted ml-auto">Sorted by duration</span>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableHeader>Monitor</TableHeader>
                      <TableHeader>Started</TableHeader>
                      <TableHeader>Ended</TableHeader>
                      <TableHeader>Duration</TableHeader>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {allIncidents.map((inc, i) => (
                      <TableRow key={i}>
                        <TableCell>
                          <div className="font-medium text-text-primary text-sm">{inc.monitorName}</div>
                          <div className="text-xs text-text-muted">{inc.monitorType}</div>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-text-secondary">
                            {new Date(inc.start).toLocaleString()}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-text-secondary">
                            {new Date(inc.end).toLocaleString()}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm font-medium text-danger">
                            {formatDuration(inc.durationSec)}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>
          )}
        </div>

        {/* ── Scheduled Email Reports ───────────────────────────────── */}
        <Card className="mt-6">
          <div className="flex items-center gap-2 mb-5">
            <Mail className="w-4 h-4 text-accent" />
            <h2 className="text-sm font-semibold text-text-primary">Scheduled Email Reports</h2>
            {reportConfig?.lastSentAt && (
              <span className="ml-auto text-xs text-text-muted">
                Last sent: {new Date(reportConfig.lastSentAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
            )}
          </div>

          {reportLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-5 h-5 rounded-full border-2 border-accent border-t-transparent animate-spin" />
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-text-secondary">
                Receive an automated uptime digest email with your fleet health summary — uptime stats, top outages, SLA compliance, and monitors needing attention.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Frequency */}
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1.5">Frequency</label>
                  <select
                    value={reportForm.frequency}
                    onChange={(e) => setReportForm((f) => ({ ...f, frequency: e.target.value as 'daily' | 'weekly' }))}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-border bg-surface text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                  </select>
                </div>

                {/* Day of week (weekly only) */}
                {reportForm.frequency === 'weekly' && (
                  <div>
                    <label className="block text-xs font-medium text-text-secondary mb-1.5">Day of week</label>
                    <select
                      value={reportForm.dayOfWeek}
                      onChange={(e) => setReportForm((f) => ({ ...f, dayOfWeek: Number(e.target.value) }))}
                      className="w-full px-3 py-2 text-sm rounded-xl border border-border bg-surface text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
                    >
                      {DAY_NAMES.map((d, i) => (
                        <option key={i} value={i}>{d}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Hour */}
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1.5">Send time (UTC)</label>
                  <select
                    value={reportForm.hourUtc}
                    onChange={(e) => setReportForm((f) => ({ ...f, hourUtc: Number(e.target.value) }))}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-border bg-surface text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
                  >
                    {Array.from({ length: 24 }, (_, h) => (
                      <option key={h} value={h}>{String(h).padStart(2, '0')}:00 UTC</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Schedule summary */}
              <div className="text-xs text-text-muted p-3 rounded-lg bg-surface-elevated/40 border border-border">
                {reportForm.frequency === 'weekly'
                  ? `📅 Sends every ${DAY_NAMES[reportForm.dayOfWeek]} at ${String(reportForm.hourUtc).padStart(2, '0')}:00 UTC — covers the previous 7 days.`
                  : `📅 Sends daily at ${String(reportForm.hourUtc).padStart(2, '0')}:00 UTC — covers the previous 24 hours.`}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 flex-wrap pt-1">
                <button
                  onClick={handleSaveReport}
                  disabled={reportSaving}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium bg-accent text-white hover:bg-accent/90 disabled:opacity-50 transition-colors"
                >
                  {reportSaving ? 'Saving…' : reportConfig ? '✓ Update Schedule' : '+ Enable Scheduled Reports'}
                </button>
                <button
                  onClick={handleSendNow}
                  disabled={reportSendingNow}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium border border-border text-text-secondary hover:text-text-primary hover:border-accent/40 disabled:opacity-50 transition-colors"
                >
                  <Send className="w-3.5 h-3.5" />
                  {reportSendingNow ? 'Sending…' : 'Send Test Email Now'}
                </button>
                {reportConfig && (
                  <button
                    onClick={handleDeleteReport}
                    disabled={reportSaving}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium border border-danger/30 text-danger/70 hover:text-danger hover:border-danger/60 disabled:opacity-50 transition-colors"
                  >
                    Disable
                  </button>
                )}
              </div>

              {reportConfig && (
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-success/5 border border-success/20 text-xs text-success">
                  <span>✓</span>
                  <span>Scheduled reports active — {reportForm.frequency === 'weekly' ? `every ${DAY_NAMES[reportConfig.dayOfWeek]} at ${String(reportConfig.hourUtc).padStart(2, '0')}:00 UTC` : `daily at ${String(reportConfig.hourUtc).padStart(2, '0')}:00 UTC`}</span>
                </div>
              )}
            </div>
          )}
        </Card>
      </FadeIn>
    </AppFrame>
  );
}

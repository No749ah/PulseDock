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

export default function ReportsPage() {
  const router = useRouter();
  const toastCtx = useToast();
  const [period, setPeriod] = useState<Period>('30d');
  const [rows, setRows] = useState<MonitorRow[]>([]);
  const [loadingMonitors, setLoadingMonitors] = useState(true);
  const [exporting, setExporting] = useState(false);
  const tableRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const u = getUser();
    if (!u) router.replace('/login');
  }, [router]);

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
    } catch (err) {
      console.error('PDF export failed:', err);
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
      </FadeIn>
    </AppFrame>
  );
}

'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Circle,
  RefreshCw,
  Activity,
  Globe,
  Monitor,
  Server,
  Cpu,
  ChevronUp,
  ChevronDown,
  Edit2,
  X,
  Check,
  FileDown,
} from 'lucide-react';
import { AppFrame } from '../../../components/app-frame';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Table, TableHead, TableBody, TableRow, TableCell } from '../../components/Table';
import { getUser } from '../../../components/auth';
import { api } from '../../../lib/api';
import { useToast } from '../../../components/ui/toast';

// ─── Types ────────────────────────────────────────────────────────────────────

type MonthlyHistory = {
  month: string; // "2026-01"
  uptimePct: number;
  compliant: boolean | null;
};

type SlaMonitor = {
  id: string;
  name: string;
  type: string;
  folder: string | null;
  slaTarget: number | null;
  uptimePct: number;
  compliant: boolean | null;
  errorBudgetUsedPct: number | null;
  budgetRemainingPct: number | null;
  totalRuns: number;
  failedRuns: number;
  monthlyHistory: MonthlyHistory[];
};

type SlaDashboard = {
  generatedAt: string;
  period: { start: string; end: string };
  summary: {
    totalMonitors: number;
    compliant: number;
    atRisk: number;
    breached: number;
    noTarget: number;
    currentMonth: string;
  };
  monitors: SlaMonitor[];
};

type SortKey = 'name' | 'uptimePct' | 'errorBudgetUsedPct' | 'compliant';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SLA_PRESETS = [99.0, 99.5, 99.9, 99.95, 99.99];

function monitorTypeIcon(type: string) {
  switch (type?.toUpperCase()) {
    case 'HTTP': return <Globe className="w-4 h-4 text-blue-400 shrink-0" />;
    case 'TCP': return <Server className="w-4 h-4 text-purple-400 shrink-0" />;
    case 'DNS': return <Activity className="w-4 h-4 text-cyan-400 shrink-0" />;
    case 'PING': return <Cpu className="w-4 h-4 text-orange-400 shrink-0" />;
    default: return <Monitor className="w-4 h-4 text-zinc-400 shrink-0" />;
  }
}

function complianceStatus(m: SlaMonitor): 'compliant' | 'atRisk' | 'breached' | 'noTarget' {
  if (m.slaTarget == null) return 'noTarget';
  if (m.compliant === false) return 'breached';
  if (m.compliant === true && m.uptimePct - m.slaTarget < 0.1) return 'atRisk';
  return 'compliant';
}

function UptimeColor({ m }: { m: SlaMonitor }) {
  const status = complianceStatus(m);
  const cls =
    status === 'compliant' ? 'text-green-400' :
    status === 'atRisk' ? 'text-yellow-400' :
    status === 'breached' ? 'text-red-400' :
    'text-zinc-400';
  return <span className={`font-mono font-semibold ${cls}`}>{m.uptimePct.toFixed(4)}%</span>;
}

function BudgetBar({ used }: { used: number | null }) {
  if (used == null) return <span className="text-zinc-500 text-sm">—</span>;
  const color = used >= 90 ? 'bg-red-500' : used >= 50 ? 'bg-yellow-500' : 'bg-green-500';
  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <div className="flex-1 bg-surface-elevated rounded-full h-2 overflow-hidden">
        <div className={`h-2 rounded-full transition-all ${color}`} style={{ width: `${Math.min(100, used)}%` }} />
      </div>
      <span className="text-xs font-mono text-zinc-300 w-12 text-right">{used.toFixed(1)}%</span>
    </div>
  );
}

function MonthBadge({ h }: { h: MonthlyHistory }) {
  const monthLabel = h.month.slice(5); // "01", "02"
  const color =
    h.compliant === null ? 'bg-zinc-700 text-zinc-400' :
    h.compliant ? 'bg-green-900/50 text-green-400 border border-green-700/50' :
    'bg-red-900/50 text-red-400 border border-red-700/50';
  return (
    <span className={`inline-flex flex-col items-center px-2 py-1 rounded text-[10px] font-mono ${color}`}>
      <span className="font-bold">{monthLabel}</span>
      <span>{h.uptimePct.toFixed(2)}%</span>
    </span>
  );
}

function SlaTargetPill({
  monitor,
  onSave,
}: {
  monitor: SlaMonitor;
  onSave: (id: string, value: number) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [preset, setPreset] = useState<number | 'custom'>(monitor.slaTarget ?? 99.9);
  const [customValue, setCustomValue] = useState<string>(monitor.slaTarget?.toFixed(2) ?? '99.90');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const value = preset === 'custom' ? parseFloat(customValue) : preset;
    if (isNaN(value) || value < 0.1 || value > 100) return;
    setSaving(true);
    try {
      await onSave(monitor.id, value);
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-mono transition-colors ${
          monitor.slaTarget != null
            ? 'bg-blue-900/40 text-blue-300 border border-blue-700/40 hover:bg-blue-900/70'
            : 'bg-zinc-800 text-zinc-400 border border-zinc-700 hover:bg-zinc-700'
        }`}
      >
        <Edit2 className="w-3 h-3" />
        {monitor.slaTarget != null ? `${monitor.slaTarget}%` : 'Set Target'}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 p-3 bg-surface-elevated border border-zinc-700 rounded-lg shadow-xl z-10 w-52">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-zinc-300">SLA Target</span>
        <button onClick={() => setOpen(false)} className="text-zinc-500 hover:text-zinc-300">
          <X className="w-3 h-3" />
        </button>
      </div>
      <div className="flex flex-wrap gap-1">
        {SLA_PRESETS.map((p) => (
          <button
            key={p}
            onClick={() => setPreset(p)}
            className={`px-2 py-1 rounded text-xs font-mono transition-colors ${
              preset === p ? 'bg-accent text-white' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
            }`}
          >
            {p}%
          </button>
        ))}
        <button
          onClick={() => setPreset('custom')}
          className={`px-2 py-1 rounded text-xs transition-colors ${
            preset === 'custom' ? 'bg-accent text-white' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
          }`}
        >
          Custom
        </button>
      </div>
      {preset === 'custom' && (
        <input
          type="number"
          min={0.1}
          max={100}
          step={0.01}
          value={customValue}
          onChange={(e) => setCustomValue(e.target.value)}
          className="w-full px-2 py-1 rounded bg-zinc-900 border border-zinc-700 text-xs font-mono text-zinc-100 focus:outline-none focus:border-accent"
          placeholder="e.g. 99.95"
        />
      )}
      <Button size="sm" onClick={handleSave} disabled={saving} className="w-full">
        {saving ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
        Save
      </Button>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

// ─── Compliance Report Types ──────────────────────────────────────────────────

type ComplianceMonthly = {
  month: string;
  totalChecks: number;
  failedChecks: number;
  uptimePct: number | null;
  downtimeMinutes: number;
  incidents: number;
  compliant: boolean | null;
  errorBudgetUsedPct: number | null;
};

type ComplianceMonitor = {
  id: string;
  name: string;
  type: string;
  target: string;
  description: string | null;
  slaTarget: number;
  period: {
    totalChecks: number;
    failedChecks: number;
    uptimePct: number | null;
    downtimeMinutes: number;
    incidents: number;
    compliant: boolean | null;
    errorBudgetUsedPct: number | null;
  };
  monthlyBreakdown: ComplianceMonthly[];
};

type ComplianceReport = {
  generatedAt: string;
  reportPeriod: {
    start: string;
    end: string;
    months: number;
    monthLabels: string[];
  };
  summary: {
    totalMonitors: number;
    compliant: number;
    breached: number;
    noData: number;
    fleetUptimePct: number | null;
    complianceRate: number | null;
  };
  monitors: ComplianceMonitor[];
};

// ─── Report HTML generator ───────────────────────────────────────────────────

function generateReportHtml(report: ComplianceReport): string {
  const fmt = (pct: number | null) => pct !== null ? `${pct.toFixed(4)}%` : 'N/A';
  const fmtSimple = (pct: number | null) => pct !== null ? `${pct.toFixed(2)}%` : '—';
  const statusColor = (compliant: boolean | null) => compliant === true ? '#22c55e' : compliant === false ? '#ef4444' : '#6b7280';
  const statusLabel = (compliant: boolean | null) => compliant === true ? '✓ COMPLIANT' : compliant === false ? '✗ BREACHED' : '— NO DATA';

  const monitorRows = report.monitors.map(m => `
    <div class="monitor-card">
      <div class="monitor-header">
        <div>
          <span class="monitor-name">${m.name}</span>
          <span class="monitor-type">${m.type}</span>
          ${m.description ? `<div class="monitor-desc">${m.description}</div>` : ''}
          <div class="monitor-target">Endpoint: ${m.target}</div>
        </div>
        <div class="monitor-status" style="color:${statusColor(m.period.compliant)}">
          ${statusLabel(m.period.compliant)}
        </div>
      </div>
      <div class="period-stats">
        <div class="stat"><div class="stat-value">${fmt(m.period.uptimePct)}</div><div class="stat-label">Uptime</div></div>
        <div class="stat"><div class="stat-value" style="color:${m.slaTarget ? '#6366f1' : '#6b7280'}">${m.slaTarget ? `${m.slaTarget}%` : '—'}</div><div class="stat-label">SLA Target</div></div>
        <div class="stat"><div class="stat-value">${m.period.downtimeMinutes}m</div><div class="stat-label">Est. Downtime</div></div>
        <div class="stat"><div class="stat-value">${m.period.incidents}</div><div class="stat-label">Incidents</div></div>
        <div class="stat"><div class="stat-value">${m.period.totalChecks.toLocaleString()}</div><div class="stat-label">Total Checks</div></div>
        <div class="stat"><div class="stat-value">${m.period.errorBudgetUsedPct !== null ? `${m.period.errorBudgetUsedPct.toFixed(1)}%` : '—'}</div><div class="stat-label">Error Budget Used</div></div>
      </div>
      <table class="monthly-table">
        <thead>
          <tr>
            <th>Month</th>
            <th>Uptime</th>
            <th>vs Target</th>
            <th>Checks</th>
            <th>Failed</th>
            <th>Downtime</th>
            <th>Incidents</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${m.monthlyBreakdown.map(mb => `
          <tr class="${mb.compliant === false ? 'row-breach' : mb.compliant === true ? 'row-ok' : ''}">
            <td>${mb.month}</td>
            <td>${fmt(mb.uptimePct)}</td>
            <td>${mb.uptimePct !== null && m.slaTarget ? (mb.uptimePct >= m.slaTarget ? `+${(mb.uptimePct - m.slaTarget).toFixed(4)}%` : `${(mb.uptimePct - m.slaTarget).toFixed(4)}%`) : '—'}</td>
            <td>${mb.totalChecks.toLocaleString()}</td>
            <td>${mb.failedChecks}</td>
            <td>${mb.downtimeMinutes}m</td>
            <td>${mb.incidents}</td>
            <td style="color:${statusColor(mb.compliant)};font-weight:600">${statusLabel(mb.compliant)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
  `).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>SLA Compliance Report — PulseDock</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #fff; color: #111; padding: 32px; max-width: 1100px; margin: 0 auto; }
  h1 { font-size: 28px; font-weight: 700; color: #111; }
  h2 { font-size: 14px; font-weight: 500; color: #555; margin-top: 4px; }
  .report-meta { font-size: 12px; color: #888; margin-top: 4px; }
  .brand { display: flex; align-items: center; gap: 12px; margin-bottom: 28px; padding-bottom: 20px; border-bottom: 2px solid #e5e7eb; }
  .brand-logo { font-size: 24px; font-weight: 800; color: #6366f1; }
  .summary-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 12px; margin: 24px 0; }
  .summary-card { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px; text-align: center; }
  .summary-value { font-size: 24px; font-weight: 700; color: #111; }
  .summary-label { font-size: 11px; color: #888; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.05em; }
  .section-title { font-size: 16px; font-weight: 600; color: #111; margin: 28px 0 12px; padding-bottom: 6px; border-bottom: 1px solid #e5e7eb; }
  .monitor-card { background: #fafafa; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin-bottom: 16px; page-break-inside: avoid; }
  .monitor-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; }
  .monitor-name { font-size: 15px; font-weight: 600; color: #111; }
  .monitor-type { font-size: 11px; background: #f3f4f6; color: #555; padding: 2px 6px; border-radius: 4px; margin-left: 8px; }
  .monitor-desc { font-size: 12px; color: #666; margin-top: 4px; }
  .monitor-target { font-size: 11px; color: #888; margin-top: 2px; }
  .monitor-status { font-size: 13px; font-weight: 700; text-align: right; }
  .period-stats { display: grid; grid-template-columns: repeat(6, 1fr); gap: 10px; margin-bottom: 12px; }
  .stat { background: #fff; border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px; text-align: center; }
  .stat-value { font-size: 16px; font-weight: 700; color: #111; }
  .stat-label { font-size: 10px; color: #888; margin-top: 2px; text-transform: uppercase; }
  .monthly-table { width: 100%; border-collapse: collapse; font-size: 12px; }
  .monthly-table th { background: #f3f4f6; text-align: left; padding: 8px 10px; font-weight: 600; color: #444; border-bottom: 1px solid #e5e7eb; }
  .monthly-table td { padding: 7px 10px; border-bottom: 1px solid #f0f0f0; }
  .row-breach td { background: #fef2f2; }
  .row-ok td { background: #f0fdf4; }
  .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #aaa; display: flex; justify-content: space-between; }
  @media print {
    body { padding: 16px; }
    .monitor-card { page-break-inside: avoid; }
  }
</style>
</head>
<body>
<div class="brand">
  <div class="brand-logo">⚡ PulseDock</div>
  <div>
    <h1>SLA Compliance Report</h1>
    <h2>Report Period: ${report.reportPeriod.monthLabels[0]} – ${report.reportPeriod.monthLabels[report.reportPeriod.monthLabels.length - 1]} (${report.reportPeriod.months} month${report.reportPeriod.months > 1 ? 's' : ''})</h2>
    <div class="report-meta">Generated: ${new Date(report.generatedAt).toLocaleString()} · Monitors with SLA targets: ${report.summary.totalMonitors}</div>
  </div>
</div>

<div class="summary-grid">
  <div class="summary-card"><div class="summary-value">${report.summary.totalMonitors}</div><div class="summary-label">Monitors</div></div>
  <div class="summary-card"><div class="summary-value" style="color:#22c55e">${report.summary.compliant}</div><div class="summary-label">Compliant</div></div>
  <div class="summary-card"><div class="summary-value" style="color:#ef4444">${report.summary.breached}</div><div class="summary-label">Breached</div></div>
  <div class="summary-card"><div class="summary-value" style="color:#6366f1">${fmtSimple(report.summary.complianceRate)}</div><div class="summary-label">Compliance Rate</div></div>
  <div class="summary-card"><div class="summary-value">${fmt(report.summary.fleetUptimePct)}</div><div class="summary-label">Fleet Uptime</div></div>
  <div class="summary-card"><div class="summary-value">${report.summary.noData}</div><div class="summary-label">No Data</div></div>
</div>

<div class="section-title">Per-Monitor Compliance Details</div>
${monitorRows || '<p style="color:#888;font-size:13px">No monitors with SLA targets found.</p>'}

<div class="footer">
  <span>PulseDock SLA Compliance Report</span>
  <span>Confidential · Generated ${new Date(report.generatedAt).toISOString()}</span>
</div>
</body>
</html>`;
}

export default function SlaPage() {
  const [data, setData] = useState<SlaDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [reportMonths, setReportMonths] = useState(3);
  const [reportLoading, setReportLoading] = useState(false);
  const { success: showSuccess, error: showError } = useToast();

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      await getUser();
      const result = await api<SlaDashboard>('/v1/monitors/sla-dashboard');
      setData(result);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load SLA dashboard';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSetTarget = async (id: string, value: number) => {
    try {
      const u = await getUser();
      await api(`/v1/monitors/${id}`, u?.id, {
        method: 'PATCH',
        body: JSON.stringify({ slaTarget: value }),
      });
      showSuccess('SLA target updated');
      await load();
    } catch {
      showError('Failed to update SLA target');
    }
  };

  const handleDownloadReport = async () => {
    try {
      setReportLoading(true);
      const u = await getUser();
      const report = await api<ComplianceReport>(`/v1/monitors/sla-compliance-report?months=${reportMonths}`, u?.id);
      const html = generateReportHtml(report);
      const blob = new Blob([html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const win = window.open(url, '_blank');
      if (win) {
        win.focus();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
      }
    } catch {
      showError('Failed to generate compliance report');
    } finally {
      setReportLoading(false);
    }
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  };

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sortKey !== k) return <ChevronUp className="w-3 h-3 text-zinc-600" />;
    return sortDir === 'asc'
      ? <ChevronUp className="w-3 h-3 text-accent" />
      : <ChevronDown className="w-3 h-3 text-accent" />;
  };

  const sortedMonitors = data
    ? [...data.monitors].sort((a, b) => {
        let cmp = 0;
        if (sortKey === 'name') cmp = a.name.localeCompare(b.name);
        else if (sortKey === 'uptimePct') cmp = a.uptimePct - b.uptimePct;
        else if (sortKey === 'errorBudgetUsedPct')
          cmp = (a.errorBudgetUsedPct ?? -1) - (b.errorBudgetUsedPct ?? -1);
        else if (sortKey === 'compliant') {
          const statusOrder = { breached: 0, atRisk: 1, noTarget: 2, compliant: 3 };
          cmp = statusOrder[complianceStatus(a)] - statusOrder[complianceStatus(b)];
        }
        return sortDir === 'asc' ? cmp : -cmp;
      })
    : [];

  const period = data
    ? `${new Date(data.period.start).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`
    : '—';

  return (
    <AppFrame title="SLA Dashboard">
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-zinc-100">SLA Dashboard</h1>
            <p className="text-sm text-zinc-400 mt-1">
              Service Level Agreement compliance across all monitors · {period}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Report months picker */}
            <div className="flex items-center gap-1 bg-surface border border-border rounded-lg px-2">
              <span className="text-xs text-text-muted">Report:</span>
              {[1, 3, 6, 12].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setReportMonths(m)}
                  className={`px-2 py-1 text-xs rounded transition-colors ${reportMonths === m ? 'bg-accent text-white' : 'text-text-secondary hover:text-text-primary'}`}
                >
                  {m}mo
                </button>
              ))}
            </div>
            <Button
              onClick={handleDownloadReport}
              disabled={reportLoading || loading}
              variant="secondary"
              size="sm"
              title="Generate printable SLA compliance report"
            >
              {reportLoading
                ? <RefreshCw className="w-4 h-4 animate-spin" />
                : <FileDown className="w-4 h-4" />}
              Compliance Report
            </Button>
            <Button onClick={load} disabled={loading} variant="secondary" size="sm">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        {error && (
          <div className="bg-red-900/20 border border-red-700/50 rounded-lg px-4 py-3 text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Summary Cards */}
        {data && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Card className="flex items-center gap-3 p-4">
              <CheckCircle2 className="w-6 h-6 text-green-400 shrink-0" />
              <div>
                <p className="text-2xl font-bold text-zinc-100">{data.summary.compliant}</p>
                <p className="text-xs text-zinc-400">Compliant</p>
              </div>
            </Card>
            <Card className="flex items-center gap-3 p-4">
              <AlertTriangle className="w-6 h-6 text-yellow-400 shrink-0" />
              <div>
                <p className="text-2xl font-bold text-zinc-100">{data.summary.atRisk}</p>
                <p className="text-xs text-zinc-400">At Risk</p>
              </div>
            </Card>
            <Card className="flex items-center gap-3 p-4">
              <XCircle className="w-6 h-6 text-red-400 shrink-0" />
              <div>
                <p className="text-2xl font-bold text-zinc-100">{data.summary.breached}</p>
                <p className="text-xs text-zinc-400">Breached</p>
              </div>
            </Card>
            <Card className="flex items-center gap-3 p-4">
              <Circle className="w-6 h-6 text-zinc-500 shrink-0" />
              <div>
                <p className="text-2xl font-bold text-zinc-100">{data.summary.noTarget}</p>
                <p className="text-xs text-zinc-400">No Target</p>
              </div>
            </Card>
          </div>
        )}

        {/* Table */}
        <Card className="overflow-hidden p-0">
          {loading && !data ? (
            <div className="flex items-center justify-center py-16">
              <RefreshCw className="w-6 h-6 animate-spin text-accent" />
            </div>
          ) : sortedMonitors.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-zinc-500">
              <Circle className="w-10 h-10" />
              <p className="text-sm">No monitors found.</p>
              <p className="text-xs text-zinc-600">Enable monitors and set SLA targets to see compliance data.</p>
            </div>
          ) : (
            <Table>
              <TableHead>
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider">
                    <button onClick={() => toggleSort('name')} className="flex items-center gap-1 hover:text-zinc-100 transition-colors">
                      Monitor <SortIcon k="name" />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider">SLA Target</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider">
                    <button onClick={() => toggleSort('uptimePct')} className="flex items-center gap-1 hover:text-zinc-100 transition-colors">
                      Uptime % <SortIcon k="uptimePct" />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider">
                    <button onClick={() => toggleSort('errorBudgetUsedPct')} className="flex items-center gap-1 hover:text-zinc-100 transition-colors">
                      Error Budget <SortIcon k="errorBudgetUsedPct" />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider">Last 3 Months</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider">
                    <button onClick={() => toggleSort('compliant')} className="flex items-center gap-1 hover:text-zinc-100 transition-colors">
                      Status <SortIcon k="compliant" />
                    </button>
                  </th>
                </tr>
              </TableHead>
              <TableBody>
                {sortedMonitors.map((m) => {
                  const status = complianceStatus(m);
                  return (
                    <TableRow key={m.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {monitorTypeIcon(m.type)}
                          <div>
                            <p className="text-zinc-100 font-medium text-sm">{m.name}</p>
                            <p className="text-xs text-zinc-500">{m.type}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <SlaTargetPill monitor={m} onSave={handleSetTarget} />
                      </TableCell>
                      <TableCell>
                        <div>
                          <UptimeColor m={m} />
                          <p className="text-[10px] text-zinc-500 mt-0.5">{m.totalRuns} runs · {m.failedRuns} failed</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <BudgetBar used={m.errorBudgetUsedPct} />
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {m.monthlyHistory.map((h) => (
                            <MonthBadge key={h.month} h={h} />
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        {status === 'compliant' && (
                          <span className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold bg-success/20 text-success border border-success/30">
                            <CheckCircle2 className="w-3 h-3" /> Compliant
                          </span>
                        )}
                        {status === 'atRisk' && (
                          <span className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold bg-warning/20 text-warning border border-warning/30">
                            <AlertTriangle className="w-3 h-3" /> At Risk
                          </span>
                        )}
                        {status === 'breached' && (
                          <span className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold bg-danger/20 text-danger border border-danger/30">
                            <XCircle className="w-3 h-3" /> Breached
                          </span>
                        )}
                        {status === 'noTarget' && (
                          <span className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold bg-zinc-800 text-zinc-400 border border-zinc-700">
                            <Circle className="w-3 h-3" /> No Target
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </Card>

        {data && (
          <p className="text-xs text-zinc-600 text-right">
            Generated {new Date(data.generatedAt).toLocaleString()}
          </p>
        )}
      </div>
    </AppFrame>
  );
}

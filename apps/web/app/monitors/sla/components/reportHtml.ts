import type { ComplianceReport, ComplianceMonitor, ComplianceMonthly } from '../types';

function statusBadge(compliant: boolean | null): string {
  if (compliant === true) return '<span style="background:#16a34a;color:#fff;padding:2px 10px;border-radius:999px;font-size:11px;font-weight:700">COMPLIANT</span>';
  if (compliant === false) return '<span style="background:#dc2626;color:#fff;padding:2px 10px;border-radius:999px;font-size:11px;font-weight:700">BREACHED</span>';
  return '<span style="background:#6b7280;color:#fff;padding:2px 10px;border-radius:999px;font-size:11px;font-weight:700">NO DATA</span>';
}

function pct(val: number | null, digits = 3): string {
  if (val == null) return '—';
  return `${val.toFixed(digits)}%`;
}

function monitorTable(mon: ComplianceMonitor, monthLabels: string[]): string {
  const period = mon.period;
  const rows = mon.monthlyBreakdown
    .map((mb: ComplianceMonthly) => `
      <tr>
        <td>${mb.month}</td>
        <td>${pct(mb.uptimePct)}</td>
        <td>${mb.totalChecks.toLocaleString()}</td>
        <td>${mb.failedChecks.toLocaleString()}</td>
        <td>${mb.downtimeMinutes} min</td>
        <td>${mb.incidents}</td>
        <td>${pct(mb.errorBudgetUsedPct, 1)}</td>
        <td>${statusBadge(mb.compliant)}</td>
      </tr>`)
    .join('');

  return `
    <div style="margin-bottom:32px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;page-break-inside:avoid">
      <div style="padding:14px 18px;background:#f9fafb;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;justify-content:space-between">
        <div>
          <div style="font-weight:700;font-size:15px;color:#111827">${escHtml(mon.name)}</div>
          <div style="font-size:12px;color:#6b7280;margin-top:2px">${escHtml(mon.type)} · ${escHtml(mon.target)}</div>
        </div>
        <div style="text-align:right">
          ${statusBadge(period.compliant)}
          <div style="font-size:12px;color:#6b7280;margin-top:4px">SLA target: ${pct(mon.slaTarget)}</div>
        </div>
      </div>
      <div style="padding:12px 18px;display:flex;gap:24px;background:#fff;border-bottom:1px solid #e5e7eb">
        <div><span style="font-size:11px;color:#6b7280">UPTIME</span><br><strong>${pct(period.uptimePct)}</strong></div>
        <div><span style="font-size:11px;color:#6b7280">FAILED CHECKS</span><br><strong>${period.failedChecks.toLocaleString()} / ${period.totalChecks.toLocaleString()}</strong></div>
        <div><span style="font-size:11px;color:#6b7280">DOWNTIME</span><br><strong>${period.downtimeMinutes} min</strong></div>
        <div><span style="font-size:11px;color:#6b7280">INCIDENTS</span><br><strong>${period.incidents}</strong></div>
        <div><span style="font-size:11px;color:#6b7280">ERROR BUDGET USED</span><br><strong>${pct(period.errorBudgetUsedPct, 1)}</strong></div>
      </div>
      ${mon.monthlyBreakdown.length > 0 ? `
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead>
          <tr style="background:#f3f4f6">
            <th style="padding:8px 14px;text-align:left;color:#6b7280;font-weight:600">Month</th>
            <th style="padding:8px 14px;text-align:left;color:#6b7280;font-weight:600">Uptime</th>
            <th style="padding:8px 14px;text-align:left;color:#6b7280;font-weight:600">Total</th>
            <th style="padding:8px 14px;text-align:left;color:#6b7280;font-weight:600">Failed</th>
            <th style="padding:8px 14px;text-align:left;color:#6b7280;font-weight:600">Downtime</th>
            <th style="padding:8px 14px;text-align:left;color:#6b7280;font-weight:600">Incidents</th>
            <th style="padding:8px 14px;text-align:left;color:#6b7280;font-weight:600">Budget Used</th>
            <th style="padding:8px 14px;text-align:left;color:#6b7280;font-weight:600">Status</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>` : ''}
    </div>`;
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function generateReportHtml(report: ComplianceReport): string {
  const { summary, monitors, reportPeriod, generatedAt } = report;

  const monitorSections = monitors
    .sort((a, b) => {
      // Breached first, then compliant, then no data
      const order = (m: ComplianceMonitor) => m.period.compliant === false ? 0 : m.period.compliant === true ? 1 : 2;
      return order(a) - order(b) || a.name.localeCompare(b.name);
    })
    .map((m) => monitorTable(m, reportPeriod.monthLabels))
    .join('');

  const complianceRate = summary.complianceRate != null ? `${summary.complianceRate.toFixed(1)}%` : '—';
  const fleetUptime = summary.fleetUptimePct != null ? `${summary.fleetUptimePct.toFixed(3)}%` : '—';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SLA Compliance Report — ${escHtml(reportPeriod.start)} to ${escHtml(reportPeriod.end)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #111827; background: #fff; padding: 40px 32px; max-width: 1100px; margin: 0 auto; }
    @media print {
      body { padding: 20px; }
      .no-print { display: none; }
    }
    tr:nth-child(even) td { background: #f9fafb; }
    td { padding: 8px 14px; border-top: 1px solid #f3f4f6; }
  </style>
</head>
<body>
  <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:32px;padding-bottom:24px;border-bottom:2px solid #e5e7eb">
    <div>
      <div style="font-size:24px;font-weight:800;color:#111827">SLA Compliance Report</div>
      <div style="font-size:14px;color:#6b7280;margin-top:6px">
        Period: <strong>${escHtml(reportPeriod.start)}</strong> → <strong>${escHtml(reportPeriod.end)}</strong>
        (${reportPeriod.months} month${reportPeriod.months !== 1 ? 's' : ''})
      </div>
      <div style="font-size:12px;color:#9ca3af;margin-top:4px">Generated: ${new Date(generatedAt).toLocaleString()}</div>
    </div>
    <button class="no-print" onclick="window.print()" style="padding:8px 18px;background:#111827;color:#fff;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer">
      🖨 Print / Save PDF
    </button>
  </div>

  <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:16px;margin-bottom:36px">
    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;text-align:center">
      <div style="font-size:28px;font-weight:800;color:#111827">${summary.totalMonitors}</div>
      <div style="font-size:12px;color:#6b7280;margin-top:4px">TOTAL MONITORS</div>
    </div>
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;text-align:center">
      <div style="font-size:28px;font-weight:800;color:#16a34a">${summary.compliant}</div>
      <div style="font-size:12px;color:#16a34a;margin-top:4px">COMPLIANT</div>
    </div>
    <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px;text-align:center">
      <div style="font-size:28px;font-weight:800;color:#dc2626">${summary.breached}</div>
      <div style="font-size:12px;color:#dc2626;margin-top:4px">BREACHED</div>
    </div>
    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;text-align:center">
      <div style="font-size:28px;font-weight:800;color:#6b7280">${summary.noData}</div>
      <div style="font-size:12px;color:#6b7280;margin-top:4px">NO DATA</div>
    </div>
    <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:16px;text-align:center">
      <div style="font-size:22px;font-weight:800;color:#1d4ed8">${fleetUptime}</div>
      <div style="font-size:12px;color:#1d4ed8;margin-top:4px">FLEET UPTIME</div>
    </div>
  </div>

  <div style="margin-bottom:28px;padding:14px 18px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;display:flex;align-items:center;gap:16px">
    <div style="font-size:13px;color:#374151">Compliance rate across monitored SLA targets:</div>
    <div style="font-size:20px;font-weight:800;color:#111827">${complianceRate}</div>
  </div>

  <h2 style="font-size:17px;font-weight:700;color:#111827;margin-bottom:18px">Monitor Detail</h2>
  ${monitorSections || '<p style="color:#6b7280;font-size:14px">No monitors with SLA targets found for this period.</p>'}
</body>
</html>`;
}

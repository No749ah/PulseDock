import { describe, it, expect } from 'vitest';
import { generateReportHtml } from './reportHtml';
import type { ComplianceReport } from '../types';

const baseReport: ComplianceReport = {
  generatedAt: '2026-04-01T22:00:00.000Z',
  reportPeriod: {
    start: '2026-01-01',
    end: '2026-03-31',
    months: 3,
    monthLabels: ['2026-01', '2026-02', '2026-03'],
  },
  summary: {
    totalMonitors: 3,
    compliant: 2,
    breached: 1,
    noData: 0,
    fleetUptimePct: 99.5,
    complianceRate: 66.7,
  },
  monitors: [
    {
      id: 'mon-1',
      name: 'API Health',
      type: 'HTTP',
      target: 'https://api.example.com/health',
      description: null,
      slaTarget: 99.9,
      period: {
        totalChecks: 4320,
        failedChecks: 5,
        uptimePct: 99.884,
        downtimeMinutes: 45,
        incidents: 2,
        compliant: false,
        errorBudgetUsedPct: 117.4,
      },
      monthlyBreakdown: [
        {
          month: '2026-01',
          totalChecks: 1440,
          failedChecks: 2,
          uptimePct: 99.861,
          downtimeMinutes: 20,
          incidents: 1,
          compliant: false,
          errorBudgetUsedPct: 132.3,
        },
        {
          month: '2026-02',
          totalChecks: 1440,
          failedChecks: 3,
          uptimePct: 99.792,
          downtimeMinutes: 25,
          incidents: 1,
          compliant: false,
          errorBudgetUsedPct: 196.7,
        },
        {
          month: '2026-03',
          totalChecks: 1440,
          failedChecks: 0,
          uptimePct: 100,
          downtimeMinutes: 0,
          incidents: 0,
          compliant: true,
          errorBudgetUsedPct: 0,
        },
      ],
    },
    {
      id: 'mon-2',
      name: 'Web Frontend',
      type: 'HTTP',
      target: 'https://example.com',
      description: 'Public landing page',
      slaTarget: 99.5,
      period: {
        totalChecks: 4320,
        failedChecks: 1,
        uptimePct: 99.977,
        downtimeMinutes: 5,
        incidents: 0,
        compliant: true,
        errorBudgetUsedPct: 8.7,
      },
      monthlyBreakdown: [],
    },
    {
      id: 'mon-3',
      name: 'Monitor & Escape <script>',
      type: 'TCP',
      target: 'db.internal:5432',
      description: null,
      slaTarget: 99.0,
      period: {
        totalChecks: 4320,
        failedChecks: 0,
        uptimePct: 100,
        downtimeMinutes: 0,
        incidents: 0,
        compliant: true,
        errorBudgetUsedPct: 0,
      },
      monthlyBreakdown: [],
    },
  ],
};

describe('generateReportHtml', () => {
  it('returns a valid HTML string', () => {
    const html = generateReportHtml(baseReport);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<html');
    expect(html).toContain('</html>');
  });

  it('includes the report period dates', () => {
    const html = generateReportHtml(baseReport);
    expect(html).toContain('2026-01-01');
    expect(html).toContain('2026-03-31');
  });

  it('includes the summary counts', () => {
    const html = generateReportHtml(baseReport);
    expect(html).toContain('>3<'); // totalMonitors
    expect(html).toContain('>2<'); // compliant
    expect(html).toContain('>1<'); // breached
  });

  it('includes fleet uptime and compliance rate', () => {
    const html = generateReportHtml(baseReport);
    expect(html).toContain('99.500%');
    expect(html).toContain('66.7%');
  });

  it('renders monitor names', () => {
    const html = generateReportHtml(baseReport);
    expect(html).toContain('API Health');
    expect(html).toContain('Web Frontend');
  });

  it('escapes HTML in monitor names', () => {
    const html = generateReportHtml(baseReport);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('shows COMPLIANT badge for compliant monitors', () => {
    const html = generateReportHtml(baseReport);
    expect(html).toContain('COMPLIANT');
  });

  it('shows BREACHED badge for breached monitors', () => {
    const html = generateReportHtml(baseReport);
    expect(html).toContain('BREACHED');
  });

  it('shows NO DATA badge when compliant is null', () => {
    const report: ComplianceReport = {
      ...baseReport,
      monitors: [
        {
          ...baseReport.monitors[0],
          period: { ...baseReport.monitors[0].period, compliant: null, uptimePct: null },
        },
      ],
    };
    const html = generateReportHtml(report);
    expect(html).toContain('NO DATA');
  });

  it('renders monthly breakdown rows', () => {
    const html = generateReportHtml(baseReport);
    expect(html).toContain('2026-01');
    expect(html).toContain('2026-02');
    expect(html).toContain('2026-03');
  });

  it('renders em-dash for null values', () => {
    const html = generateReportHtml(baseReport);
    expect(html).toContain('—');
  });

  it('handles an empty monitors array gracefully', () => {
    const report: ComplianceReport = { ...baseReport, monitors: [] };
    const html = generateReportHtml(report);
    expect(html).toContain('No monitors with SLA targets found');
  });

  it('includes the Print / Save PDF button', () => {
    const html = generateReportHtml(baseReport);
    expect(html).toContain('Print / Save PDF');
    expect(html).toContain('window.print()');
  });

  it('includes page title with period', () => {
    const html = generateReportHtml(baseReport);
    expect(html).toContain('SLA Compliance Report');
    expect(html).toContain('2026-01-01');
  });

  it('renders SLA target percentage in monitor header', () => {
    const html = generateReportHtml(baseReport);
    expect(html).toContain('99.900%'); // API Health target
    expect(html).toContain('99.500%'); // Web Frontend target
  });

  it('sorts breached monitors before compliant in monitor detail section', () => {
    const html = generateReportHtml(baseReport);
    // "API Health" is breached, "Web Frontend" is compliant.
    // Breached monitors should appear first in the detail section.
    const apiHealthIdx = html.indexOf('API Health');
    const webFrontendIdx = html.indexOf('Web Frontend');
    expect(apiHealthIdx).toBeGreaterThan(0);
    expect(webFrontendIdx).toBeGreaterThan(0);
    expect(apiHealthIdx).toBeLessThan(webFrontendIdx);
  });
});

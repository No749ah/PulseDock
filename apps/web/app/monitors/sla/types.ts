// ─── SLA Dashboard Types ──────────────────────────────────────────────────────

export type MonthlyHistory = {
  month: string; // "2026-01"
  uptimePct: number;
  compliant: boolean | null;
};

export type SlaMonitor = {
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

export type SlaDashboard = {
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

export type SortKey = 'name' | 'uptimePct' | 'errorBudgetUsedPct' | 'compliant';

export type TagSlaMonitor = {
  id: string;
  name: string;
  type: string;
  slaTarget: number | null;
  uptimePct: number | null;
  compliant: boolean | null;
};

export type TagSlaEntry = {
  tagId: string | null;
  tagName: string;
  tagColor: string | null;
  monitorCount: number;
  withSlaTarget: number;
  uptimePct: number | null;
  compliantCount: number;
  atRiskCount: number;
  breachedCount: number;
  noDataCount: number;
  monitors: TagSlaMonitor[];
};

export type ForecastDailyEntry = {
  date: string;
  type: 'actual' | 'projected';
  uptimePct: number | null;
  totalChecks: number;
  failedChecks: number;
  errorBudgetUsedPct: number | null;
};

export type SlaBudgetForecast = {
  generatedAt: string;
  monitorId: string;
  monitorName: string;
  slaTarget: number | null;
  period: {
    monthStart: string;
    monthEnd: string;
    dayOfMonth: number;
    daysInMonth: number;
    elapsedDaysFraction: number;
  };
  currentStats: {
    totalChecks: number;
    failedChecks: number;
    uptimePct: number;
    errorBudgetUsedPct: number | null;
  };
  forecast: {
    projectedUptimePct: number;
    projectedErrorBudgetUsedPct: number | null;
    willBreach: boolean | null;
    budgetExhaustedAlready: boolean;
    budgetExhaustionDate: string | null;
    confidence: 'high' | 'medium' | 'low';
  };
  dailyBreakdown: ForecastDailyEntry[];
};

export type ComplianceMonthly = {
  month: string;
  totalChecks: number;
  failedChecks: number;
  uptimePct: number | null;
  downtimeMinutes: number;
  incidents: number;
  compliant: boolean | null;
  errorBudgetUsedPct: number | null;
};

export type ComplianceMonitor = {
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

export type ComplianceReport = {
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

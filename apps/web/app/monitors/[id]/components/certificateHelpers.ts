export type PeriodDays = 7 | 30 | 90 | 365;

export const PERIOD_OPTIONS: { label: string; value: PeriodDays }[] = [
  { label: '7d', value: 7 },
  { label: '30d', value: 30 },
  { label: '90d', value: 90 },
  { label: '365d', value: 365 },
];

export function formatPct(n: number): string {
  return `${n.toFixed(3)}%`;
}

export function complianceColor(slaCompliant: boolean | null | undefined): string {
  if (slaCompliant === true) {
    return 'text-green-400 bg-green-500/10 border-green-500/30';
  }

  if (slaCompliant === false) {
    return 'text-red-400 bg-red-500/10 border-red-500/30';
  }

  return 'text-zinc-400 bg-zinc-500/10 border-zinc-500/30';
}

export function complianceLabel(slaCompliant: boolean | null | undefined): string {
  if (slaCompliant === true) return 'SLA COMPLIANT ✓';
  if (slaCompliant === false) return 'SLA BREACH ✗';
  return 'NO SLA TARGET';
}

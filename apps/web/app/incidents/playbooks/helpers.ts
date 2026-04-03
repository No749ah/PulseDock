export const SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const;
export type Severity = typeof SEVERITIES[number];

export const severityColors: Record<string, string> = {
  CRITICAL: 'bg-red-500/20 text-red-400 border-red-500/30',
  HIGH: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  MEDIUM: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  LOW: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
};

export type StepType = 'check' | 'escalate' | 'runbook' | 'command' | 'notify';

export const stepTypeColors: Record<StepType, string> = {
  check: 'bg-blue-500/20 text-blue-400',
  escalate: 'bg-red-500/20 text-red-400',
  runbook: 'bg-purple-500/20 text-purple-400',
  command: 'bg-zinc-500/20 text-zinc-400',
  notify: 'bg-green-500/20 text-green-400',
};

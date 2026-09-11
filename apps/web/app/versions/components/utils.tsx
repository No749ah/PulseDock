import { Check, X, Info } from 'lucide-react';

export const inputClass = "w-full px-4 py-3 bg-surface border border-border rounded-lg text-text-primary placeholder-text-secondary focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent";

export const CHANNEL_TYPE_COLORS: Record<string, string> = {
  discord: 'text-indigo-400',
  slack: 'text-green-400',
  webhook: 'text-blue-400',
  telegram: 'text-sky-400',
  email: 'text-yellow-400',
};

export const VERSION_NOTIFY_OPTIONS = [
  { value: 'VERSION_ANY',   label: 'Any update (minor + major)' },
  { value: 'VERSION_MAJOR', label: 'Major updates only' },
];

export const NOTIFY_ON_LABELS: Record<string, string> = {
  VERSION_ANY:   'Any update',
  VERSION_MAJOR: 'Major only',
};

export function stripLeadingV(version: string) {
  return version.replace(/^v(?=\d)/i, '');
}

export function secondsToHuman(sec: number) {
  if (sec % 86400 === 0) return `${sec / 86400}d`;
  if (sec % 3600 === 0) return `${sec / 3600}h`;
  if (sec % 60 === 0) return `${sec / 60}m`;
  return `${sec}s`;
}

export function levelBadgeVariant(level: string): 'success' | 'warning' | 'danger' {
  if (level === 'green') return 'success';
  if (level === 'yellow') return 'warning';
  return 'danger';
}

export function StatusIcon({ status }: { status: 'unknown' | 'ok' | 'fail' }) {
  if (status === 'ok') return <Check className="w-4 h-4 text-success" />;
  if (status === 'fail') return <X className="w-4 h-4 text-danger" />;
  return <Info className="w-4 h-4 text-text-secondary" />;
}

export const providerOptions = [
  { value: 'github', label: 'GitHub releases' },
  { value: 'gitlab', label: 'GitLab releases' },
  { value: 'docker', label: 'Docker image tags' },
  { value: 'apt', label: 'APT package versions' },
  { value: 'npm', label: 'npm package' },
  { value: 'pypi', label: 'PyPI package' },
  { value: 'cargo', label: 'Cargo crate (crates.io)' },
  { value: 'maven', label: 'Maven Central artifact' },
  { value: 'helm', label: 'Helm chart (Artifact Hub)' },
];

export const authOptions = [
  { value: 'token', label: 'Token headers' },
  { value: 'openvpn', label: 'OpenVPN (Basic / OpenVPN headers)' },
  { value: 'none', label: 'No auth' },
];

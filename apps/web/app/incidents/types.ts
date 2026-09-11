// ─── Incident domain types ────────────────────────────────────────────────────

export type IncidentStatus = 'INVESTIGATING' | 'IDENTIFIED' | 'MONITORING' | 'RESOLVED';
export type IncidentSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type MonitorOption = {
  id: string;
  name: string;
  type: string;
};

export type IncidentUpdate = {
  id: string;
  body: string;
  status: IncidentStatus;
  createdAt: string;
};

export type LinkedMonitor = {
  monitor: {
    id: string;
    name: string;
    type: string;
    target?: string;
  };
};

export type Incident = {
  id: string;
  title: string;
  description: string | null;
  status: IncidentStatus;
  severity: IncidentSeverity;
  autoCreated: boolean;
  resolvedAt: string | null;
  rootCause: string | null;
  postmortemNotes: string | null;
  createdAt: string;
  updatedAt: string;
  updates: IncidentUpdate[];
  monitors: LinkedMonitor[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

export const statusLabels: Record<IncidentStatus, string> = {
  INVESTIGATING: 'Investigating',
  IDENTIFIED: 'Identified',
  MONITORING: 'Monitoring',
  RESOLVED: 'Resolved',
};

export const statusColors: Record<IncidentStatus, string> = {
  INVESTIGATING: 'bg-red-500/20 text-red-400 border-red-500/30',
  IDENTIFIED: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  MONITORING: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  RESOLVED: 'bg-green-500/20 text-green-400 border-green-500/30',
};

export const severityColors: Record<IncidentSeverity, string> = {
  LOW: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  MEDIUM: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  HIGH: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  CRITICAL: 'bg-red-500/20 text-red-400 border-red-500/30',
};

export const severityLabels: Record<IncidentSeverity, string> = {
  LOW: 'Minor',
  MEDIUM: 'Major',
  HIGH: 'Major',
  CRITICAL: 'Critical',
};

export function formatDuration(ms: number): string {
  const totalMins = Math.floor(ms / 60000);
  if (totalMins < 60) return `${totalMins}m`;
  const hrs = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
}

export function incidentDuration(incident: Incident): string {
  const start = new Date(incident.createdAt).getTime();
  if (incident.status === 'RESOLVED') {
    return `lasted ${formatDuration(new Date(incident.updatedAt).getTime() - start)}`;
  }
  return `ongoing for ${formatDuration(Date.now() - start)}`;
}

export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export const inputClass =
  'w-full px-4 py-3 bg-surface border border-border rounded-lg text-text-primary placeholder-text-secondary focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent';

export const selectClass = `${inputClass} cursor-pointer`;

// ─── Incident templates ───────────────────────────────────────────────────────

export interface IncidentTemplate {
  id: string;
  label: string;
  icon: string;
  title: string;
  description: string;
  severity: IncidentSeverity;
}

export const INCIDENT_TEMPLATES: IncidentTemplate[] = [
  { id: 'service-outage', label: 'Service Outage', icon: '🔴', title: 'Service outage — {service}', description: 'We are investigating reports of a complete service outage. Users may be unable to access the service. Our team is working on a resolution.', severity: 'CRITICAL' },
  { id: 'degraded-performance', label: 'Degraded Performance', icon: '🟡', title: 'Degraded performance — {service}', description: 'We are experiencing degraded performance impacting some users. Response times are elevated and some requests may be failing. We are investigating the root cause.', severity: 'HIGH' },
  { id: 'database-issue', label: 'Database Issue', icon: '🗄️', title: 'Database connectivity issues', description: 'We are investigating database connectivity issues that may affect data reads and writes. Some operations may fail or be delayed.', severity: 'CRITICAL' },
  { id: 'deploy-issue', label: 'Deploy Rollback', icon: '🚀', title: 'Deployment issue — rolling back', description: 'A recent deployment introduced an issue impacting service availability. We are rolling back to the previous stable version.', severity: 'HIGH' },
  { id: 'third-party', label: 'Third-party Outage', icon: '🌐', title: 'Third-party service outage', description: 'We are experiencing issues due to an outage with a third-party dependency. We are monitoring the situation and will provide updates as we receive them.', severity: 'MEDIUM' },
  { id: 'network', label: 'Network Issue', icon: '📡', title: 'Network connectivity issues', description: 'We are investigating network connectivity issues that may affect service availability for some users in certain regions.', severity: 'HIGH' },
  { id: 'ssl-cert', label: 'SSL Certificate', icon: '🔒', title: 'SSL certificate issue', description: 'Users may encounter SSL certificate errors when accessing our service. We are working to resolve the certificate issue urgently.', severity: 'CRITICAL' },
  { id: 'maintenance', label: 'Unplanned Maintenance', icon: '🔧', title: 'Unplanned maintenance in progress', description: 'We are performing emergency maintenance to address a critical issue. Some services may be unavailable during this period.', severity: 'LOW' },
];

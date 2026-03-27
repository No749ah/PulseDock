export type MonitorType = 'HTTP' | 'GIT_RELEASE' | 'DOCKER_IMAGE' | 'TCP' | 'SSL_CERT' | 'HEARTBEAT' | 'DNS' | 'PING' | 'SMTP' | 'BROWSER' | 'WHOIS';
export type AlertChannelType = 'discord' | 'webhook' | 'slack' | 'telegram' | 'email' | 'pagerduty' | 'opsgenie' | 'sms';
export type MonitorLevel = 'green' | 'yellow' | 'red';

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  role: 'admin' | 'user';
  createdAt: string;
}

export interface Session {
  token: string;
  refreshTokenHash: string;
  userId: string;
  createdAt: string;
}

export interface Folder {
  id: string;
  userId: string;
  name: string;
  createdAt: string;
}

export interface AlertChannel {
  id: string;
  userId: string;
  name: string;
  type: AlertChannelType;
  config: Record<string, unknown>;
  createdAt: string;
  alertGrouping: boolean;
  groupWindowSec: number;
  groupByFolder: boolean;
  groupByTag: boolean;
}

export interface Monitor {
  id: string;
  userId: string;
  name: string;
  type: MonitorType;
  target: string;
  intervalSec: number;
  timeoutMs: number;
  confirmations: number;
  retryCount: number;
  config: Record<string, unknown>;
  alertChannelIds: string[];
  folderId: string | null;
  enabled: boolean;
  description: string | null;
  runbookUrl: string | null;
  slaTarget: number | null;
  slaPeriodDays: number | null;
  slaBreachAlertedAt: string | null;
  autoIncident: boolean;
  autoIncidentSeverity: string;
  activeAutoIncidentId: string | null;
  isFlapping: boolean;
  flapDetectionEnabled: boolean;
  flapAlertedAt: string | null;
  mutedUntil: string | null;
  latencyAlertMs: number | null;
  anomalyDetection: boolean;
  anomalyMultiplier: number;
  scheduleEnabled: boolean;
  scheduleDays: string;
  scheduleStartHour: number;
  scheduleEndHour: number;
  createdAt: string;
}

export interface MonitorRun {
  id: string;
  userId: string;
  monitorId: string;
  monitorType?: string | null;
  checkedAt: string;
  ok: boolean;
  statusCode: number;
  latencyMs: number | null;
  message: string;
  level: MonitorLevel;
  responseBody?: string | null;
  securityAuditJson?: unknown | null;
}

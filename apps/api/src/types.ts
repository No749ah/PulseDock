export type MonitorType = 'HTTP' | 'GIT_RELEASE' | 'DOCKER_IMAGE' | 'TCP' | 'SSL_CERT' | 'HEARTBEAT' | 'DNS' | 'PING' | 'SMTP' | 'BROWSER';
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
  config: Record<string, unknown>;
  alertChannelIds: string[];
  folderId: string | null;
  enabled: boolean;
  slaTarget: number | null;
  slaPeriodDays: number | null;
  slaBreachAlertedAt: string | null;
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
}

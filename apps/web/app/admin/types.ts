export type AdminUser = {
  id: string;
  email: string;
  displayName?: string | null;
  role: 'admin' | 'user';
  isActive?: boolean;
  totpEnabled?: boolean;
  emailVerified?: boolean;
  createdAt: string;
  updatedAt?: string | null;
};

export type Invite = {
  id: string;
  email: string;
  role: 'admin' | 'user';
  inviteUrl?: string;
  expiresAt: string;
  acceptedAt?: string | null;
};

export type AuditLog = {
  id: string;
  action: string;
  actorUserId: string | null;
  targetUserId: string | null;
  createdAt: string;
};

export type PasswordReset = {
  id: string;
  email: string;
  expiresAt: string;
  createdAt: string;
  resetUrl: string;
};

export type HealthData = {
  ok: boolean;
  service: string;
  version: string;
  runtime: string;
  uptimeMs: number;
  checks: { database: { status: 'ok' | 'error'; latencyMs: number | null } };
};

export type MetricsData = {
  requestsTotal: number;
  errorsTotal: number;
  authLoginFailed: number;
  alertsSent: number;
  alertsFailed: number;
};

export type SystemStatsData = {
  users: { total: number; active: number };
  monitors: { total: number; enabled: number };
  checksToday: number;
  failedToday: number;
  errorRatePct: number;
};

export type TemplateReport = {
  id: string;
  toolId: string;
  endpoint?: string | null;
  statusCode?: number | null;
  error?: string | null;
  note?: string | null;
  createdAt: string;
  userId: string;
};

export type Plugin = {
  id: string;
  displayName: string;
  description: string | null;
  supportedMonitorTypes: string[];
  configFields: {
    key: string;
    label: string;
    type: string;
    required?: boolean;
    placeholder?: string;
    helpText?: string;
  }[];
};

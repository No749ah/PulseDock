export const inputClass =
  "w-full px-4 py-3 bg-surface border border-border rounded-lg text-text-primary placeholder-text-secondary focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent";

export interface Me {
  id: string;
  email: string;
  role: "admin" | "user";
  displayName?: string;
  timezone?: string;
  mustChangePassword?: boolean;
  totpEnabled?: boolean;
}

export interface TotpSetupData {
  secret: string;
  qrCodeUrl: string;
  otpAuthUrl: string;
}

export interface Session {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface AuditLogEntry {
  id: string;
  action: string;
  createdAt: string;
  metaJson: unknown;
}

export type ApiKeyScope = "READ" | "WRITE" | "ADMIN";

export const API_KEY_SCOPE_LABELS: Record<ApiKeyScope, string> = {
  READ: "Read-only",
  WRITE: "Read + Write",
  ADMIN: "Full Access",
};

export const API_KEY_SCOPE_COLORS: Record<ApiKeyScope, string> = {
  READ: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  WRITE: "bg-accent/15 text-accent border-accent/20",
  ADMIN: "bg-danger/15 text-danger border-danger/20",
};

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  scope: ApiKeyScope;
  usageCount: number;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export interface NewApiKey extends ApiKey {
  key: string;
}

export interface NotificationPreference {
  id: string;
  notifyOnDown: boolean;
  notifyOnRecovery: boolean;
  notifyOnDegraded: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart: number;
  quietHoursEnd: number;
  frequency: string;
  alertStormProtection: boolean;
  alertStormThreshold: number;
}

export interface ScheduledReport {
  id: string;
  enabled: boolean;
  frequency: string;
  dayOfWeek: number;
  hourUtc: number;
  lastSentAt: string | null;
}

export type TeamRoleApi = "OWNER" | "ADMIN" | "EDITOR" | "VIEWER";
export type TeamRoleDisplay = "Admin" | "Editor" | "Viewer";

export interface TeamMemberUser {
  id: string;
  email: string;
  displayName: string | null;
}

export interface TeamMember {
  id: string;
  ownerId: string;
  userId: string;
  role: TeamRoleApi;
  createdAt: string;
  user: TeamMemberUser;
}

export interface PendingInvite {
  id: string;
  email: string;
  role: TeamRoleApi;
  expiresAt: string;
  createdAt: string;
}

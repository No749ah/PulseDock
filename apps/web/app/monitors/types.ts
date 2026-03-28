export interface MonitorTag {
  id: string;
  name: string;
  color: string;
}

export interface TagItem {
  id: string;
  name: string;
  color: string;
  monitorCount: number;
  createdAt: string;
}

export interface AlertChannelSummary {
  id: string;
  name: string;
  type: string;
  notifyOn: string;
}

export interface MonitorItem {
  id: string;
  name: string;
  description?: string | null;
  runbookUrl?: string | null;
  type: "HTTP" | "GIT_RELEASE" | "DOCKER_IMAGE" | "TCP" | "SSL_CERT" | "HEARTBEAT" | "DNS" | "PING" | "SMTP" | "BROWSER" | "WHOIS";
  target: string;
  intervalSec: number;
  confirmations: number;
  retryCount?: number;
  enabled: boolean;
  createdAt: string;
  folderId?: string | null;
  config?: Record<string, unknown>;
  tags?: MonitorTag[];
  alertChannels?: AlertChannelSummary[];
  slaTarget?: number | null;
  slaPeriodDays?: number | null;
  sliLatencyTarget?: number | null;
  sliLatencyWindow?: number | null;
  autoIncident?: boolean;
  autoIncidentSeverity?: string;
  activeAutoIncidentId?: string | null;
  isFlapping?: boolean;
  flapDetectionEnabled?: boolean;
  flapWindow?: number;
  flapThreshold?: number;
  flapAlertedAt?: string | null;
  latencyAlertMs?: number | null;
  shareToken?: string | null;
  pinned?: boolean;
  pausedUntil?: string | null;
  mutedUntil?: string | null;
}

export interface MonitorRun {
  id: string;
  monitorId: string;
  ok: boolean;
  statusCode: number;
  latencyMs?: number;
  message: string;
  checkedAt: string;
  level?: "green" | "yellow" | "red";
  /** First 500 chars of response body on failure, for debugging */
  responseBody?: string | null;
  /** HTTP redirect chain: URLs followed before reaching final response */
  redirectChain?: string[];
}

export interface AlertChannel {
  id: string;
  name: string;
  type: string;
  config: Record<string, unknown>;
  createdAt: string;
  notifyOn?: string;
}

export interface PluginField {
  key: string;
  label: string;
  type: "text" | "number" | "boolean";
  required?: boolean;
  placeholder?: string;
  helpText?: string;
}

export interface MonitorPlugin {
  id: string;
  displayName: string;
  description?: string | null;
  supportedMonitorTypes: Array<MonitorItem["type"]>;
  configFields: PluginField[];
}

export type MonitorFormData = {
  name: string;
  description: string;
  runbookUrl: string;
  type: "HTTP" | "TCP" | "SSL_CERT" | "HEARTBEAT" | "DNS" | "PING" | "SMTP" | "BROWSER" | "WHOIS";
  target: string;
  intervalSec: number;
  confirmations: number;
  retryCount: number;
  enabled: boolean;
  pluginId: string;
  expectedText: string;
  heartbeatTimeoutMin: number;
  heartbeatToken: string;
  folderId: string;
  slaTarget: number | "";
  slaPeriodDays: number;
  autoIncident: boolean;
  autoIncidentSeverity: string;
  flapDetectionEnabled: boolean;
  flapWindow: number;
  flapThreshold: number;
  latencyAlertMs: number | null;
  anomalyDetection: boolean;
  anomalyMultiplier: number;
  sliLatencyTarget: number | "";
  sliLatencyWindow: number;
  rtoMinutes: number | undefined;
  cronExpression: string;
  scheduleEnabled: boolean;
  scheduleDays: string;
  scheduleStartHour: number;
  scheduleEndHour: number;
  /** Per-monitor HTTP/TCP/SSL request timeout in milliseconds (overrides default 5000ms) */
  timeoutMs: number | null;
  /** Optional webhook URL called on every status change */
  statusWebhookUrl?: string;
  /** Optional HMAC-SHA256 signing secret for statusWebhookUrl */
  statusWebhookSecret?: string;
};

export type MonitorFormDataExtended = MonitorFormData & {
  expectedStatus?: number;
  bodyContains?: string;
  bodyJsonPath?: string;
  bodyJsonPathExpected?: string;
  httpMethod?: string;
  requestHeaders?: string;
  requestBody?: string;
  responseTimeThresholdMs?: number;
  checkSecurityHeaders?: boolean;
  detectContentChanges?: boolean;
  ehlo?: string;
  checkTls?: boolean;
  dnsRecordType?: string;
  dnsExpectedValue?: string;
  dnsTimeoutMs?: number;
  dnsDetectChanges?: boolean;
  pingCount?: number;
  pingMaxLossPct?: number;
  browserExpectedText?: string;
  browserSelector?: string;
  browserStatusCodesRaw?: string;
  // HTTP Auth
  authType?: string;
  authUser?: string;
  authPassword?: string;
  authToken?: string;
  authApiKeyName?: string;
  authApiKeyValue?: string;
  authApiKeyIn?: string;
  // Pre-request auth step
  preAuthUrl?: string;
  preAuthBody?: string;
  preAuthExtractCookie?: string;
  preAuthExtractToken?: string;
};

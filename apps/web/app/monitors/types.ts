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
  type: "HTTP" | "GIT_RELEASE" | "DOCKER_IMAGE" | "TCP" | "SSL_CERT" | "HEARTBEAT" | "DNS" | "PING" | "SMTP" | "BROWSER";
  target: string;
  intervalSec: number;
  confirmations: number;
  enabled: boolean;
  createdAt: string;
  folderId?: string | null;
  config?: Record<string, unknown>;
  tags?: MonitorTag[];
  alertChannels?: AlertChannelSummary[];
  slaTarget?: number | null;
  slaPeriodDays?: number | null;
  autoIncident?: boolean;
  autoIncidentSeverity?: string;
  activeAutoIncidentId?: string | null;
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
  type: "HTTP" | "TCP" | "SSL_CERT" | "HEARTBEAT" | "DNS" | "PING" | "SMTP" | "BROWSER";
  target: string;
  intervalSec: number;
  confirmations: number;
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
  ehlo?: string;
  checkTls?: boolean;
  dnsRecordType?: string;
  dnsExpectedValue?: string;
  dnsTimeoutMs?: number;
  pingCount?: number;
  pingMaxLossPct?: number;
  browserExpectedText?: string;
  browserSelector?: string;
  browserStatusCodesRaw?: string;
};

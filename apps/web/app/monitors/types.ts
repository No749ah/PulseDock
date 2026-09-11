// Transaction monitor step types (mirrors backend TransactionStep)
export interface TransactionStepAssertion {
  type: "status" | "body_contains" | "json_path" | "header_exists" | "latency_lt";
  value: string;
  expected?: string;
}

export interface TransactionStep {
  id: string;
  name: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  url: string;
  headers?: Record<string, string>;
  body?: string;
  extract?: Record<string, string>;
  assertions?: TransactionStepAssertion[];
  timeoutMs?: number;
}

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
  type: "HTTP" | "GIT_RELEASE" | "DOCKER_IMAGE" | "TCP" | "SSL_CERT" | "HEARTBEAT" | "DNS" | "PING" | "SMTP" | "BROWSER" | "WHOIS" | "FTP" | "IMAP" | "POP3" | "CT_LOG" | "GRAPHQL" | "TRANSACTION";
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
  latencyBudgetMs?: number | null;
  shareToken?: string | null;
  pinned?: boolean;
  pausedUntil?: string | null;
  mutedUntil?: string | null;
  geoRegions?: string[];
  /** JSONPath to extract a numeric metric from response body (HTTP/BROWSER only) */
  metricPath?: string | null;
  /** Human-readable label for the captured metric */
  metricName?: string | null;
  /** Optional unit label for the captured metric */
  metricUnit?: string | null;
  /** Alert yellow when captured metric value drops below this minimum */
  metricAlertMin?: number | null;
  /** Alert yellow when captured metric value exceeds this maximum */
  metricAlertMax?: number | null;
  /** Header assertions — array of { header, op, value? } to evaluate on every HTTP check */
  headerAssertions?: Array<{ header: string; op: string; value?: string }> | null;
  /** GraphQL query to send (GRAPHQL monitors) */
  graphqlQuery?: string | null;
  /** JSON string of variables to pass with the GraphQL query */
  graphqlVariables?: string | null;
  /** JSONPath to a field in the GraphQL response to validate */
  graphqlDataPath?: string | null;
  /** Expected string value at graphqlDataPath */
  graphqlExpectedValue?: string | null;
  /** Estimated business cost per hour of downtime in USD */
  downtimeCostPerHour?: number | null;
  /** Monitor priority / criticality: 0=unset, 1=P1 (critical), 2=P2 (high), 3=P3 (medium), 4=P4 (low) */
  priority?: number;
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
  /** Header assertion failures — populated when headerAssertions are configured and at least one fails */
  headerAssertionsFailed?: Array<{
    header: string;
    op: string;
    expected?: string;
    actual?: string | null;
    message: string;
  }> | null;
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
  type: "HTTP" | "TCP" | "SSL_CERT" | "HEARTBEAT" | "DNS" | "PING" | "SMTP" | "BROWSER" | "WHOIS" | "FTP" | "IMAP" | "POP3" | "CT_LOG" | "GRAPHQL" | "TRANSACTION";
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
  latencyBudgetMs: number | null;
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
  /** Minimum ms between consecutive checks (throttle). Min 1000, max 3600000. */
  throttleMs?: number | null;
  /** Hard cap on checks per hour. Max 360. */
  maxChecksPerHour?: number | null;
  /** When enabled, check frequency automatically increases when monitor is degraded/down. */
  adaptiveIntervalEnabled?: boolean;
  /** Check interval (seconds) when monitor is DOWN (red). Null = intervalSec / 4. */
  adaptiveIntervalDownSec?: number | null;
  /** Check interval (seconds) when monitor is DEGRADED (yellow). Null = intervalSec / 2. */
  adaptiveIntervalDegradedSec?: number | null;
  /** Geo region tags for simulated multi-region monitoring (round-robin). */
  geoRegions?: string[];
  /** JSONPath to extract a numeric metric from response body (HTTP/BROWSER only) */
  metricPath?: string | null;
  /** Human-readable label for the captured metric */
  metricName?: string | null;
  /** Optional unit label for the captured metric (e.g. "items", "ms", "%") */
  metricUnit?: string | null;
  /** Alert yellow when captured metric value drops below this minimum */
  metricAlertMin?: number | null;
  /** Alert yellow when captured metric value exceeds this maximum */
  metricAlertMax?: number | null;
  /** GraphQL query to send (GRAPHQL monitors) */
  graphqlQuery?: string | null;
  /** JSON string of variables to pass with the GraphQL query */
  graphqlVariables?: string | null;
  /** JSONPath to a field in the GraphQL response to validate */
  graphqlDataPath?: string | null;
  /** Expected string value at graphqlDataPath */
  graphqlExpectedValue?: string | null;
  /** Estimated business cost per hour of downtime (USD) for financial impact calculation */
  downtimeCostPerHour?: number | null;
  /** Monitor priority / criticality: 0=unset, 1=P1 (critical), 2=P2 (high), 3=P3 (medium), 4=P4 (low) */
  priority?: number;
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
  // Response size constraints
  minResponseBodyBytes?: number;
  maxResponseBodyBytes?: number;
  // Header assertion
  assertResponseHeader?: string;
  assertResponseHeaderValue?: string;
  // Redirect behavior
  followRedirects?: boolean;
  maxRedirects?: number;
  // Header tracking
  trackedHeaders?: string;
  // Header assertions
  headerAssertions?: Array<{ header: string; op: string; value?: string }>;
};

import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsNotEmpty, IsNumber, IsObject, IsOptional, IsString, IsUrl, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SanitizeHtml } from '../common/sanitize';

export class HeaderAssertionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  header!: string;

  @IsIn(['exists', 'not-exists', 'equals', 'contains'])
  op!: 'exists' | 'not-exists' | 'equals' | 'contains';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  value?: string;
}

export class CreateMonitorDto {
  @ApiProperty({ description: 'Display name for the monitor', maxLength: 255, example: 'My API Health' })
  @SanitizeHtml()
  @IsString()
  @MaxLength(255)
  name!: string;

  @ApiPropertyOptional({ description: 'Optional notes or description for this monitor', maxLength: 2048, example: 'Production API health check — critical for checkout flow' })
  @IsOptional()
  @SanitizeHtml()
  @IsString()
  @MaxLength(2048)
  description?: string;

  @ApiPropertyOptional({ description: 'Optional URL to an incident runbook for this monitor', maxLength: 2048, example: 'https://wiki.example.com/runbooks/service-outage' })
  @IsOptional()
  @IsUrl()
  @MaxLength(2048)
  runbookUrl?: string;

  @ApiProperty({
    description: 'Target URL, host:port, GitHub repo slug, Docker image, etc. depending on type',
    maxLength: 1024,
    example: 'https://api.example.com/health',
  })
  @IsString()
  @MaxLength(1024)
  target!: string;

  @ApiProperty({
    description: 'Monitor type',
    enum: ['HTTP', 'GIT_RELEASE', 'DOCKER_IMAGE', 'TCP', 'SSL_CERT', 'HEARTBEAT', 'DNS', 'PING', 'SMTP', 'BROWSER', 'WHOIS', 'FTP', 'IMAP', 'POP3', 'CT_LOG', 'GRAPHQL', 'TRANSACTION'],
    example: 'HTTP',
  })
  @IsIn(['HTTP', 'GIT_RELEASE', 'DOCKER_IMAGE', 'TCP', 'SSL_CERT', 'HEARTBEAT', 'DNS', 'PING', 'SMTP', 'BROWSER', 'WHOIS', 'FTP', 'IMAP', 'POP3', 'CT_LOG', 'GRAPHQL', 'TRANSACTION'])
  type!: 'HTTP' | 'GIT_RELEASE' | 'DOCKER_IMAGE' | 'TCP' | 'SSL_CERT' | 'HEARTBEAT' | 'DNS' | 'PING' | 'SMTP' | 'BROWSER' | 'WHOIS' | 'FTP' | 'IMAP' | 'POP3' | 'CT_LOG' | 'GRAPHQL' | 'TRANSACTION';

  @ApiPropertyOptional({ description: 'Check interval in seconds (min 10)', minimum: 10, example: 60 })
  @IsOptional()
  @IsInt()
  @Min(10)
  intervalSec?: number;

  @ApiPropertyOptional({ description: 'Request timeout in milliseconds (min 100)', minimum: 100, example: 10000 })
  @IsOptional()
  @IsInt()
  @Min(100)
  timeoutMs?: number;

  @ApiPropertyOptional({
    description: 'Number of consecutive failures required before triggering an alert (1–10). Reduces false-positive noise.',
    minimum: 1,
    maximum: 10,
    example: 2,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  confirmations?: number;

  @ApiPropertyOptional({
    description: 'Number of automatic retries on check failure before recording as failed (0–3). Retries use exponential backoff (500ms, 1s, 2s). Prevents false alerts from transient network blips.',
    minimum: 0,
    maximum: 3,
    example: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3)
  retryCount?: number;

  @ApiPropertyOptional({ description: 'Monitor priority / criticality level: 1=P1 (critical), 2=P2 (high), 3=P3 (medium), 4=P4 (low), 0=unset', minimum: 0, maximum: 4, example: 1 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(4)
  priority?: number;

  @ApiPropertyOptional({
    description: [
      'Monitor-type-specific configuration. For HTTP monitors: method, requestHeaders, requestBody, expectedStatus, bodyContains, responseTimeThresholdMs.',
      'Pre-request auth step: preAuthUrl, preAuthBody, preAuthExtractCookie (cookie name) OR preAuthExtractToken (dot-path to JWT/token in JSON response).',
      'For HEARTBEAT: timeoutMin, token.',
      'For SSL_CERT: warnDays.',
      'For GIT_RELEASE/DOCKER_IMAGE: token, host, appVersionEndpoint, appAuthType.',
    ].join(' '),
    example: {
      method: 'GET',
      expectedStatus: 200,
      bodyContains: '"status":"ok"',
      responseTimeThresholdMs: 2000,
      preAuthUrl: 'https://app.example.com/api/auth/login',
      preAuthBody: '{"email":"monitor@example.com","password":"secret"}',
      preAuthExtractToken: 'data.accessToken',
    },
  })
  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  alertChannelIds?: string[];

  @IsOptional()
  folderId?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  tags?: string[];

  @ApiPropertyOptional({ description: 'Whether the monitor is enabled (default: true)', example: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ description: 'SLA target uptime percentage (0–100), e.g. 99.9 for 99.9% uptime', minimum: 0, maximum: 100, example: 99.9 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  slaTarget?: number;

  @ApiPropertyOptional({ description: 'Rolling window in days for SLA calculation (7, 14, 30, or 90)', enum: [7, 14, 30, 90], example: 30 })
  @IsOptional()
  @IsInt()
  @IsIn([7, 14, 30, 90])
  slaPeriodDays?: number;

  @ApiPropertyOptional({ description: 'Automatically create/resolve incidents when this monitor changes status', example: false })
  @IsOptional()
  @IsBoolean()
  autoIncident?: boolean;

  @ApiPropertyOptional({ description: 'Default incident severity for auto-created incidents', enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'], example: 'MEDIUM' })
  @IsOptional()
  @IsIn(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'])
  autoIncidentSeverity?: string;

  @ApiPropertyOptional({ description: 'Enable flap detection to suppress noisy alerts when monitor rapidly oscillates between up and down', example: true })
  @IsOptional()
  @IsBoolean()
  flapDetectionEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Number of recent checks to analyze for flap detection (5–50)', minimum: 5, maximum: 50, example: 10 })
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(50)
  flapWindow?: number;

  @ApiPropertyOptional({ description: 'Fraction of state changes required to detect flapping (0.3–0.9)', minimum: 0.3, maximum: 0.9, example: 0.5 })
  @IsOptional()
  @IsNumber()
  @Min(0.3)
  @Max(0.9)
  flapThreshold?: number;

  @ApiPropertyOptional({ description: 'Fixed latency alert threshold in ms. If set, any successful check with latency above this value will be flagged yellow and trigger a degraded alert.', minimum: 1, maximum: 60000, example: 2000 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(60000)
  latencyAlertMs?: number | null;

  @ApiPropertyOptional({ description: 'P95 latency budget in ms (monthly). Tracks how many checks exceed this target as a percentage. Used for SLA/SLO budget consumption reporting.', minimum: 100, maximum: 60000, example: 500 })
  @IsOptional()
  @IsInt()
  @Min(100)
  @Max(60000)
  latencyBudgetMs?: number;

  @ApiPropertyOptional({ description: 'Enable dynamic latency anomaly detection — fires a degraded alert when response time exceeds multiplier × P95 of last 7 days', example: false })
  @IsOptional()
  @IsBoolean()
  anomalyDetection?: boolean;

  @ApiPropertyOptional({ description: 'Multiplier for anomaly detection threshold (default: 2.0 = alert when latency > 2× P95 baseline)', example: 2.0 })
  @IsOptional()
  @IsNumber()
  @Min(1.1)
  @Max(10)
  anomalyMultiplier?: number;

  @ApiPropertyOptional({ description: 'Target p95 latency in ms for the Latency SLI. If set, p95 of responses must be below this value.', minimum: 1, maximum: 60000, example: 500 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(60000)
  sliLatencyTarget?: number;

  @ApiPropertyOptional({ description: 'Rolling window in days for the Latency SLI calculation (1–90)', minimum: 1, maximum: 90, example: 7 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(90)
  sliLatencyWindow?: number;

  @ApiPropertyOptional({
    description: 'Cron expression (5-field, UTC) to schedule checks. When set, overrides intervalSec. E.g. "*/5 * * * *" = every 5 min, "0 9 * * 1-5" = weekdays 9am UTC.',
    example: '*/5 * * * *',
  })
  @IsOptional()
  @IsString()
  cronExpression?: string | null;

  @ApiPropertyOptional({ description: 'Enable schedule-based checking (only run during configured window)', example: false })
  @IsOptional()
  @IsBoolean()
  scheduleEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Comma-separated days of week (0=Sun..6=Sat). Default: "1,2,3,4,5"', example: '1,2,3,4,5' })
  @IsOptional()
  @IsString()
  scheduleDays?: string;

  @ApiPropertyOptional({ description: 'UTC hour to start checks (0-23)', example: 8 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  scheduleStartHour?: number;

  @ApiPropertyOptional({ description: 'UTC hour to stop checks (0-23)', example: 18 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  scheduleEndHour?: number;

  @ApiPropertyOptional({ description: 'Comma-separated HTTP response header names to track for changes (HTTP/BROWSER monitors only). Example: "x-frame-options,content-security-policy,server"', example: 'x-frame-options,content-security-policy' })
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  trackedHeaders?: string | null;

  @ApiPropertyOptional({ description: 'Recovery Time Objective in minutes. Alert breach when recovery takes longer than this target (1–10080, i.e. 1 min–1 week).', minimum: 1, maximum: 10080, example: 15 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10080)
  rtoMinutes?: number;

  @ApiPropertyOptional({ description: 'Optional per-monitor webhook URL. PulseDock will POST a status change payload to this URL whenever the monitor level changes (e.g. green→red, red→green). Useful for CI/CD integrations and automation.', example: 'https://example.com/hooks/monitor-status' })
  @IsOptional()
  @IsUrl()
  @MaxLength(2048)
  statusWebhookUrl?: string | null;

  @ApiPropertyOptional({ description: 'Optional HMAC-SHA256 secret for the status webhook. When set, PulseDock adds an X-PulseDock-Signature header to each webhook call (sha256=<hex> format). Use this to verify the payload origin.', example: 'super-secret-string' })
  @IsOptional()
  @IsString()
  @MaxLength(256)
  statusWebhookSecret?: string | null;

  @ApiPropertyOptional({ description: 'Minimum milliseconds between consecutive checks for this monitor (throttle). Prevents rapid successive checks after interval drift. Min 1000ms, max 3600000ms (1 hour).', minimum: 1000, maximum: 3600000, example: 5000 })
  @IsOptional()
  @IsInt()
  @Min(1000)
  @Max(3600000)
  throttleMs?: number;

  @ApiPropertyOptional({ description: 'Hard cap on checks per hour regardless of interval. Max 360 (one check per 10 seconds).', minimum: 1, maximum: 360, example: 60 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(360)
  maxChecksPerHour?: number;

  @ApiPropertyOptional({ description: 'When enabled, check frequency automatically increases when the monitor is degraded or down, and returns to normal on recovery.', example: true })
  @IsOptional()
  @IsBoolean()
  adaptiveIntervalEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Check interval (seconds) to use when monitor is DOWN (red). Minimum 10s. Null = intervalSec / 4.', minimum: 10, maximum: 3600, example: 15 })
  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(3600)
  adaptiveIntervalDownSec?: number;

  @ApiPropertyOptional({ description: 'Check interval (seconds) to use when monitor is DEGRADED (yellow). Minimum 15s. Null = intervalSec / 2.', minimum: 15, maximum: 3600, example: 30 })
  @IsOptional()
  @IsInt()
  @Min(15)
  @Max(3600)
  adaptiveIntervalDegradedSec?: number;

  @ApiPropertyOptional({ description: 'Geo region tags for simulated multi-region monitoring (max 10 regions, 50 chars each). Round-robin assignment to runs.', example: ['us-east-1', 'eu-west-1', 'ap-southeast-1'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  @ArrayMaxSize(10)
  geoRegions?: string[];

  @ApiPropertyOptional({ description: 'JSONPath expression to extract a numeric metric from the HTTP response body (e.g. "$.queue.depth", "$.metrics.errors"). HTTP/BROWSER monitors only.', example: '$.queue.depth' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  metricPath?: string | null;

  @ApiPropertyOptional({ description: 'Human-readable label for the captured metric (e.g. "Queue Depth", "Error Rate"). Shown in charts and alerts.', example: 'Queue Depth' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  metricName?: string | null;

  @ApiPropertyOptional({ description: 'Optional unit label appended to captured metric values (e.g. "items", "ms", "%", "req/s").', example: 'items' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  metricUnit?: string | null;

  @ApiPropertyOptional({ description: 'Alert yellow when captured metric value drops below this minimum threshold.', example: 0 })
  @IsOptional()
  @IsNumber()
  metricAlertMin?: number | null;

  @ApiPropertyOptional({ description: 'Alert yellow when captured metric value exceeds this maximum threshold.', example: 1000 })
  @IsOptional()
  @IsNumber()
  metricAlertMax?: number | null;

  @ApiPropertyOptional({
    description: 'Array of header assertions to evaluate on every HTTP check. Each assertion can check if a header exists, is absent, equals a value, or contains a substring. Alert yellow on any failure.',
    type: [HeaderAssertionDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HeaderAssertionDto)
  headerAssertions?: HeaderAssertionDto[];

  // GraphQL monitor fields
  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  graphqlQuery?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(5_000)
  graphqlVariables?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  graphqlDataPath?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(1_000)
  graphqlExpectedValue?: string | null;

  @ApiPropertyOptional({ description: 'Estimated business cost per hour of downtime in USD. Used to compute financial impact on the cost dashboard.', minimum: 0, maximum: 1000000, example: 500 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1000000)
  downtimeCostPerHour?: number;

}

export class UpdateMonitorDto {
  @IsOptional()
  @SanitizeHtml()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @SanitizeHtml()
  @IsString()
  @MaxLength(2048)
  description?: string;

  @IsOptional()
  @IsUrl()
  @MaxLength(2048)
  runbookUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  target?: string;

  @IsOptional()
  @IsIn(['HTTP', 'GIT_RELEASE', 'DOCKER_IMAGE', 'TCP', 'SSL_CERT', 'HEARTBEAT', 'DNS', 'PING', 'SMTP', 'BROWSER', 'WHOIS', 'FTP', 'IMAP', 'POP3', 'CT_LOG', 'GRAPHQL', 'TRANSACTION'])
  type?: 'HTTP' | 'GIT_RELEASE' | 'DOCKER_IMAGE' | 'TCP' | 'SSL_CERT' | 'HEARTBEAT' | 'DNS' | 'PING' | 'SMTP' | 'BROWSER' | 'WHOIS' | 'FTP' | 'IMAP' | 'POP3' | 'CT_LOG' | 'GRAPHQL' | 'TRANSACTION';

  @IsOptional()
  @IsInt()
  @Min(10)
  intervalSec?: number;

  @IsOptional()
  @IsInt()
  @Min(100)
  timeoutMs?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  confirmations?: number;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  alertChannelIds?: string[];

  @IsOptional()
  folderId?: string | null;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  tags?: string[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  slaTarget?: number;

  @IsOptional()
  @IsInt()
  @IsIn([7, 14, 30, 90])
  slaPeriodDays?: number;

  @IsOptional()
  @IsBoolean()
  autoIncident?: boolean;

  @IsOptional()
  @IsIn(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'])
  autoIncidentSeverity?: string;

  @ApiPropertyOptional({ description: 'Enable flap detection to suppress noisy alerts when monitor rapidly oscillates between up and down', example: true })
  @IsOptional()
  @IsBoolean()
  flapDetectionEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Number of recent checks to analyze for flap detection (5–50)', minimum: 5, maximum: 50, example: 10 })
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(50)
  flapWindow?: number;

  @ApiPropertyOptional({ description: 'Fraction of state changes required to detect flapping (0.3–0.9)', minimum: 0.3, maximum: 0.9, example: 0.5 })
  @IsOptional()
  @IsNumber()
  @Min(0.3)
  @Max(0.9)
  flapThreshold?: number;

  @ApiPropertyOptional({ description: 'Fixed latency alert threshold in ms. If set, any successful check with latency above this value will be flagged yellow and trigger a degraded alert.', minimum: 1, maximum: 60000, example: 2000 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(60000)
  latencyAlertMs?: number | null;

  @ApiPropertyOptional({ description: 'P95 latency budget in ms (monthly). Tracks how many checks exceed this target as a percentage. Used for SLA/SLO budget consumption reporting.', minimum: 100, maximum: 60000, example: 500 })
  @IsOptional()
  @IsInt()
  @Min(100)
  @Max(60000)
  latencyBudgetMs?: number;

  @IsOptional()
  @IsBoolean()
  anomalyDetection?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(1.1)
  @Max(10)
  anomalyMultiplier?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(60000)
  sliLatencyTarget?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(90)
  sliLatencyWindow?: number;

  @IsOptional()
  @IsString()
  cronExpression?: string | null;

  @IsOptional()
  @IsBoolean()
  scheduleEnabled?: boolean;

  @IsOptional()
  @IsString()
  scheduleDays?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  scheduleStartHour?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  scheduleEndHour?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  trackedHeaders?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10080)
  rtoMinutes?: number;

  @IsOptional()
  @IsUrl()
  @MaxLength(2048)
  statusWebhookUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  statusWebhookSecret?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1000)
  @Max(3600000)
  throttleMs?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(360)
  maxChecksPerHour?: number;

  @IsOptional()
  @IsBoolean()
  adaptiveIntervalEnabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(3600)
  adaptiveIntervalDownSec?: number | null;

  @IsOptional()
  @IsInt()
  @Min(15)
  @Max(3600)
  adaptiveIntervalDegradedSec?: number | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  @ArrayMaxSize(10)
  geoRegions?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(512)
  metricPath?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  metricName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  metricUnit?: string | null;

  @IsOptional()
  @IsNumber()
  metricAlertMin?: number | null;

  @IsOptional()
  @IsNumber()
  metricAlertMax?: number | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HeaderAssertionDto)
  headerAssertions?: HeaderAssertionDto[];

  // GraphQL monitor fields
  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  graphqlQuery?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(5_000)
  graphqlVariables?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  graphqlDataPath?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(1_000)
  graphqlExpectedValue?: string | null;

  @ApiPropertyOptional({ description: 'Estimated business cost per hour of downtime in USD.', minimum: 0, maximum: 1000000, example: 500 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1000000)
  downtimeCostPerHour?: number;

}

export class RunMonitorDto {
  @IsString()
  monitorId!: string;
}

export class TestVersionConnectionDto {
  @IsIn(['github', 'gitlab', 'docker', 'apt', 'npm', 'pypi', 'cargo', 'maven', 'helm'])
  provider!: 'github' | 'gitlab' | 'docker' | 'apt' | 'npm' | 'pypi' | 'cargo' | 'maven' | 'helm';

  @IsString()
  @MaxLength(1024)
  target!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  token?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  host?: string;
}

export class ImportMonitorItemDto {
  @SanitizeHtml()
  @IsString()
  @MaxLength(255)
  name!: string;

  @IsString()
  @MaxLength(1024)
  target!: string;

  @IsIn(['HTTP', 'GIT_RELEASE', 'DOCKER_IMAGE', 'TCP', 'SSL_CERT', 'HEARTBEAT', 'DNS', 'PING', 'SMTP', 'BROWSER', 'WHOIS', 'FTP', 'IMAP', 'POP3', 'CT_LOG', 'GRAPHQL', 'TRANSACTION'])
  type!: 'HTTP' | 'GIT_RELEASE' | 'DOCKER_IMAGE' | 'TCP' | 'SSL_CERT' | 'HEARTBEAT' | 'DNS' | 'PING' | 'SMTP' | 'BROWSER' | 'WHOIS' | 'FTP' | 'IMAP' | 'POP3' | 'CT_LOG' | 'GRAPHQL' | 'TRANSACTION';

  @IsOptional()
  @IsInt()
  @Min(10)
  intervalSec?: number;

  @IsOptional()
  @IsInt()
  @Min(100)
  timeoutMs?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  confirmations?: number;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class ImportMonitorsDto {
  @IsArray()
  monitors!: ImportMonitorItemDto[];
}

export class DiscoverVersionDto {
  @IsIn(['github', 'gitlab', 'docker', 'apt', 'npm', 'pypi', 'cargo', 'maven', 'helm'])
  provider!: 'github' | 'gitlab' | 'docker' | 'apt' | 'npm' | 'pypi' | 'cargo' | 'maven' | 'helm';

  @IsString()
  @MaxLength(1024)
  target!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  token?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  host?: string;

  @IsOptional()
  @IsString()
  @IsUrl()
  appUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  appToken?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  appVersionEndpoint?: string;

  @IsOptional()
  @IsIn(['none', 'token', 'openvpn'])
  appAuthType?: 'none' | 'token' | 'openvpn';

  @IsOptional()
  @IsString()
  @MaxLength(255)
  openvpnUsername?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  openvpnPassword?: string;

  /**
   * Ordered list of endpoint paths to try for app version detection.
   * Sourced from the registry entry's versionSource.endpointFallbacks.
   * Each path is tried in sequence after (or instead of) appVersionEndpoint.
   */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(512, { each: true })
  endpointFallbacks?: string[];

  /**
   * Legacy JSONPath expression (dot-notation or $. prefix) to extract version from JSON body.
   * Use jsonPathExtractors array for multiple extractors.
   * @example '$.version' or 'data.version'
   */
  @IsOptional()
  @IsString()
  @MaxLength(512)
  jsonPath?: string;

  /**
   * Ordered list of dot-notation paths to try for extracting version from JSON body.
   * First non-null semver-like result wins. Falls back to heuristic when all fail.
   * @example ['version', 'data.version', 'build.version']
   */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(256, { each: true })
  jsonPathExtractors?: string[];
}

export class BulkActionDto {
  @IsArray()
  @IsString({ each: true })
  ids!: string[];

  @IsIn(['enable', 'disable', 'delete', 'run', 'add-tag', 'remove-tag', 'update-interval', 'update-timeout', 'update-confirmations', 'pause'])
  action!: 'enable' | 'disable' | 'delete' | 'run' | 'add-tag' | 'remove-tag' | 'update-interval' | 'update-timeout' | 'update-confirmations' | 'pause';

  /** Tag ID — required when action is 'add-tag' or 'remove-tag' */
  @IsOptional()
  @IsString()
  tagId?: string;

  /** Numeric value — required when action is 'update-interval', 'update-timeout', or 'update-confirmations' */
  @IsOptional()
  @IsNumber()
  value?: number;
}

export class BulkEditDto {
  @ApiProperty({ description: 'Monitor IDs to update', type: [String] })
  @IsArray()
  @IsString({ each: true })
  ids!: string[];

  @ApiPropertyOptional({ description: 'New check interval in seconds (min 10)', minimum: 10, maximum: 86400 })
  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(86400)
  intervalSec?: number;

  @ApiPropertyOptional({ description: 'Request timeout in milliseconds (min 100)', minimum: 100 })
  @IsOptional()
  @IsInt()
  @Min(100)
  @Max(60000)
  timeoutMs?: number;

  @ApiPropertyOptional({ description: 'Consecutive failures before alerting (1-10)', minimum: 1, maximum: 10 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  confirmations?: number;

  @ApiPropertyOptional({ description: 'Auto-retry count on failure (0-3)', minimum: 0, maximum: 3 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3)
  retryCount?: number;

  @ApiPropertyOptional({ description: 'Monitor priority / criticality level: 1=P1 (critical), 2=P2 (high), 3=P3 (medium), 4=P4 (low), 0=unset', minimum: 0, maximum: 4 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(4)
  priority?: number;

  @ApiPropertyOptional({ description: 'Enable/disable flap detection' })
  @IsOptional()
  @IsBoolean()
  flapDetectionEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Latency alert threshold in ms (null to clear)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(60000)
  latencyAlertMs?: number | null;

  @ApiPropertyOptional({ description: 'SLA target uptime percentage (null to clear)', minimum: 0, maximum: 100 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  slaTarget?: number | null;

  @ApiPropertyOptional({ description: 'Enable or disable monitors' })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ description: 'Folder ID to move monitors to (null = remove from folder)', nullable: true })
  @IsOptional()
  folderId?: string | null;

  @ApiPropertyOptional({ description: 'Alert channel IDs to assign to all selected monitors (replaces existing)' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  alertChannelIds?: string[];
}

export class ImportExternalDto {
  @IsIn(['uptime-robot', 'better-uptime', 'uptime-kuma', 'csv'])
  source!: 'uptime-robot' | 'better-uptime' | 'uptime-kuma' | 'csv';

  /** Raw export payload: JSON object for uptime-robot/better-uptime/uptime-kuma, CSV string for csv. */
  @IsOptional()
  payload?: unknown;
}

export class BulkCreateFromUrlsDto {
  @ApiProperty({ type: [String], description: 'List of HTTP/HTTPS URLs to create monitors for' })
  @IsArray()
  @IsUrl({}, { each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  urls!: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  folderId?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  alertChannelIds?: string[];

  @ApiPropertyOptional({ default: 60 })
  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(3600)
  intervalSec?: number;
}

export class CreateMonitorEventDto {
  /** Short annotation label shown on the timeline */
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  message!: string;

  /** Event type for color-coding: deploy, note, incident, maintenance, config */
  @IsOptional()
  @IsIn(['deploy', 'note', 'incident', 'maintenance', 'config'])
  eventType?: 'deploy' | 'note' | 'incident' | 'maintenance' | 'config';
}

export class ImportFromComposeDto {
  @ApiProperty({ description: 'Raw YAML content of a docker-compose.yml file', maxLength: 102400 })
  @IsString()
  @MaxLength(102400)
  compose!: string;
}

export class SimulateAlertsDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  confirmations?: number;

  @IsOptional()
  @IsBoolean()
  flapDetection?: boolean;

  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(10)
  flapWindow?: number;

  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(5)
  flapThreshold?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  scheduleStartHour?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  scheduleEndHour?: number;
}

import type { Monitor, MonitorLevel } from '../types';

export interface Timings {
  dnsMs: number | null;
  tcpMs: number | null;
  tlsMs: number | null;
  ttfbMs: number | null;
  downloadMs: number | null;
}

export interface PluginExecutionContext {
  monitor: Pick<Monitor, 'id' | 'name' | 'type' | 'target' | 'timeoutMs'>;
  config: Record<string, unknown>;
  nowIso: string;
}

/** Result of a security headers audit for HTTP monitors. */
export interface SecurityHeadersAudit {
  /** Letter grade: A, B, C, D, F */
  grade: string;
  /** Score 0-100 */
  score: number;
  /** Individual header checks */
  headers: SecurityHeaderResult[];
}

export interface SecurityHeaderResult {
  name: string;
  present: boolean;
  value: string | null;
  /** Info, warning, or critical severity if missing */
  severity: 'info' | 'warning' | 'critical';
  description: string;
  recommendation?: string;
}

export interface PluginExecutionResult {
  ok: boolean;
  statusCode: number;
  latencyMs: number | null;
  message: string;
  level: MonitorLevel;
  /** First 500 chars of response body on failure, for debugging. Only populated on failed checks. */
  responseBody?: string | null;
  /** HTTP timing breakdown (DNS, TCP, TLS, TTFB, Download). Only populated for HTTP/BROWSER checks. */
  timings?: Timings | null;
  /**
   * Resolved DNS records returned from the DNS runner.
   * Used by ChecksService to detect record changes vs. stored baseline.
   * Only populated for DNS monitor type runs.
   */
  resolvedRecords?: string[] | null;
  /**
   * Security headers audit result. Only populated when `checkSecurityHeaders` is enabled on HTTP monitors.
   */
  securityHeadersAudit?: SecurityHeadersAudit | null;
  /**
   * SHA-256 hash of the response body (hex, first 64 chars).
   * Only populated for HTTP/BROWSER monitors when `detectContentChanges` is enabled.
   */
  responseBodyHash?: string | null;
  /**
   * List of URLs visited during HTTP redirect chains.
   * Only populated for HTTP/BROWSER monitors when redirects are followed.
   */
  redirectChain?: string[] | null;
}

export interface PluginConfigField {
  key: string;
  label: string;
  type: 'text' | 'number' | 'boolean';
  required?: boolean;
  placeholder?: string;
  helpText?: string;
}

export interface MonitorCheckPlugin {
  id: string;
  displayName: string;
  description?: string;
  supportedMonitorTypes: ReadonlyArray<Monitor['type']>;
  configFields?: ReadonlyArray<PluginConfigField>;
  run: (context: PluginExecutionContext) => Promise<PluginExecutionResult>;
}

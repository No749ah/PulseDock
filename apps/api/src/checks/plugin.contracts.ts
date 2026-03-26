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

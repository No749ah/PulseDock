import type { Monitor, MonitorLevel } from '../types';

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

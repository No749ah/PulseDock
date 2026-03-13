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
}

export interface MonitorCheckPlugin {
  id: string;
  displayName: string;
  supportedMonitorTypes: ReadonlyArray<Monitor['type']>;
  run: (context: PluginExecutionContext) => Promise<PluginExecutionResult>;
}

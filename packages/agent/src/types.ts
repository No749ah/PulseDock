/** A single check entry from the agent config file. */
export interface AgentCheckConfig {
  toolId: string;
  monitorId?: string;
  command?: string;
}

/** Top-level agent configuration file schema. */
export interface AgentConfigFile {
  checks: AgentCheckConfig[];
}

/** Structured log entry emitted by the agent. */
export interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  [key: string]: unknown;
}

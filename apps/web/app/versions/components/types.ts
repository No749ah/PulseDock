// Minimal ToolVariant type (mirrors packages/tool-registry/src/types.ts)
export type ToolVariant = {
  id: string;
  label: string;
  description?: string;
  requiresInstanceUrl?: boolean;
  authRequired?: boolean;
  urlPlaceholder?: string;
  evidenceUrl?: string;
  versionSource?: { type: string; urlTemplate?: string; jsonPath?: string; authRequired?: boolean; endpointFallbacks?: string[] };
  latestSource?: { type: string; target?: string };
  tags?: string[];
};

export type AlertChannelSummary = {
  id: string;
  name: string;
  type: string;
  notifyOn: string;
};

export type VersionItem = {
  id: string;
  name: string;
  type: 'GIT_RELEASE' | 'DOCKER_IMAGE';
  target: string;
  currentVersion: string;
  latestMessage: string;
  level: 'green' | 'yellow' | 'red';
  checkedAt: string | null;
  intervalSec: number;
  alertChannels?: AlertChannelSummary[];
};

export type MonitorDetails = {
  id: string;
  name: string;
  type: 'GIT_RELEASE' | 'DOCKER_IMAGE';
  target: string;
  intervalSec: number;
  timeoutMs: number;
  config: Record<string, unknown>;
  alertChannels?: AlertChannelSummary[];
};

export type AlertChannelFull = {
  id: string;
  name: string;
  type: string;
  config: Record<string, unknown>;
  createdAt: string;
  notifyOn?: string;
};

export type MonitorRun = {
  id: string;
  monitorId: string;
  checkedAt: string;
  ok: boolean;
  statusCode: number;
  latencyMs: number | null;
  message: string;
  level: 'green' | 'yellow' | 'red';
};

export type Summary = {
  stats: { total: number; green: number; yellow: number; red: number };
  items: VersionItem[];
};

// ── Tool Registry ──────────────────────────────
export type ToolEntry = {
  id: string;
  name: string;
  category: string;
  tags: string[];
  icon: string;
  description: string;
  homepage: string;
  versionSource: { type: string; target?: string; urlTemplate?: string; endpointFallbacks?: string[]; jsonPath?: string; authRequired?: boolean; agentCommand?: string; agentNote?: string };
  latestSource: { type: string; target?: string; urlTemplate?: string };
  checkInterval: number;
  requiresInstanceUrl: boolean;
  verified: boolean;
  agentInstallHint?: string;
};

export type ProviderType = 'github' | 'gitlab' | 'docker' | 'apt' | 'npm' | 'pypi' | 'cargo' | 'maven' | 'helm';

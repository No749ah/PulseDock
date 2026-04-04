import { describe, it, expect } from 'vitest';
import {
  normalizeToolQuery,
  scoreToolMatch,
  filterTools,
  closeMatchTools,
  modalProgress,
  providerFromSourceType,
  buildDockerRunSnippet,
  buildDockerComposeSnippet,
  buildShellSnippet,
} from './createVersionModalHelpers';
import type { ToolEntry } from './types';

// ── Minimal ToolEntry factory ────────────────────────────────────────────────

function makeTool(overrides: Partial<ToolEntry> & { id: string; name: string }): ToolEntry {
  return {
    id: overrides.id,
    name: overrides.name,
    description: overrides.description ?? '',
    category: overrides.category ?? 'Self-Hosted',
    tags: overrides.tags ?? [],
    verified: overrides.verified ?? false,
    icon: overrides.icon ?? '',
    versionSource: overrides.versionSource ?? {
      type: 'command',
      authRequired: false,
    },
    latestSource: overrides.latestSource ?? {
      type: 'github-releases',
      target: 'owner/repo',
    },
    requiresInstanceUrl: overrides.requiresInstanceUrl ?? false,
    checkInterval: overrides.checkInterval ?? 86400,
  } as ToolEntry;
}

// ── normalizeToolQuery ────────────────────────────────────────────────────────

describe('normalizeToolQuery', () => {
  it('lowercases the input', () => {
    expect(normalizeToolQuery('Grafana')).toBe('grafana');
  });

  it('trims leading and trailing whitespace', () => {
    expect(normalizeToolQuery('  grafana  ')).toBe('grafana');
  });

  it('collapses multiple interior spaces to one', () => {
    expect(normalizeToolQuery('home  assistant')).toBe('home assistant');
  });

  it('returns empty string for blank input', () => {
    expect(normalizeToolQuery('   ')).toBe('');
  });

  it('returns empty string for empty string', () => {
    expect(normalizeToolQuery('')).toBe('');
  });
});

// ── scoreToolMatch ─────────────────────────────────────────────────────────

describe('scoreToolMatch', () => {
  const tool = makeTool({
    id: 'grafana',
    name: 'Grafana',
    description: 'Observability and data visualization platform',
    tags: ['monitoring', 'dashboards'],
  });

  it('returns 0 for empty query (everything matches)', () => {
    expect(scoreToolMatch(tool, '')).toBe(0);
  });

  it('returns 10 for exact name match', () => {
    expect(scoreToolMatch(tool, 'grafana')).toBe(10);
  });

  it('returns 20 for name prefix match', () => {
    expect(scoreToolMatch(tool, 'grafa')).toBe(20);
  });

  it('returns 30 for name substring match', () => {
    // 'afa' is a genuine substring of 'grafana'
    expect(scoreToolMatch(tool, 'afana')).toBe(30);
  });

  it('returns 40 for exact id match', () => {
    expect(scoreToolMatch(tool, 'grafana')).toBe(10); // name wins with score 10
    const t2 = makeTool({ id: 'grf-dash', name: 'Other Tool', tags: [] });
    expect(scoreToolMatch(t2, 'grf-dash')).toBe(40);
  });

  it('returns 50 for exact tag match', () => {
    const t = makeTool({ id: 'tool-x', name: 'Tool X', tags: ['dashboards'] });
    expect(scoreToolMatch(t, 'dashboards')).toBe(50);
  });

  it('returns 60 for partial tag match', () => {
    const t = makeTool({ id: 'tool-x', name: 'Tool X', tags: ['my-dashboard-thing'] });
    expect(scoreToolMatch(t, 'dashboard')).toBe(60);
  });

  it('returns 70 for description match only', () => {
    const t = makeTool({ id: 'tool-x', name: 'Tool X', description: 'Some obscure keyword here', tags: [] });
    expect(scoreToolMatch(t, 'obscure')).toBe(70);
  });

  it('returns null when no match', () => {
    expect(scoreToolMatch(tool, 'prometheus')).toBeNull();
  });
});

// ── filterTools ───────────────────────────────────────────────────────────────

describe('filterTools', () => {
  const grafana = makeTool({ id: 'grafana', name: 'Grafana', category: 'Monitoring', tags: ['dashboards'], verified: true });
  const prometheus = makeTool({ id: 'prometheus', name: 'Prometheus', category: 'Monitoring', tags: ['metrics'], verified: false });
  const gitea = makeTool({ id: 'gitea', name: 'Gitea', category: 'Dev Tools', tags: ['git'], verified: true });
  const all = [grafana, prometheus, gitea];

  it('returns all tools when query and category are empty', () => {
    expect(filterTools(all, '', '')).toHaveLength(3);
  });

  it('filters by category', () => {
    const result = filterTools(all, '', 'Monitoring');
    expect(result).toHaveLength(2);
    expect(result.map((t) => t.id)).toContain('grafana');
    expect(result.map((t) => t.id)).toContain('prometheus');
  });

  it('filters by query (exact name)', () => {
    const result = filterTools(all, 'grafana', '');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('grafana');
  });

  it('filters by query (prefix)', () => {
    const result = filterTools(all, 'gra', '');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('grafana');
  });

  it('filters by query AND category', () => {
    const extra = makeTool({ id: 'grafana-loki', name: 'Grafana Loki', category: 'Dev Tools', tags: [] });
    const extended = [...all, extra];
    const result = filterTools(extended, 'grafana', 'Monitoring');
    expect(result.every((t) => t.category === 'Monitoring')).toBe(true);
    expect(result.some((t) => t.id === 'grafana-loki')).toBe(false);
  });

  it('returns empty array when nothing matches', () => {
    expect(filterTools(all, 'kubernetes', '')).toHaveLength(0);
  });

  it('sorts verified before unverified on same relevance score', () => {
    // Both match by substring "mon" but grafana is verified, prometheus is not
    const monTool1 = makeTool({ id: 'monitoring-a', name: 'Monitoring A', verified: false, tags: [] });
    const monTool2 = makeTool({ id: 'monitoring-b', name: 'Monitoring B', verified: true, tags: [] });
    const result = filterTools([monTool1, monTool2], 'monitoring', '');
    expect(result[0].verified).toBe(true);
  });

  it('sorts alphabetically when score and verified are equal', () => {
    const apple = makeTool({ id: 'apple-mon', name: 'Apple Mon', verified: false, tags: [] });
    const banana = makeTool({ id: 'banana-mon', name: 'Banana Mon', verified: false, tags: [] });
    const result = filterTools([banana, apple], 'mon', '');
    expect(result[0].name).toBe('Apple Mon');
  });
});

// ── closeMatchTools ───────────────────────────────────────────────────────────

describe('closeMatchTools', () => {
  const tools = [
    makeTool({ id: 'home-assistant', name: 'Home Assistant', tags: ['smart-home'] }),
    makeTool({ id: 'homebridge', name: 'Homebridge', tags: ['smart-home'] }),
    makeTool({ id: 'homeserver', name: 'HomeServer', tags: [] }),
    makeTool({ id: 'unrelated', name: 'Unrelated', tags: [] }),
    makeTool({ id: 'another-home', name: 'Another Home Thing', tags: [] }),
  ];

  it('returns empty array for empty query', () => {
    expect(closeMatchTools(tools, '')).toHaveLength(0);
  });

  it('finds tools by name substring', () => {
    const result = closeMatchTools(tools, 'home');
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((t) => t.name.toLowerCase().includes('home') || t.id.includes('home'))).toBe(true);
  });

  it('respects the limit parameter', () => {
    const result = closeMatchTools(tools, 'home', 2);
    expect(result.length).toBeLessThanOrEqual(2);
  });

  it('defaults to limit 4', () => {
    const result = closeMatchTools(tools, 'home');
    expect(result.length).toBeLessThanOrEqual(4);
  });

  it('finds tools by tag', () => {
    const result = closeMatchTools(tools, 'smart-home');
    expect(result.some((t) => t.id === 'home-assistant')).toBe(true);
    expect(result.some((t) => t.id === 'homebridge')).toBe(true);
  });
});

// ── modalProgress ─────────────────────────────────────────────────────────────

describe('modalProgress', () => {
  it('returns 0 on tool-picker screen (createStep = -1)', () => {
    expect(modalProgress(-1)).toBe(0);
  });

  it('returns 25% on step 0 of 4', () => {
    expect(modalProgress(0)).toBe(25);
  });

  it('returns 50% on step 1 of 4', () => {
    expect(modalProgress(1)).toBe(50);
  });

  it('returns 75% on step 2 of 4', () => {
    expect(modalProgress(2)).toBe(75);
  });

  it('returns 100% on step 3 of 4', () => {
    expect(modalProgress(3)).toBe(100);
  });

  it('supports custom totalSteps', () => {
    expect(modalProgress(0, 2)).toBe(50);
    expect(modalProgress(1, 2)).toBe(100);
  });
});

// ── providerFromSourceType ────────────────────────────────────────────────────

describe('providerFromSourceType', () => {
  it.each([
    ['github-releases', 'github'],
    ['github-tags', 'github'],
    ['gitlab-releases', 'gitlab'],
    ['docker-hub', 'docker'],
    ['npm-registry', 'npm'],
    ['pypi', 'pypi'],
    ['apt-release', 'apt'],
    ['cargo', 'cargo'],
    ['maven-central', 'maven'],
    ['helm-chart', 'helm'],
  ] as const)('maps %s → %s', (input, expected) => {
    expect(providerFromSourceType(input)).toBe(expected);
  });

  it('falls back to github for unknown source types', () => {
    expect(providerFromSourceType('unknown-registry')).toBe('github');
    expect(providerFromSourceType('')).toBe('github');
  });
});

// ── buildDockerRunSnippet ─────────────────────────────────────────────────────

describe('buildDockerRunSnippet', () => {
  const params = {
    pulsedockUrl: 'https://pd.example.com',
    apiKeyDisplay: 'pd_abc123...',
    toolSlug: 'grafana',
    toolName: 'Grafana',
  };

  it('starts with docker run -d', () => {
    expect(buildDockerRunSnippet(params)).toMatch(/^docker run -d/);
  });

  it('includes the PULSEDOCK_URL', () => {
    expect(buildDockerRunSnippet(params)).toContain('PULSEDOCK_URL=https://pd.example.com');
  });

  it('includes the API key', () => {
    expect(buildDockerRunSnippet(params)).toContain('PULSEDOCK_API_KEY=pd_abc123...');
  });

  it('includes the tool slug', () => {
    expect(buildDockerRunSnippet(params)).toContain('AGENT_TOOL_IDS=grafana');
  });

  it('includes restart policy', () => {
    expect(buildDockerRunSnippet(params)).toContain('--restart unless-stopped');
  });

  it('references the agent image', () => {
    expect(buildDockerRunSnippet(params)).toContain('pulsedock/agent:latest');
  });
});

// ── buildDockerComposeSnippet ─────────────────────────────────────────────────

describe('buildDockerComposeSnippet', () => {
  const params = {
    pulsedockUrl: 'https://pd.example.com',
    apiKeyDisplay: 'pd_key...',
    toolSlug: 'prometheus',
    toolName: 'Prometheus',
  };

  it('starts with "services:"', () => {
    expect(buildDockerComposeSnippet(params)).toMatch(/^services:/);
  });

  it('includes the pulsedock-agent service name', () => {
    expect(buildDockerComposeSnippet(params)).toContain('pulsedock-agent');
  });

  it('sets PULSEDOCK_URL', () => {
    expect(buildDockerComposeSnippet(params)).toContain('PULSEDOCK_URL: https://pd.example.com');
  });

  it('sets PULSEDOCK_API_KEY', () => {
    expect(buildDockerComposeSnippet(params)).toContain('PULSEDOCK_API_KEY: pd_key...');
  });

  it('sets AGENT_TOOL_IDS', () => {
    expect(buildDockerComposeSnippet(params)).toContain('AGENT_TOOL_IDS: prometheus');
  });

  it('sets AGENT_INTERVAL_SEC', () => {
    expect(buildDockerComposeSnippet(params)).toContain('AGENT_INTERVAL_SEC: "3600"');
  });
});

// ── buildShellSnippet ─────────────────────────────────────────────────────────

describe('buildShellSnippet', () => {
  const base = {
    pulsedockUrl: 'https://pd.example.com',
    apiKeyDisplay: 'pd_key...',
    toolSlug: 'homeassistant',
    toolName: 'Home Assistant',
  };

  it('starts with a bash shebang', () => {
    expect(buildShellSnippet(base)).toMatch(/^#!\/bin\/bash/);
  });

  it('includes the tool name in the header comment', () => {
    expect(buildShellSnippet(base)).toContain('Home Assistant');
  });

  it('sets PULSEDOCK_URL variable', () => {
    expect(buildShellSnippet(base)).toContain(`PULSEDOCK_URL="https://pd.example.com"`);
  });

  it('sets PULSEDOCK_API_KEY variable', () => {
    expect(buildShellSnippet(base)).toContain(`PULSEDOCK_API_KEY="pd_key..."`);
  });

  it('uses fallback version detection when no agentCommand provided', () => {
    expect(buildShellSnippet(base)).toContain('your-tool --version');
  });

  it('uses agentCommand when provided', () => {
    const withCmd = { ...base, agentCommand: 'ha --version | cut -d" " -f3' };
    const snippet = buildShellSnippet(withCmd);
    expect(snippet).toContain('ha --version | cut -d" " -f3');
    expect(snippet).not.toContain('your-tool');
  });

  it('includes the tool slug in the API call JSON', () => {
    expect(buildShellSnippet(base)).toContain('homeassistant');
  });

  it('calls the /v1/agent/report endpoint', () => {
    expect(buildShellSnippet(base)).toContain('/v1/agent/report');
  });
});

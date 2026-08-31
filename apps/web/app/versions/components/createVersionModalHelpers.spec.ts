/**
 * Unit tests for createVersionModalHelpers.ts
 * All functions are pure — no browser/React dependencies.
 */
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

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeTool(overrides: Partial<ToolEntry> = {}): ToolEntry {
  return {
    id: 'my-tool',
    name: 'My Tool',
    category: 'Container',
    tags: ['docker', 'cli'],
    icon: 'https://example.com/icon.svg',
    description: 'A sample tool for testing',
    homepage: 'https://example.com',
    versionSource: { type: 'json-path' },
    latestSource: { type: 'github-releases', target: 'org/repo' },
    verified: false,
    verificationStatus: 'unverified',
    ...overrides,
  } as ToolEntry;
}

// ── normalizeToolQuery ────────────────────────────────────────────────────────

describe('normalizeToolQuery', () => {
  it('lowercases the input', () => {
    expect(normalizeToolQuery('Docker')).toBe('docker');
  });

  it('trims leading and trailing whitespace', () => {
    expect(normalizeToolQuery('  nginx  ')).toBe('nginx');
  });

  it('collapses multiple internal spaces to one', () => {
    expect(normalizeToolQuery('my   tool')).toBe('my tool');
  });

  it('handles an empty string', () => {
    expect(normalizeToolQuery('')).toBe('');
  });

  it('handles a string that is only whitespace', () => {
    expect(normalizeToolQuery('   ')).toBe('');
  });

  it('lowercases and trims together', () => {
    expect(normalizeToolQuery('  NGINX  ')).toBe('nginx');
  });
});

// ── scoreToolMatch ────────────────────────────────────────────────────────────

describe('scoreToolMatch', () => {
  it('returns 0 for empty query (everything matches)', () => {
    const tool = makeTool({ name: 'Portainer', id: 'portainer' });
    expect(scoreToolMatch(tool, '')).toBe(0);
  });

  it('returns 10 for exact name match', () => {
    const tool = makeTool({ name: 'Docker', id: 'docker' });
    expect(scoreToolMatch(tool, 'docker')).toBe(10);
  });

  it('returns 20 for name prefix match', () => {
    const tool = makeTool({ name: 'Docker Desktop', id: 'docker-desktop' });
    expect(scoreToolMatch(tool, 'docker')).toBe(20);
  });

  it('returns 30 for name substring match', () => {
    const tool = makeTool({ name: 'My Docker Tool', id: 'my-docker-tool' });
    expect(scoreToolMatch(tool, 'docker')).toBe(30);
  });

  it('returns 40 for exact id match', () => {
    const tool = makeTool({ name: 'Something Else', id: 'docker' });
    expect(scoreToolMatch(tool, 'docker')).toBe(40);
  });

  it('returns 50 for exact tag match', () => {
    const tool = makeTool({ name: 'Something', id: 'other', tags: ['docker', 'cli'] });
    expect(scoreToolMatch(tool, 'docker')).toBe(50);
  });

  it('returns 60 for partial tag match', () => {
    const tool = makeTool({ name: 'Something', id: 'other', tags: ['docker-compose'] });
    expect(scoreToolMatch(tool, 'docker')).toBe(60);
  });

  it('returns 70 for description-only match', () => {
    const tool = makeTool({ name: 'Nginx', id: 'nginx', tags: ['web'], description: 'Uses docker under the hood' });
    expect(scoreToolMatch(tool, 'docker')).toBe(70);
  });

  it('returns null when there is no match', () => {
    const tool = makeTool({ name: 'Redis', id: 'redis', tags: ['cache'], description: 'In-memory store' });
    expect(scoreToolMatch(tool, 'docker')).toBeNull();
  });

  it('is case-sensitive: query must already be normalised', () => {
    // The function receives a normalised (lowercase) query; passing uppercase means no exact match
    const tool = makeTool({ name: 'docker', id: 'docker' });
    expect(scoreToolMatch(tool, 'DOCKER')).toBeNull();
  });
});

// ── filterTools ───────────────────────────────────────────────────────────────

describe('filterTools', () => {
  const tools: ToolEntry[] = [
    makeTool({ id: 'portainer', name: 'Portainer', category: 'Container', tags: ['docker'], verified: true }),
    makeTool({ id: 'nginx', name: 'Nginx', category: 'Web', tags: ['http', 'proxy'], verified: false }),
    makeTool({ id: 'redis', name: 'Redis', category: 'Database', tags: ['cache'], verified: false }),
    makeTool({ id: 'docker-engine', name: 'Docker Engine', category: 'Container', tags: ['docker', 'runtime'], verified: false }),
  ];

  it('returns all tools when query and category are both empty', () => {
    expect(filterTools(tools, '', '')).toHaveLength(4);
  });

  it('filters by category when no query', () => {
    const result = filterTools(tools, '', 'Container');
    expect(result.map((t) => t.id)).toEqual(['portainer', 'docker-engine']);
  });

  it('returns matching tools sorted by relevance score', () => {
    // 'docker' matches portainer (tag exact=50), docker-engine (name prefix=20)
    const result = filterTools(tools, 'docker', '');
    // docker-engine has score 20 (name prefix) → comes first; portainer has 50 (tag exact)
    expect(result[0].id).toBe('docker-engine');
    expect(result[1].id).toBe('portainer');
  });

  it('returns empty array when nothing matches', () => {
    expect(filterTools(tools, 'kubernetes', '')).toHaveLength(0);
  });

  it('applies category filter before query ranking', () => {
    const result = filterTools(tools, 'docker', 'Container');
    // Only Container tools reach the query filter
    expect(result.every((t) => t.category === 'Container')).toBe(true);
  });

  it('breaks score ties by verified-first then alpha', () => {
    const tied: ToolEntry[] = [
      makeTool({ id: 'b-tool', name: 'b-tool', category: 'Other', tags: ['some-docker-tag'], verified: false }),
      makeTool({ id: 'a-tool', name: 'a-tool', category: 'Other', tags: ['some-docker-tag'], verified: true }),
    ];
    const result = filterTools(tied, 'some-docker-tag', '');
    // Both score 50 (exact tag), verified tool should come first
    expect(result[0].id).toBe('a-tool');
  });
});

// ── closeMatchTools ───────────────────────────────────────────────────────────

describe('closeMatchTools', () => {
  const tools: ToolEntry[] = [
    makeTool({ id: 'docker-engine', name: 'Docker Engine', tags: ['container'] }),
    makeTool({ id: 'portainer', name: 'Portainer', tags: ['docker'] }),
    makeTool({ id: 'redis', name: 'Redis', tags: ['cache'] }),
    makeTool({ id: 'nginx', name: 'Nginx', tags: ['web'] }),
    makeTool({ id: 'cadvisor', name: 'cAdvisor', tags: ['docker', 'monitoring'] }),
  ];

  it('returns empty array for empty query', () => {
    expect(closeMatchTools(tools, '')).toHaveLength(0);
  });

  it('returns tools whose name includes the query', () => {
    const result = closeMatchTools(tools, 'docker');
    expect(result.map((t) => t.id)).toContain('docker-engine');
  });

  it('returns tools whose tags include the query', () => {
    const result = closeMatchTools(tools, 'docker');
    expect(result.map((t) => t.id)).toContain('portainer');
    expect(result.map((t) => t.id)).toContain('cadvisor');
  });

  it('honours the limit parameter', () => {
    const result = closeMatchTools(tools, 'docker', 2);
    expect(result).toHaveLength(2);
  });

  it('defaults to limit=4', () => {
    // five tools could match 'docker' via name/tag/id, but limit is 4
    const result = closeMatchTools(tools, 'docker');
    expect(result.length).toBeLessThanOrEqual(4);
  });

  it('returns empty when nothing matches', () => {
    expect(closeMatchTools(tools, 'kubernetes')).toHaveLength(0);
  });
});

// ── modalProgress ─────────────────────────────────────────────────────────────

describe('modalProgress', () => {
  it('returns 0 on the tool-picker screen (createStep = -1)', () => {
    expect(modalProgress(-1)).toBe(0);
  });

  it('returns 25 on step 0 of 4', () => {
    expect(modalProgress(0)).toBe(25);
  });

  it('returns 50 on step 1 of 4', () => {
    expect(modalProgress(1)).toBe(50);
  });

  it('returns 75 on step 2 of 4', () => {
    expect(modalProgress(2)).toBe(75);
  });

  it('returns 100 on step 3 of 4', () => {
    expect(modalProgress(3)).toBe(100);
  });

  it('respects a custom totalSteps value', () => {
    expect(modalProgress(0, 2)).toBe(50);
    expect(modalProgress(1, 2)).toBe(100);
  });
});

// ── providerFromSourceType ────────────────────────────────────────────────────

describe('providerFromSourceType', () => {
  it('maps github-releases to github', () => {
    expect(providerFromSourceType('github-releases')).toBe('github');
  });

  it('maps github-tags to github', () => {
    expect(providerFromSourceType('github-tags')).toBe('github');
  });

  it('maps gitlab-releases to gitlab', () => {
    expect(providerFromSourceType('gitlab-releases')).toBe('gitlab');
  });

  it('maps docker-hub to docker', () => {
    expect(providerFromSourceType('docker-hub')).toBe('docker');
  });

  it('maps npm-registry to npm', () => {
    expect(providerFromSourceType('npm-registry')).toBe('npm');
  });

  it('maps pypi to pypi', () => {
    expect(providerFromSourceType('pypi')).toBe('pypi');
  });

  it('maps apt-release to apt', () => {
    expect(providerFromSourceType('apt-release')).toBe('apt');
  });

  it('maps cargo to cargo', () => {
    expect(providerFromSourceType('cargo')).toBe('cargo');
  });

  it('maps maven-central to maven', () => {
    expect(providerFromSourceType('maven-central')).toBe('maven');
  });

  it('maps helm-chart to helm', () => {
    expect(providerFromSourceType('helm-chart')).toBe('helm');
  });

  it('falls back to github for unknown types', () => {
    expect(providerFromSourceType('unknown-type')).toBe('github');
    expect(providerFromSourceType('')).toBe('github');
  });
});

// ── buildDockerRunSnippet ─────────────────────────────────────────────────────

describe('buildDockerRunSnippet', () => {
  const params = {
    pulsedockUrl: 'https://app.example.com',
    apiKeyDisplay: 'pd_key_xxx',
    toolSlug: 'my-tool',
    toolName: 'My Tool',
  };

  it('includes the PULSEDOCK_URL env var', () => {
    expect(buildDockerRunSnippet(params)).toContain('PULSEDOCK_URL=https://app.example.com');
  });

  it('includes the PULSEDOCK_API_KEY env var', () => {
    expect(buildDockerRunSnippet(params)).toContain('PULSEDOCK_API_KEY=pd_key_xxx');
  });

  it('includes the AGENT_TOOL_IDS env var with the slug', () => {
    expect(buildDockerRunSnippet(params)).toContain('AGENT_TOOL_IDS=my-tool');
  });

  it('includes the pulsedock/agent:latest image reference', () => {
    expect(buildDockerRunSnippet(params)).toContain('pulsedock/agent:latest');
  });

  it('includes the --restart unless-stopped flag', () => {
    expect(buildDockerRunSnippet(params)).toContain('--restart unless-stopped');
  });

  it('is a multi-line string (uses backslash continuation)', () => {
    expect(buildDockerRunSnippet(params)).toContain('\\\n');
  });
});

// ── buildDockerComposeSnippet ─────────────────────────────────────────────────

describe('buildDockerComposeSnippet', () => {
  const params = {
    pulsedockUrl: 'https://app.example.com',
    apiKeyDisplay: 'pd_key_xxx',
    toolSlug: 'my-tool',
    toolName: 'My Tool',
  };

  it('starts with services:', () => {
    expect(buildDockerComposeSnippet(params)).toMatch(/^services:/);
  });

  it('includes the pulsedock-agent service name', () => {
    expect(buildDockerComposeSnippet(params)).toContain('pulsedock-agent:');
  });

  it('includes the pulsedock/agent:latest image', () => {
    expect(buildDockerComposeSnippet(params)).toContain('image: pulsedock/agent:latest');
  });

  it('includes the PULSEDOCK_URL env var', () => {
    expect(buildDockerComposeSnippet(params)).toContain('PULSEDOCK_URL: https://app.example.com');
  });

  it('includes the PULSEDOCK_API_KEY env var', () => {
    expect(buildDockerComposeSnippet(params)).toContain('PULSEDOCK_API_KEY: pd_key_xxx');
  });

  it('includes the AGENT_TOOL_IDS env var', () => {
    expect(buildDockerComposeSnippet(params)).toContain('AGENT_TOOL_IDS: my-tool');
  });

  it('includes restart: unless-stopped', () => {
    expect(buildDockerComposeSnippet(params)).toContain('restart: unless-stopped');
  });
});

// ── buildShellSnippet ─────────────────────────────────────────────────────────

describe('buildShellSnippet', () => {
  const base = {
    pulsedockUrl: 'https://app.example.com',
    apiKeyDisplay: 'pd_key_xxx',
    toolSlug: 'my-tool',
    toolName: 'My Tool',
  };

  it('starts with a shebang', () => {
    expect(buildShellSnippet(base)).toMatch(/^#!\/bin\/bash/);
  });

  it('includes the PULSEDOCK_URL variable', () => {
    expect(buildShellSnippet(base)).toContain('PULSEDOCK_URL="https://app.example.com"');
  });

  it('includes the PULSEDOCK_API_KEY variable', () => {
    expect(buildShellSnippet(base)).toContain('PULSEDOCK_API_KEY="pd_key_xxx"');
  });

  it('includes the curl POST to the agent report endpoint', () => {
    expect(buildShellSnippet(base)).toContain('/v1/agent/report');
  });

  it('uses the placeholder VERSION line when agentCommand is not provided', () => {
    expect(buildShellSnippet(base)).toContain('your-tool --version');
  });

  it('uses the agentCommand when provided', () => {
    const p = { ...base, agentCommand: 'my-tool --version 2>&1' };
    expect(buildShellSnippet(p)).toContain('VERSION=$(my-tool --version 2>&1)');
    expect(buildShellSnippet(p)).not.toContain('your-tool');
  });

  it('embeds the tool slug in the JSON payload', () => {
    expect(buildShellSnippet(base)).toContain('my-tool');
  });

  it('includes the tool name in the comment header', () => {
    expect(buildShellSnippet(base)).toContain('My Tool');
  });
});

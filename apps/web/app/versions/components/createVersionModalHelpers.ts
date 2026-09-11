/**
 * Pure helper functions for the CreateVersionModal component.
 * Extracted for testability — no browser/React dependencies.
 */

import type { ToolEntry, ProviderType } from './types';

// ── Query normalisation ───────────────────────────────────────────────────────

/**
 * Normalise a raw search string into a lowercase, trimmed, single-space query.
 */
export function normalizeToolQuery(raw: string): string {
  return raw.toLowerCase().trim().replace(/\s+/g, ' ');
}

// ── Tool filtering & ranking ──────────────────────────────────────────────────

/**
 * Score a tool against a normalised query. Lower score = higher relevance.
 * Returns `null` when the tool does not match at all.
 */
export function scoreToolMatch(tool: ToolEntry, normalizedQuery: string): number | null {
  if (!normalizedQuery) return 0; // everything matches
  const tName = tool.name.toLowerCase();
  const id = tool.id.toLowerCase();
  const desc = tool.description.toLowerCase();
  const matchesCat = true; // category filtering is a caller concern
  if (!matchesCat) return null;
  const matches =
    tName === normalizedQuery ||
    tName.startsWith(normalizedQuery) ||
    tName.includes(normalizedQuery) ||
    id === normalizedQuery ||
    id.startsWith(normalizedQuery) ||
    tool.tags.some((tag) => tag.toLowerCase() === normalizedQuery || tag.toLowerCase().includes(normalizedQuery)) ||
    desc.includes(normalizedQuery);
  if (!matches) return null;
  if (tName === normalizedQuery) return 10;
  if (tName.startsWith(normalizedQuery)) return 20;
  if (tName.includes(normalizedQuery)) return 30;
  if (id === normalizedQuery || id.startsWith(normalizedQuery)) return 40;
  if (tool.tags.some((tag) => tag.toLowerCase() === normalizedQuery)) return 50;
  if (tool.tags.some((tag) => tag.toLowerCase().includes(normalizedQuery))) return 60;
  return 70; // description match
}

/**
 * Filter and rank tools from the registry.
 *
 * Rules:
 * - If no query and no category → return all tools unsorted
 * - If only category → return tools in that category unsorted
 * - If query → filter by match, sort by relevance score then verified-first then alpha
 */
export function filterTools(
  tools: ToolEntry[],
  normalizedQuery: string,
  category: string,
): ToolEntry[] {
  let result = tools;

  // Category filter
  if (category) {
    result = result.filter((t) => t.category === category);
  }

  // Query filter
  if (!normalizedQuery) return result;

  const scored: Array<{ tool: ToolEntry; score: number }> = [];
  for (const t of result) {
    const s = scoreToolMatch(t, normalizedQuery);
    if (s !== null) {
      scored.push({ tool: t, score: s });
    }
  }

  return scored
    .sort((a, b) => {
      if (a.score !== b.score) return a.score - b.score;
      if (a.tool.verified !== b.tool.verified) return a.tool.verified ? -1 : 1;
      return a.tool.name.localeCompare(b.tool.name);
    })
    .map((x) => x.tool);
}

/**
 * Compute "close match" suggestions shown when the main filtered list is empty.
 */
export function closeMatchTools(
  tools: ToolEntry[],
  normalizedQuery: string,
  limit = 4,
): ToolEntry[] {
  if (!normalizedQuery) return [];
  return tools
    .filter((t) => {
      const tName = t.name.toLowerCase();
      const id = t.id.toLowerCase();
      return (
        tName.includes(normalizedQuery) ||
        id.includes(normalizedQuery) ||
        t.tags.some((tag) => tag.toLowerCase().includes(normalizedQuery))
      );
    })
    .slice(0, limit);
}

// ── Modal progress ────────────────────────────────────────────────────────────

/**
 * Returns 0-100 progress percentage for the 4-step creation wizard.
 * `createStep` is -1 on the tool-picker screen and 0–3 during the steps.
 */
export function modalProgress(createStep: number, totalSteps = 4): number {
  if (createStep < 0) return 0;
  return ((createStep + 1) / totalSteps) * 100;
}

// ── Provider mapping ──────────────────────────────────────────────────────────

const PROVIDER_MAP: Record<string, ProviderType> = {
  'github-releases': 'github',
  'github-tags': 'github',
  'gitlab-releases': 'gitlab',
  'docker-hub': 'docker',
  'npm-registry': 'npm',
  pypi: 'pypi',
  'apt-release': 'apt',
  cargo: 'cargo',
  'maven-central': 'maven',
  'helm-chart': 'helm',
};

/**
 * Map a tool's `latestSource.type` string to a ProviderType.
 * Falls back to `'github'` for unknown types.
 */
export function providerFromSourceType(sourceType: string): ProviderType {
  return PROVIDER_MAP[sourceType] ?? 'github';
}

// ── Agent snippet builders ────────────────────────────────────────────────────

export interface AgentSnippetParams {
  pulsedockUrl: string;
  apiKeyDisplay: string;
  toolSlug: string;
  toolName: string;
  agentCommand?: string;
}

/**
 * Build a `docker run` snippet for the PulseDock Agent.
 */
export function buildDockerRunSnippet(p: AgentSnippetParams): string {
  return [
    `docker run -d \\`,
    `  --name pulsedock-agent \\`,
    `  -e PULSEDOCK_URL=${p.pulsedockUrl} \\`,
    `  -e PULSEDOCK_API_KEY=${p.apiKeyDisplay} \\`,
    `  -e AGENT_TOOL_IDS=${p.toolSlug} \\`,
    `  --restart unless-stopped \\`,
    `  pulsedock/agent:latest`,
  ].join('\n');
}

/**
 * Build a Docker Compose service snippet for the PulseDock Agent.
 */
export function buildDockerComposeSnippet(p: AgentSnippetParams): string {
  return [
    `services:`,
    `  pulsedock-agent:`,
    `    image: pulsedock/agent:latest`,
    `    container_name: pulsedock-agent`,
    `    restart: unless-stopped`,
    `    environment:`,
    `      PULSEDOCK_URL: ${p.pulsedockUrl}`,
    `      PULSEDOCK_API_KEY: ${p.apiKeyDisplay}`,
    `      AGENT_TOOL_IDS: ${p.toolSlug}`,
    `      AGENT_INTERVAL_SEC: "3600"`,
  ].join('\n');
}

/**
 * Build a one-shot shell script snippet for the PulseDock Agent.
 */
export function buildShellSnippet(p: AgentSnippetParams): string {
  const versionLine = p.agentCommand
    ? `VERSION=$(${p.agentCommand})`
    : `VERSION=$(your-tool --version 2>&1 | grep -oP '\\d+\\.\\d+\\.\\d+')`;
  return [
    `#!/bin/bash`,
    `# PulseDock Agent — one-shot shell check for ${p.toolName}`,
    `PULSEDOCK_URL="${p.pulsedockUrl}"`,
    `PULSEDOCK_API_KEY="${p.apiKeyDisplay}"`,
    versionLine,
    `curl -s -X POST "$PULSEDOCK_URL/v1/agent/report" \\`,
    `  -H "Authorization: Bearer $PULSEDOCK_API_KEY" \\`,
    `  -H "Content-Type: application/json" \\`,
    `  -d "{\\\"toolId\\\":\\\"${p.toolSlug}\\\",\\\"version\\\":\\\"$VERSION\\\"}"`,
  ].join('\n');
}

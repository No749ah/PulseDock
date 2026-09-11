import fs from 'fs';
import path from 'path';
import http from 'http';
import { TOOL_REGISTRY } from '../src/registry';
import type { ToolRegistryEntry, VersionSource } from '../src/types';

interface MockCase {
  id: string;
  toolId: string;
  expectedVersion: string;
  responses: Record<string, { status?: number; body?: unknown; headers?: Record<string, string> }>;
  expectPaths: string[];
}

interface CaseResult {
  id: string;
  toolId: string;
  ok: boolean;
  expectedVersion: string;
  detectedVersion: string | null;
  requestedPaths: string[];
  error?: string;
}

function findTool(toolId: string): ToolRegistryEntry {
  const tool = TOOL_REGISTRY.find((entry) => entry.id === toolId);
  if (!tool) {
    throw new Error(`Tool not found in registry: ${toolId}`);
  }
  return tool;
}

function normalizePath(urlPathOrAbsolute: string): string {
  if (urlPathOrAbsolute.startsWith('http://') || urlPathOrAbsolute.startsWith('https://')) {
    return new URL(urlPathOrAbsolute).pathname + (new URL(urlPathOrAbsolute).search || '');
  }
  return urlPathOrAbsolute.startsWith('/') ? urlPathOrAbsolute : `/${urlPathOrAbsolute}`;
}

function extractByPath(body: unknown, jsonPath?: string): string | null {
  if (!jsonPath || !jsonPath.startsWith('$.')) return null;
  const parts = jsonPath.slice(2).split('.').filter(Boolean);
  let cursor: unknown = body;

  for (const part of parts) {
    if (!cursor || typeof cursor !== 'object') return null;
    cursor = (cursor as Record<string, unknown>)[part];
  }

  if (typeof cursor === 'string' || typeof cursor === 'number') {
    return String(cursor);
  }

  return null;
}

function extractWithFallback(body: unknown, source: VersionSource): string | null {
  const primary = extractByPath(body, source.jsonPath);
  if (primary) return primary;

  for (const extractor of source.jsonPathExtractors ?? []) {
    const viaExtractor = extractByPath(body, extractor.startsWith('$.') ? extractor : `$.${extractor}`);
    if (viaExtractor) return viaExtractor;
  }

  return null;
}

function stripVPrefix(version: string): string {
  return version.trim().replace(/^v(?=\d)/i, '');
}

async function fetchJson(url: string): Promise<{ status: number; body: unknown }> {
  const response = await fetch(url);
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    return { status: response.status, body: null };
  }
  const body = await response.json();
  return { status: response.status, body };
}

function resolveCandidateUrls(baseUrl: string, source: VersionSource): string[] {
  const urls: string[] = [];
  if (source.urlTemplate) {
    urls.push(source.urlTemplate.replace('{{instanceUrl}}', baseUrl));
  }

  for (const candidate of source.endpointFallbacks ?? []) {
    if (candidate.startsWith('http://') || candidate.startsWith('https://')) {
      urls.push(candidate);
    } else {
      urls.push(`${baseUrl}${candidate.startsWith('/') ? candidate : `/${candidate}`}`);
    }
  }

  return [...new Set(urls)];
}

async function detectVersion(baseUrl: string, source: VersionSource): Promise<{ detectedVersion: string | null; requestedPaths: string[] }> {
  const requestedPaths: string[] = [];
  const candidates = resolveCandidateUrls(baseUrl, source);

  for (const candidate of candidates) {
    const parsed = new URL(candidate);
    requestedPaths.push(parsed.pathname + parsed.search);

    try {
      const { status, body } = await fetchJson(candidate);
      if (status < 200 || status >= 300) continue;
      const extracted = extractWithFallback(body, source);
      if (extracted) {
        return { detectedVersion: stripVPrefix(extracted), requestedPaths };
      }
    } catch {
      // Keep trying fallback candidates.
    }
  }

  return { detectedVersion: null, requestedPaths };
}

async function withMockServer(
  responses: MockCase['responses'],
  run: (baseUrl: string) => Promise<{ detectedVersion: string | null; requestedPaths: string[] }>,
): Promise<{ detectedVersion: string | null; requestedPaths: string[] }> {
  const server = http.createServer((req, res) => {
    const pathWithQuery = req.url ?? '/';
    const route = responses[pathWithQuery] ?? responses[new URL(`http://localhost${pathWithQuery}`).pathname];
    if (!route) {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'not found' }));
      return;
    }

    const status = route.status ?? 200;
    const headers = { 'content-type': 'application/json', ...(route.headers ?? {}) };
    res.writeHead(status, headers);
    res.end(JSON.stringify(route.body ?? {}));
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));

  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Failed to bind mock server');
    const baseUrl = `http://127.0.0.1:${address.port}`;
    return await run(baseUrl);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
}

async function runCase(testCase: MockCase): Promise<CaseResult> {
  const tool = findTool(testCase.toolId);
  const source = tool.versionSource;

  if (!source.urlTemplate?.includes('{{instanceUrl}}')) {
    return {
      id: testCase.id,
      toolId: testCase.toolId,
      ok: false,
      expectedVersion: testCase.expectedVersion,
      detectedVersion: null,
      requestedPaths: [],
      error: 'Tool versionSource has no instanceUrl template',
    };
  }

  try {
    const { detectedVersion, requestedPaths } = await withMockServer(testCase.responses, (baseUrl) =>
      detectVersion(baseUrl, source),
    );

    const requestedMatches = JSON.stringify(requestedPaths) === JSON.stringify(testCase.expectPaths);
    const versionMatches = detectedVersion === testCase.expectedVersion;

    return {
      id: testCase.id,
      toolId: testCase.toolId,
      ok: requestedMatches && versionMatches,
      expectedVersion: testCase.expectedVersion,
      detectedVersion,
      requestedPaths,
      error: !requestedMatches
        ? `Expected requested paths ${JSON.stringify(testCase.expectPaths)} but got ${JSON.stringify(requestedPaths)}`
        : !versionMatches
          ? `Expected version ${testCase.expectedVersion} but got ${detectedVersion}`
          : undefined,
    };
  } catch (error) {
    return {
      id: testCase.id,
      toolId: testCase.toolId,
      ok: false,
      expectedVersion: testCase.expectedVersion,
      detectedVersion: null,
      requestedPaths: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main(): Promise<void> {
  const cases: MockCase[] = [
    {
      id: 'portainer-primary-endpoint',
      toolId: 'portainer',
      expectedVersion: '2.20.3',
      responses: {
        '/api/status': { body: { Version: '2.20.3' } },
      },
      expectPaths: ['/api/status'],
    },
    {
      id: 'grafana-fallback-endpoint',
      toolId: 'grafana',
      expectedVersion: '10.4.1',
      responses: {
        '/api/health': { status: 404, body: { message: 'missing' } },
        '/api/v1/health': { body: { version: '10.4.1' } },
      },
      expectPaths: ['/api/health', '/api/v1/health'],
    },
    {
      id: 'prometheus-nested-jsonpath',
      toolId: 'prometheus',
      expectedVersion: '2.51.0',
      responses: {
        '/api/v1/status/buildinfo': { body: { status: 'success', data: { version: '2.51.0' } } },
      },
      expectPaths: ['/api/v1/status/buildinfo'],
    },
    {
      id: 'elasticsearch-root-endpoint',
      toolId: 'elasticsearch',
      expectedVersion: '8.13.2',
      responses: {
        '/': { body: { version: { number: '8.13.2' } } },
      },
      expectPaths: ['/'],
    },
  ];

  const results: CaseResult[] = [];
  for (const testCase of cases) {
    // eslint-disable-next-line no-await-in-loop
    results.push(await runCase(testCase));
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    total: results.length,
    passed: results.filter((result) => result.ok).length,
    failed: results.filter((result) => !result.ok).length,
    results,
  };

  const outputPath = path.resolve(__dirname, '../audit/verified-runtime-mock-check.json');
  fs.writeFileSync(outputPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');

  console.log('\n🧪 Verified runtime mock check');
  for (const result of results) {
    console.log(`${result.ok ? '✅' : '❌'} ${result.id} (${result.toolId}) → ${result.detectedVersion ?? 'none'}`);
    if (!result.ok && result.error) {
      console.log(`   ${result.error}`);
    }
  }
  console.log(`\n📝 Wrote report: ${outputPath}`);

  if (summary.failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

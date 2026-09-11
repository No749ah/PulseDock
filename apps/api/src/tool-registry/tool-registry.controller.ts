import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  TOOL_REGISTRY,
  searchTools,
  TOOL_CATEGORIES,
  getToolById,
  getToolVariants,
} from '../../../../packages/tool-registry/src';
import type { VersionSource } from '../../../../packages/tool-registry/src/types';
import { normalizeExtractors, runExtractorPipeline } from '../checks/version-extractor.util';

/** Structured result from a registry tool validation attempt */
interface ValidateToolResult {
  toolId: string;
  toolName: string;
  status: 'ok' | 'unreachable' | 'auth-required' | 'parse-error' | 'no-endpoint';
  versionDetected?: string;
  httpStatus?: number;
  latencyMs?: number;
  endpointUsed?: string;
  extractorPath?: string;
  message: string;
}

/** Upstream source types that have known public test URLs */
const UPSTREAM_SOURCE_TYPES = new Set([
  'github-releases',
  'github-tags',
  'docker-hub',
  'npm-registry',
  'pypi',
  'cargo',
]);

/**
 * Build a test URL and extractor for upstream (non-instance) version sources.
 * Returns null when no public URL can be inferred.
 */
function buildUpstreamTestTarget(
  source: VersionSource,
): { url: string; extractors: string[] } | null {
  const target = source.target ?? '';
  if (!target) return null;

  switch (source.type) {
    case 'github-releases':
      return {
        url: `https://api.github.com/repos/${target}/releases/latest`,
        extractors: ['tag_name', 'name'],
      };
    case 'github-tags':
      return {
        url: `https://api.github.com/repos/${target}/tags`,
        extractors: ['0.name', '0.ref'],
      };
    case 'docker-hub': {
      const [namespace, image] = target.includes('/')
        ? target.split('/')
        : ['library', target];
      return {
        url: `https://hub.docker.com/v2/repositories/${namespace}/${image}/tags/?page_size=1`,
        extractors: ['results.0.name', 'results.0.tag'],
      };
    }
    case 'npm-registry':
      return {
        url: `https://registry.npmjs.org/${target}/latest`,
        extractors: ['version'],
      };
    case 'pypi':
      return {
        url: `https://pypi.org/pypi/${target}/json`,
        extractors: ['info.version', 'version'],
      };
    case 'cargo':
      return {
        url: `https://crates.io/api/v1/crates/${target}`,
        extractors: ['crate.newest_version', 'crate.max_version'],
      };
    default:
      return null;
  }
}

/**
 * Perform a timed HTTP GET with an 8s AbortController timeout.
 */
async function timedFetch(
  url: string,
): Promise<{ status: number; body: string; latencyMs: number }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  const start = Date.now();
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'PulseDock-Registry-Validator/1.0' },
    });
    const body = await res.text();
    return { status: res.status, body, latencyMs: Date.now() - start };
  } finally {
    clearTimeout(timer);
  }
}

@ApiTags('Tool Registry')
@Controller('v1/tool-registry')
export class ToolRegistryController {
  /** In-memory cache — registry is static at build time */
  private readonly registry = TOOL_REGISTRY;
  private readonly categories = TOOL_CATEGORIES;

  @Get()
  @ApiOperation({
    summary: 'List tool registry',
    description: 'Returns all tool entries (or filtered by search/category). No auth required.',
  })
  @ApiQuery({ name: 'q', required: false, description: 'Search query (name, description, tags, aliases)' })
  @ApiQuery({ name: 'category', required: false, description: 'Filter by category' })
  @ApiQuery({ name: 'withVariants', required: false, description: 'Include variants in each entry (default: false)' })
  @ApiResponse({ status: 200, description: 'Tool list returned.' })
  list(
    @Query('q') q?: string,
    @Query('category') category?: string,
    @Query('withVariants') withVariants?: string,
  ) {
    const tools = q || category ? searchTools(q ?? '', category) : this.registry;
    const includeVariants = withVariants === 'true' || withVariants === '1';

    return {
      total: tools.length,
      categories: this.categories,
      tools: includeVariants
        ? tools.map((t) => ({ ...t, variants: getToolVariants(t.id) }))
        : tools,
    };
  }

  @Get('validate/:id')
  @ApiOperation({
    summary: 'Validate a tool registry entry',
    description:
      'Tests whether the tool\'s version endpoint is reachable and returns structured validation output. ' +
      'For self-hosted tools (requiresInstanceUrl=true), pass ?instanceUrl=https://your-instance.example.com. ' +
      'For upstream tools (GitHub, Docker Hub, npm, etc.) the public upstream URL is tested automatically.',
  })
  @ApiParam({ name: 'id', description: 'Tool registry ID (e.g. grafana, prometheus, gitea)' })
  @ApiQuery({
    name: 'instanceUrl',
    required: false,
    description: 'Base URL of your self-hosted instance (required for json-path tools)',
  })
  @ApiResponse({ status: 200, description: 'Validation result returned.' })
  @ApiResponse({ status: 404, description: 'Tool not found in registry.' })
  async validate(
    @Param('id') id: string,
    @Query('instanceUrl') instanceUrl?: string,
  ): Promise<ValidateToolResult> {
    const tool = getToolById(id);
    if (!tool) {
      throw new NotFoundException(`Tool '${id}' not found in registry`);
    }

    const source: VersionSource = tool.versionSource;

    // --- Upstream source types (GitHub, Docker Hub, npm, etc.) ---
    if (UPSTREAM_SOURCE_TYPES.has(source.type)) {
      const target = buildUpstreamTestTarget(source);
      if (!target) {
        return {
          toolId: id,
          toolName: tool.name,
          status: 'no-endpoint',
          message: `Source type '${source.type}' has no public test URL configured`,
        };
      }

      try {
        const { status: httpStatus, body, latencyMs } = await timedFetch(target.url);

        if (httpStatus === 401 || httpStatus === 403) {
          return {
            toolId: id,
            toolName: tool.name,
            status: 'auth-required',
            httpStatus,
            latencyMs,
            endpointUsed: target.url,
            message: 'Authentication required to access version endpoint',
          };
        }

        if (httpStatus < 200 || httpStatus >= 300) {
          return {
            toolId: id,
            toolName: tool.name,
            status: 'unreachable',
            httpStatus,
            latencyMs,
            endpointUsed: target.url,
            message: `Endpoint returned HTTP ${httpStatus}`,
          };
        }

        let parsed: unknown;
        try {
          parsed = JSON.parse(body);
        } catch {
          return {
            toolId: id,
            toolName: tool.name,
            status: 'parse-error',
            httpStatus,
            latencyMs,
            endpointUsed: target.url,
            message: 'Response is not valid JSON',
          };
        }

        const version = runExtractorPipeline(parsed, target.extractors);
        if (!version) {
          return {
            toolId: id,
            toolName: tool.name,
            status: 'parse-error',
            httpStatus,
            latencyMs,
            endpointUsed: target.url,
            message: 'Version not found in response using known extractor paths',
          };
        }

        return {
          toolId: id,
          toolName: tool.name,
          status: 'ok',
          versionDetected: version,
          httpStatus,
          latencyMs,
          endpointUsed: target.url,
          extractorPath: target.extractors[0],
          message: 'Version detected successfully',
        };
      } catch (err: unknown) {
        const isAbort =
          typeof err === 'object' && err !== null && 'name' in err && (err as { name: string }).name === 'AbortError';
        return {
          toolId: id,
          toolName: tool.name,
          status: 'unreachable',
          endpointUsed: target.url,
          message: isAbort ? 'Request timed out after 8 seconds' : 'Network error connecting to endpoint',
        };
      }
    }

    // --- json-path / custom-endpoint (instance-URL tools) ---
    if (source.type === 'json-path' || source.type === 'custom-endpoint') {
      if (!source.urlTemplate || !source.urlTemplate.includes('{{instanceUrl}}')) {
        return {
          toolId: id,
          toolName: tool.name,
          status: 'no-endpoint',
          message: 'This tool has no urlTemplate with {{instanceUrl}} placeholder',
        };
      }

      if (!instanceUrl) {
        return {
          toolId: id,
          toolName: tool.name,
          status: 'no-endpoint',
          message: 'instanceUrl query parameter is required for self-hosted tools',
        };
      }

      // Build candidate URL list: primary + fallbacks
      const base = instanceUrl.replace(/\/+$/, '');
      const primaryUrl = source.urlTemplate.replace('{{instanceUrl}}', base);
      const candidateUrls: string[] = [primaryUrl];

      if (Array.isArray(source.endpointFallbacks)) {
        for (const fb of source.endpointFallbacks) {
          const fbUrl = fb.startsWith('http') ? fb : `${base}${fb}`;
          if (fbUrl !== primaryUrl) candidateUrls.push(fbUrl);
        }
      }

      const extractors = normalizeExtractors(
        source.jsonPath,
        Array.isArray(source.jsonPathExtractors) ? source.jsonPathExtractors : undefined,
      );

      for (const url of candidateUrls) {
        try {
          const { status: httpStatus, body, latencyMs } = await timedFetch(url);

          if (httpStatus === 401 || httpStatus === 403) {
            return {
              toolId: id,
              toolName: tool.name,
              status: 'auth-required',
              httpStatus,
              latencyMs,
              endpointUsed: url,
              message: 'Authentication required to access version endpoint',
            };
          }

          if (httpStatus < 200 || httpStatus >= 300) {
            // Try next fallback
            continue;
          }

          let parsed: unknown;
          try {
            parsed = JSON.parse(body);
          } catch {
            return {
              toolId: id,
              toolName: tool.name,
              status: 'parse-error',
              httpStatus,
              latencyMs,
              endpointUsed: url,
              message: 'Response is not valid JSON',
            };
          }

          const version = runExtractorPipeline(parsed, extractors);
          if (!version) {
            return {
              toolId: id,
              toolName: tool.name,
              status: 'parse-error',
              httpStatus,
              latencyMs,
              endpointUsed: url,
              message: 'Version not found in response using configured extractor paths',
            };
          }

          return {
            toolId: id,
            toolName: tool.name,
            status: 'ok',
            versionDetected: version,
            httpStatus,
            latencyMs,
            endpointUsed: url,
            extractorPath: extractors[0],
            message: 'Version detected successfully',
          };
        } catch (err: unknown) {
          const isAbort =
            typeof err === 'object' && err !== null && 'name' in err && (err as { name: string }).name === 'AbortError';
          if (isAbort || url === candidateUrls[candidateUrls.length - 1]) {
            return {
              toolId: id,
              toolName: tool.name,
              status: 'unreachable',
              endpointUsed: url,
              message: isAbort ? 'Request timed out after 8 seconds' : 'Network error connecting to endpoint',
            };
          }
          // otherwise try next fallback
        }
      }

      return {
        toolId: id,
        toolName: tool.name,
        status: 'unreachable',
        message: 'All endpoint candidates failed or returned non-200 responses',
      };
    }

    return {
      toolId: id,
      toolName: tool.name,
      status: 'no-endpoint',
      message: `Source type '${source.type}' does not support live validation`,
    };
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get tool by ID',
    description: 'Returns a single tool registry entry including its platform variants.',
  })
  @ApiParam({ name: 'id', description: 'Tool registry ID (e.g. grafana, prometheus, gitlab-ce)' })
  @ApiResponse({ status: 200, description: 'Tool entry returned.' })
  @ApiResponse({ status: 404, description: 'Tool not found.' })
  getById(@Param('id') id: string) {
    const tool = getToolById(id);
    if (!tool) throw new NotFoundException(`Tool '${id}' not found in registry`);
    const variants = getToolVariants(id);
    return { ...tool, variants };
  }

  @Get(':id/variants')
  @ApiOperation({
    summary: 'Get platform variants for a tool',
    description:
      'Returns the list of platform/edition variants for a tool (e.g. OSS/EE/Cloud, Docker/Kubernetes). ' +
      'Use this to populate a Platform selector in the setup UI. Returns empty array if no variants defined.',
  })
  @ApiParam({ name: 'id', description: 'Tool registry ID' })
  @ApiResponse({ status: 200, description: 'Variants returned (may be empty array).' })
  @ApiResponse({ status: 404, description: 'Tool not found.' })
  getVariants(@Param('id') id: string) {
    const tool = getToolById(id);
    if (!tool) throw new NotFoundException(`Tool '${id}' not found in registry`);
    const variants = getToolVariants(id);
    return {
      toolId: id,
      toolName: tool.name,
      hasVariants: variants.length > 0,
      variants,
    };
  }
}

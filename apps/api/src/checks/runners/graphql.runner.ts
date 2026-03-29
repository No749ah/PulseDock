import { Logger } from '@nestjs/common';

const logger = new Logger('GraphQLRunner');

/** Default introspection health query */
const DEFAULT_QUERY = '{ __typename }';

/** Simple JSONPath resolver for basic dot-notation paths like $.data.__typename */
function resolveJsonPath(obj: unknown, path: string): unknown {
  if (!path) return obj;
  const parts = path.replace(/^\$\.?/, '').split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

export interface GraphQLRunnerConfig {
  /** The GraphQL endpoint URL */
  url: string;
  /** GraphQL query to send (defaults to introspection health check) */
  query?: string;
  /** JSON string of variables to pass */
  variables?: string;
  /** JSONPath to check in the response (e.g. $.data.__typename) */
  dataPath?: string;
  /** Expected string value at dataPath (null = just assert field exists) */
  expectedValue?: string;
  /** Request timeout in milliseconds */
  timeoutMs?: number;
  /** Custom HTTP headers (e.g. Authorization) */
  headers?: Record<string, string>;
}

export interface GraphQLRunResult {
  ok: boolean;
  level: 'green' | 'yellow' | 'red';
  message: string;
  latencyMs: number;
  statusCode?: number;
  graphqlErrors?: string[];
  resolvedValue?: unknown;
}

/**
 * Runs a GraphQL health check against an endpoint.
 * Sends a POST with the configured query, validates response structure,
 * and optionally checks a specific field value in the response.
 */
export async function runGraphQLCheck(config: GraphQLRunnerConfig): Promise<GraphQLRunResult> {
  const startTime = Date.now();
  const query = config.query?.trim() || DEFAULT_QUERY;
  const timeoutMs = config.timeoutMs ?? 30_000;

  let variables: Record<string, unknown> | undefined;
  if (config.variables?.trim()) {
    try {
      variables = JSON.parse(config.variables);
    } catch {
      return {
        ok: false,
        level: 'yellow',
        message: 'Invalid JSON in graphql variables',
        latencyMs: 0,
      };
    }
  }

  const body = JSON.stringify({ query, ...(variables ? { variables } : {}) });

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...config.headers,
  };

  let response: Response;
  let statusCode: number;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    response = await fetch(config.url, {
      method: 'POST',
      headers,
      body,
      signal: controller.signal,
    });
    clearTimeout(timer);
    statusCode = response.status;
  } catch (err) {
    const latencyMs = Date.now() - startTime;
    const msg = err instanceof Error ? err.message : String(err);
    const isTimeout = msg.toLowerCase().includes('abort') || msg.toLowerCase().includes('timeout');
    logger.debug(`GraphQL check failed for ${config.url}: ${msg}`);
    return {
      ok: false,
      level: 'red',
      message: isTimeout ? `Timeout after ${timeoutMs}ms` : `Connection error: ${msg}`,
      latencyMs,
    };
  }

  const latencyMs = Date.now() - startTime;

  if (statusCode === 401 || statusCode === 403) {
    return {
      ok: false,
      level: 'yellow',
      message: `Authentication error: HTTP ${statusCode}`,
      latencyMs,
      statusCode,
    };
  }

  if (statusCode < 200 || statusCode >= 300) {
    return {
      ok: false,
      level: 'red',
      message: `HTTP ${statusCode} from GraphQL endpoint`,
      latencyMs,
      statusCode,
    };
  }

  let responseBody: unknown;
  try {
    responseBody = await response.json();
  } catch {
    return {
      ok: false,
      level: 'red',
      message: 'GraphQL response is not valid JSON',
      latencyMs,
      statusCode,
    };
  }

  // Check for GraphQL errors in response
  const gqlBody = responseBody as Record<string, unknown>;
  const errors = gqlBody['errors'] as Array<{ message?: string }> | undefined;

  if (errors && errors.length > 0) {
    const errorMessages = errors.map((e) => e?.message ?? 'Unknown error').slice(0, 3);
    return {
      ok: false,
      level: 'yellow',
      message: `GraphQL errors: ${errorMessages.join('; ')}`,
      latencyMs,
      statusCode,
      graphqlErrors: errorMessages,
    };
  }

  // Check that a "data" field exists
  if (!('data' in gqlBody)) {
    return {
      ok: false,
      level: 'yellow',
      message: 'GraphQL response missing "data" field',
      latencyMs,
      statusCode,
    };
  }

  // If a specific data path is configured, validate it
  if (config.dataPath) {
    const resolved = resolveJsonPath(responseBody, config.dataPath);

    if (resolved === undefined || resolved === null) {
      return {
        ok: false,
        level: 'yellow',
        message: `GraphQL field "${config.dataPath}" not found in response`,
        latencyMs,
        statusCode,
        resolvedValue: resolved,
      };
    }

    // If expected value is set, compare it
    if (config.expectedValue !== undefined && config.expectedValue !== '') {
      const actual = String(resolved);
      if (actual !== config.expectedValue) {
        return {
          ok: false,
          level: 'yellow',
          message: `GraphQL field "${config.dataPath}" expected "${config.expectedValue}" but got "${actual}"`,
          latencyMs,
          statusCode,
          resolvedValue: resolved,
        };
      }
    }

    return {
      ok: true,
      level: 'green',
      message: `GraphQL check passed (${latencyMs}ms)`,
      latencyMs,
      statusCode,
      resolvedValue: resolved,
    };
  }

  // No data path specified — just check data exists and no errors
  return {
    ok: true,
    level: 'green',
    message: `GraphQL check passed (${latencyMs}ms)`,
    latencyMs,
    statusCode,
  };
}



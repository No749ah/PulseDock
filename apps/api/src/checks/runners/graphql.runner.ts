import { Logger } from '@nestjs/common';
import { createHash } from 'crypto';

const logger = new Logger('GraphQLRunner');

/** Default introspection health query */
const DEFAULT_QUERY = '{ __typename }';

/** Lightweight introspection query for schema change detection */
const INTROSPECTION_QUERY = `{
  __schema {
    queryType { name }
    mutationType { name }
    subscriptionType { name }
    types {
      name
      kind
      fields { name type { name kind ofType { name kind } } }
    }
  }
}`;

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

/**
 * Substitute {{VAR_NAME}} placeholders in a query string with values from the vars map.
 * Unknown placeholders are left as-is.
 */
export function substituteVariables(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    return key in vars ? vars[key] : `{{${key}}}`;
  });
}

/** Compute a stable SHA-256 hash of the introspection schema for change detection */
function hashSchema(schemaData: unknown): string {
  const json = JSON.stringify(schemaData, Object.keys(schemaData as Record<string, unknown>).sort());
  return createHash('sha256').update(json).digest('hex').slice(0, 16);
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
  /**
   * Template variable substitutions for the query string.
   * Placeholders like {{VAR_NAME}} in the query will be replaced with
   * the corresponding value from this map.
   */
  templateVars?: Record<string, string>;
  /**
   * Latency threshold in milliseconds. If the response takes longer,
   * the check returns yellow (degraded) instead of green.
   */
  latencyThresholdMs?: number;
  /**
   * Enable introspection validation: sends an introspection query
   * and verifies the schema is accessible. Returns a schema hash
   * for change detection.
   */
  validateIntrospection?: boolean;
  /**
   * Previous schema hash to compare against for schema change detection.
   * If set and the current schema hash differs, the result includes
   * schemaChanged=true.
   */
  previousSchemaHash?: string;
}

export interface GraphQLRunResult {
  ok: boolean;
  level: 'green' | 'yellow' | 'red';
  message: string;
  latencyMs: number;
  statusCode?: number;
  graphqlErrors?: string[];
  resolvedValue?: unknown;
  /** Schema hash from introspection (when validateIntrospection=true) */
  schemaHash?: string;
  /** True when the schema changed compared to previousSchemaHash */
  schemaChanged?: boolean;
  /** Number of types found in the introspection schema */
  schemaTypeCount?: number;
}

/**
 * Runs a GraphQL health check against an endpoint.
 * Sends a POST with the configured query, validates response structure,
 * and optionally checks a specific field value in the response.
 */
export async function runGraphQLCheck(config: GraphQLRunnerConfig): Promise<GraphQLRunResult> {
  const startTime = Date.now();
  let query = config.query?.trim() || DEFAULT_QUERY;
  const timeoutMs = config.timeoutMs ?? 30_000;

  // Apply template variable substitution
  if (config.templateVars && Object.keys(config.templateVars).length > 0) {
    query = substituteVariables(query, config.templateVars);
  }

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

    // Check latency threshold
    if (config.latencyThresholdMs && latencyMs > config.latencyThresholdMs) {
      return {
        ok: true,
        level: 'yellow',
        message: `GraphQL check passed but slow (${latencyMs}ms > ${config.latencyThresholdMs}ms threshold)`,
        latencyMs,
        statusCode,
        resolvedValue: resolved,
      };
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

  // Check latency threshold even without dataPath
  if (config.latencyThresholdMs && latencyMs > config.latencyThresholdMs) {
    return {
      ok: true,
      level: 'yellow',
      message: `GraphQL check passed but slow (${latencyMs}ms > ${config.latencyThresholdMs}ms threshold)`,
      latencyMs,
      statusCode,
    };
  }

  // No data path specified — just check data exists and no errors
  const baseResult: GraphQLRunResult = {
    ok: true,
    level: 'green',
    message: `GraphQL check passed (${latencyMs}ms)`,
    latencyMs,
    statusCode,
  };

  // Run introspection validation if requested
  if (config.validateIntrospection) {
    const introspectionResult = await runIntrospection(config, timeoutMs);
    if (introspectionResult) {
      baseResult.schemaHash = introspectionResult.schemaHash;
      baseResult.schemaTypeCount = introspectionResult.typeCount;

      if (config.previousSchemaHash && introspectionResult.schemaHash !== config.previousSchemaHash) {
        baseResult.schemaChanged = true;
        baseResult.message = `GraphQL check passed (${latencyMs}ms) — schema changed (${config.previousSchemaHash.slice(0, 8)}→${introspectionResult.schemaHash.slice(0, 8)})`;
      }
    }
  }

  return baseResult;
}

/**
 * Run an introspection query to get the schema hash.
 * Returns null if introspection is disabled or fails (non-blocking).
 */
async function runIntrospection(
  config: GraphQLRunnerConfig,
  timeoutMs: number,
): Promise<{ schemaHash: string; typeCount: number } | null> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...config.headers,
  };

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const resp = await fetch(config.url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query: INTROSPECTION_QUERY }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!resp.ok) {
      logger.debug(`Introspection query returned HTTP ${resp.status} for ${config.url}`);
      return null;
    }

    const body = (await resp.json()) as Record<string, unknown>;
    const schema = resolveJsonPath(body, '$.data.__schema');
    if (!schema || typeof schema !== 'object') {
      logger.debug(`Introspection response missing __schema for ${config.url}`);
      return null;
    }

    const types = (schema as Record<string, unknown>)['types'] as Array<Record<string, unknown>> | undefined;
    const typeCount = types?.length ?? 0;
    const schemaHash = hashSchema(schema);

    return { schemaHash, typeCount };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.debug(`Introspection failed for ${config.url}: ${msg}`);
    return null;
  }
}

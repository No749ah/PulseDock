import type { MonitorCheckPlugin, PluginExecutionContext, PluginExecutionResult } from './plugin.contracts';

const ALLOWED_LEVELS = new Set(['green', 'yellow', 'red'] as const);

function deepCloneObject<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object') return value;
  const target = value as Record<string, unknown>;
  Object.freeze(target);
  for (const nested of Object.values(target)) {
    deepFreeze(nested);
  }
  return value;
}

function sanitizeResult(result: PluginExecutionResult): PluginExecutionResult {
  const message = String(result.message ?? '').slice(0, 500);
  const statusCode = Number.isFinite(result.statusCode) ? Math.max(0, Math.floor(result.statusCode)) : 0;
  const latencyMs = result.latencyMs == null || !Number.isFinite(result.latencyMs)
    ? null
    : Math.max(0, Math.floor(result.latencyMs));

  const level = ALLOWED_LEVELS.has(result.level) ? result.level : 'red';

  return {
    ok: Boolean(result.ok),
    statusCode,
    latencyMs,
    message: message || 'Plugin produced empty message',
    level,
  };
}

export async function executePluginSafely(
  plugin: MonitorCheckPlugin,
  context: PluginExecutionContext,
  timeoutMs: number,
): Promise<PluginExecutionResult> {
  const preparedContext = deepFreeze(deepCloneObject(context));
  const boundedTimeoutMs = Math.max(250, Math.min(timeoutMs, 30_000));

  const timeoutPromise = new Promise<PluginExecutionResult>((resolve) => {
    setTimeout(() => {
      resolve({
        ok: false,
        statusCode: 0,
        latencyMs: null,
        message: `Plugin timed out after ${boundedTimeoutMs}ms`,
        level: 'red',
      });
    }, boundedTimeoutMs);
  });

  const runPromise = plugin
    .run(preparedContext)
    .then((result) => sanitizeResult(result))
    .catch((error: unknown) => ({
      ok: false,
      statusCode: 0,
      latencyMs: null,
      message: `Plugin failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      level: 'red' as const,
    }));

  return Promise.race([runPromise, timeoutPromise]);
}

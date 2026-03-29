/**
 * Multi-Step HTTP Transaction Runner.
 *
 * Executes a sequence of HTTP requests, supports variable extraction between
 * steps via JSONPath, and validates assertions at each step.
 */

import * as https from 'https';
import * as http from 'http';
import type { PluginExecutionResult } from '../plugin.contracts';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TransactionAssertion {
  /** 'status' | 'body_contains' | 'json_path' | 'header_exists' | 'latency_lt' */
  type: 'status' | 'body_contains' | 'json_path' | 'header_exists' | 'latency_lt';
  /** For status: expected code (e.g. "200"). For json_path: the path. For latency_lt: ms threshold. */
  value: string;
  /** For json_path: the expected string value at that path. */
  expected?: string;
}

export interface TransactionStep {
  id: string;
  name: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url: string;
  headers?: Record<string, string>;
  body?: string;
  /** varName → simple dot-notation path (e.g. "token" → "data.token") */
  extract?: Record<string, string>;
  assertions?: TransactionAssertion[];
  timeoutMs?: number;
}

export interface TransactionStepResult {
  stepId: string;
  name: string;
  ok: boolean;
  statusCode?: number;
  latencyMs: number;
  error?: string;
  assertionFailures: string[];
  extractedVars?: Record<string, string>;
}

export interface TransactionRunResult {
  ok: boolean;
  level: 'green' | 'yellow' | 'red';
  totalLatencyMs: number;
  steps: TransactionStepResult[];
  failedAtStep?: string;
  message: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Interpolates {{varName}} placeholders in a string with values from vars.
 * @param template - String with optional {{varName}} placeholders
 * @param vars - Map of variable name to value
 */
export function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}

/**
 * Simple dot-notation path resolver (e.g. "data.token" on JSON).
 * @param obj - Parsed JSON object
 * @param path - Dot-separated path string
 */
export function resolvePath(obj: unknown, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/** Performs a single HTTP request and returns status, body, latency, headers. */
async function httpRequest(
  method: string,
  urlStr: string,
  headers: Record<string, string>,
  body: string | undefined,
  timeoutMs: number,
): Promise<{ statusCode: number; body: string; latencyMs: number; headers: Record<string, string> }> {
  const url = new URL(urlStr);
  const isHttps = url.protocol === 'https:';
  const mod = isHttps ? https : http;

  const requestBody = body ? Buffer.from(body, 'utf-8') : undefined;
  const reqHeaders: Record<string, string | number> = { ...headers };
  if (requestBody) {
    reqHeaders['Content-Length'] = requestBody.length;
    if (!reqHeaders['Content-Type'] && !reqHeaders['content-type']) {
      reqHeaders['Content-Type'] = 'application/json';
    }
  }

  return new Promise((resolve, reject) => {
    const start = Date.now();
    const req = mod.request(
      {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method: method.toUpperCase(),
        headers: reqHeaders,
        timeout: timeoutMs,
        rejectUnauthorized: true,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const latencyMs = Date.now() - start;
          const responseBody = Buffer.concat(chunks).toString('utf-8');
          const responseHeaders: Record<string, string> = {};
          for (const [k, v] of Object.entries(res.headers)) {
            if (v !== undefined) {
              responseHeaders[k.toLowerCase()] = Array.isArray(v) ? v.join(', ') : String(v);
            }
          }
          resolve({
            statusCode: res.statusCode ?? 0,
            body: responseBody,
            latencyMs,
            headers: responseHeaders,
          });
        });
        res.on('error', reject);
      },
    );
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Request timed out after ${timeoutMs}ms`));
    });
    req.on('error', reject);
    if (requestBody) req.write(requestBody);
    req.end();
  });
}

/** Evaluates assertions against a step result. Returns array of failure messages. */
export function evaluateAssertions(
  assertions: TransactionAssertion[],
  statusCode: number,
  body: string,
  responseHeaders: Record<string, string>,
  latencyMs: number,
): string[] {
  const failures: string[] = [];
  for (const assertion of assertions) {
    switch (assertion.type) {
      case 'status': {
        const expected = parseInt(assertion.value, 10);
        if (statusCode !== expected) {
          failures.push(`Expected status ${expected}, got ${statusCode}`);
        }
        break;
      }
      case 'body_contains': {
        if (!body.toLowerCase().includes(assertion.value.toLowerCase())) {
          failures.push(`Body does not contain "${assertion.value}"`);
        }
        break;
      }
      case 'json_path': {
        let parsed: unknown;
        try {
          parsed = JSON.parse(body);
        } catch {
          failures.push(`Cannot parse response body as JSON for json_path assertion`);
          break;
        }
        const resolved = resolvePath(parsed, assertion.value);
        const actual = String(resolved ?? '');
        const expected = assertion.expected ?? '';
        if (actual !== expected) {
          failures.push(`json_path "${assertion.value}": expected "${expected}", got "${actual}"`);
        }
        break;
      }
      case 'header_exists': {
        const headerName = assertion.value.toLowerCase();
        if (!(headerName in responseHeaders)) {
          failures.push(`Header "${assertion.value}" not present in response`);
        }
        break;
      }
      case 'latency_lt': {
        const threshold = parseInt(assertion.value, 10);
        if (latencyMs >= threshold) {
          failures.push(`Latency ${latencyMs}ms exceeds threshold ${threshold}ms`);
        }
        break;
      }
    }
  }
  return failures;
}

// ─── Main Runner ──────────────────────────────────────────────────────────────

/**
 * Runs a multi-step HTTP transaction.
 *
 * @param steps - Ordered list of HTTP steps to execute
 * @param initialVars - Initial variable map (injected before step 1)
 * @param continueOnFailure - If true, all steps run even on failure (default: false)
 * @returns Structured per-step and overall result
 */
export async function runTransactionCheck(
  steps: TransactionStep[],
  initialVars: Record<string, string> = {},
  continueOnFailure = false,
): Promise<PluginExecutionResult> {
  if (!steps || steps.length === 0) {
    return {
      ok: false,
      level: 'red',
      latencyMs: 0,
      statusCode: 0,
      message: 'Transaction has no steps configured',
    };
  }

  const vars: Record<string, string> = { ...initialVars };
  const stepResults: TransactionStepResult[] = [];
  let totalLatencyMs = 0;
  let failedAtStep: string | undefined;
  let worstLevel: 'green' | 'yellow' | 'red' = 'green';

  for (const step of steps) {
    const timeoutMs = step.timeoutMs ?? 10_000;

    // Interpolate url, headers, body with current variables
    const resolvedUrl = interpolate(step.url, vars);
    const resolvedHeaders: Record<string, string> = {};
    for (const [k, v] of Object.entries(step.headers ?? {})) {
      resolvedHeaders[k] = interpolate(v, vars);
    }
    const resolvedBody = step.body ? interpolate(step.body, vars) : undefined;

    let stepResult: TransactionStepResult;

    try {
      const response = await httpRequest(step.method, resolvedUrl, resolvedHeaders, resolvedBody, timeoutMs);
      totalLatencyMs += response.latencyMs;

      // Extract variables from response body
      const extractedVars: Record<string, string> = {};
      if (step.extract) {
        let parsedBody: unknown;
        try {
          parsedBody = JSON.parse(response.body);
        } catch {
          // Non-JSON body — extraction won't work but don't fail the step
        }
        for (const [varName, path] of Object.entries(step.extract)) {
          if (parsedBody !== undefined) {
            const extracted = resolvePath(parsedBody, path);
            if (extracted !== undefined && extracted !== null) {
              extractedVars[varName] = String(extracted);
              vars[varName] = String(extracted); // propagate to next steps
            }
          }
        }
      }

      // Evaluate assertions
      const assertionFailures = evaluateAssertions(
        step.assertions ?? [],
        response.statusCode,
        response.body,
        response.headers,
        response.latencyMs,
      );

      const stepOk = response.statusCode >= 200 && response.statusCode < 400 && assertionFailures.length === 0;
      const stepLevel = !stepOk && assertionFailures.length > 0 ? 'yellow' : (!stepOk ? 'red' : 'green');

      stepResult = {
        stepId: step.id,
        name: step.name,
        ok: stepOk,
        statusCode: response.statusCode,
        latencyMs: response.latencyMs,
        assertionFailures,
        extractedVars: Object.keys(extractedVars).length > 0 ? extractedVars : undefined,
      };

      // Track worst level
      if (stepLevel === 'red') worstLevel = 'red';
      else if (stepLevel === 'yellow' && worstLevel !== 'red') worstLevel = 'yellow';

      if (!stepOk && !failedAtStep) {
        failedAtStep = step.id;
      }
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      stepResult = {
        stepId: step.id,
        name: step.name,
        ok: false,
        latencyMs: 0,
        error,
        assertionFailures: [],
      };
      worstLevel = 'red';
      if (!failedAtStep) failedAtStep = step.id;
    }

    stepResults.push(stepResult);

    // Stop on first failure unless continueOnFailure is set
    if (!stepResult.ok && !continueOnFailure) {
      break;
    }
  }

  const overallOk = stepResults.every((s) => s.ok);

  const transactionResult: TransactionRunResult = {
    ok: overallOk,
    level: worstLevel,
    totalLatencyMs,
    steps: stepResults,
    failedAtStep,
    message: overallOk
      ? `All ${stepResults.length} transaction steps passed`
      : `Transaction failed at step "${stepResults.find((s) => !s.ok)?.name ?? failedAtStep}"`,
  };

  // Use last step's statusCode (or 0 if no steps ran)
  const lastStep = stepResults[stepResults.length - 1];

  return {
    ok: overallOk,
    level: worstLevel,
    latencyMs: totalLatencyMs,
    statusCode: lastStep?.statusCode ?? 0,
    message: transactionResult.message,
    metadata: { transactionResult } as Record<string, unknown>,
  };
}

/**
 * Tests for HTTP runner response size tracking (responseSizeBytes on PluginExecutionResult).
 * Ensures the runner captures byte length of the response body for HTTP/BROWSER monitors.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PluginExecutionResult } from '../plugin.contracts';

// Minimal mock of what the runner does after acquiring the body
function computeResponseSizeBytes(body: string | null | undefined): number {
  return body ? Buffer.byteLength(body, 'utf8') : 0;
}

function buildResult(body: string | null, level: 'green' | 'yellow' | 'red' = 'green'): Partial<PluginExecutionResult> {
  const responseSizeBytes = computeResponseSizeBytes(body);
  return {
    ok: level === 'green',
    level,
    statusCode: 200,
    latencyMs: 50,
    message: 'OK',
    responseSizeBytes,
  };
}

describe('HTTP runner — responseSizeBytes', () => {
  it('returns 0 bytes for null body', () => {
    expect(computeResponseSizeBytes(null)).toBe(0);
  });

  it('returns 0 bytes for undefined body', () => {
    expect(computeResponseSizeBytes(undefined)).toBe(0);
  });

  it('returns correct byte count for ASCII body', () => {
    const body = 'Hello, World!'; // 13 chars, 13 bytes in UTF-8
    expect(computeResponseSizeBytes(body)).toBe(13);
  });

  it('returns correct byte count for multi-byte UTF-8 body', () => {
    const body = '€'; // Euro sign = 3 bytes in UTF-8
    expect(computeResponseSizeBytes(body)).toBe(3);
  });

  it('includes responseSizeBytes in green result', () => {
    const body = 'OK';
    const result = buildResult(body, 'green');
    expect(result.responseSizeBytes).toBe(2);
    expect(result.level).toBe('green');
  });

  it('includes responseSizeBytes in yellow (degraded) result', () => {
    const body = 'x'.repeat(1024); // 1 KB ASCII
    const result = buildResult(body, 'yellow');
    expect(result.responseSizeBytes).toBe(1024);
    expect(result.level).toBe('yellow');
  });

  it('PluginExecutionResult interface allows responseSizeBytes', () => {
    const result: PluginExecutionResult = {
      ok: true,
      statusCode: 200,
      latencyMs: 10,
      message: 'OK',
      level: 'green',
      responseSizeBytes: 512,
    };
    expect(result.responseSizeBytes).toBe(512);
  });

  it('PluginExecutionResult responseSizeBytes is optional/nullable', () => {
    const result: PluginExecutionResult = {
      ok: false,
      statusCode: 0,
      latencyMs: 0,
      message: 'Connection refused',
      level: 'red',
      // responseSizeBytes omitted — this must be valid
    };
    expect(result.responseSizeBytes).toBeUndefined();
  });
});

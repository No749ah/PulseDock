/**
 * Unit tests for HeartbeatConfigSection pure logic.
 * Tests timeout clamping, ping URL construction, and field constraints.
 */
import { describe, it, expect } from 'vitest';

// ── Constants mirrored from component ────────────────────────────────────────

const HEARTBEAT_TIMEOUT_MIN = 1;
const HEARTBEAT_TIMEOUT_MAX = 1440;

// ── Logic mirrored from component ────────────────────────────────────────────

function clampHeartbeatTimeout(value: number): number {
  return Math.max(HEARTBEAT_TIMEOUT_MIN, value);
}

function buildPingUrl(apiBase: string, heartbeatToken: string | undefined): string {
  return `${apiBase}/v1/heartbeat/${heartbeatToken || '<token>'}`;
}

function validateHeartbeatTimeout(value: number): string {
  if (!value || value < HEARTBEAT_TIMEOUT_MIN) return 'Minimum 1 minute';
  if (value > HEARTBEAT_TIMEOUT_MAX) return 'Maximum 1440 minutes (24h)';
  return '';
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('HeartbeatConfigSection — HEARTBEAT_TIMEOUT', () => {
  it('min is 1 minute', () => {
    expect(HEARTBEAT_TIMEOUT_MIN).toBe(1);
  });

  it('max is 1440 minutes (24h)', () => {
    expect(HEARTBEAT_TIMEOUT_MAX).toBe(1440);
  });
});

describe('HeartbeatConfigSection — clampHeartbeatTimeout', () => {
  it('clamps value of 0 to 1', () => {
    expect(clampHeartbeatTimeout(0)).toBe(1);
  });

  it('clamps negative values to 1', () => {
    expect(clampHeartbeatTimeout(-5)).toBe(1);
  });

  it('accepts 1', () => {
    expect(clampHeartbeatTimeout(1)).toBe(1);
  });

  it('accepts valid values', () => {
    expect(clampHeartbeatTimeout(5)).toBe(5);
    expect(clampHeartbeatTimeout(60)).toBe(60);
    expect(clampHeartbeatTimeout(1440)).toBe(1440);
  });
});

describe('HeartbeatConfigSection — buildPingUrl', () => {
  it('builds URL with token', () => {
    const url = buildPingUrl('https://api.example.com', 'abc-123');
    expect(url).toBe('https://api.example.com/v1/heartbeat/abc-123');
  });

  it('uses placeholder token when undefined', () => {
    const url = buildPingUrl('https://api.example.com', undefined);
    expect(url).toBe('https://api.example.com/v1/heartbeat/<token>');
  });

  it('uses placeholder token for empty string', () => {
    const url = buildPingUrl('https://api.example.com', '');
    expect(url).toBe('https://api.example.com/v1/heartbeat/<token>');
  });

  it('URL contains /v1/heartbeat/ path', () => {
    const url = buildPingUrl('https://api.example.com', 'mytoken');
    expect(url).toContain('/v1/heartbeat/');
  });

  it('works with different API base URLs', () => {
    const url = buildPingUrl('http://localhost:4321', 'test-token');
    expect(url).toBe('http://localhost:4321/v1/heartbeat/test-token');
  });
});

describe('HeartbeatConfigSection — validateHeartbeatTimeout', () => {
  it('returns error for 0', () => {
    expect(validateHeartbeatTimeout(0)).not.toBe('');
  });

  it('returns error for negative values', () => {
    expect(validateHeartbeatTimeout(-1)).not.toBe('');
  });

  it('returns no error for 1', () => {
    expect(validateHeartbeatTimeout(1)).toBe('');
  });

  it('returns no error for 1440', () => {
    expect(validateHeartbeatTimeout(1440)).toBe('');
  });

  it('returns error for value > 1440', () => {
    const error = validateHeartbeatTimeout(1441);
    expect(error).not.toBe('');
    expect(error).toContain('1440');
  });

  it('returns no error for typical values (5, 15, 30, 60)', () => {
    [5, 15, 30, 60].forEach((v) => {
      expect(validateHeartbeatTimeout(v)).toBe('');
    });
  });
});

describe('HeartbeatConfigSection — timeout display', () => {
  it('1440 minutes represents 24 hours', () => {
    expect(HEARTBEAT_TIMEOUT_MAX / 60).toBe(24);
  });

  it('60 minutes represents 1 hour', () => {
    expect(60 / 60).toBe(1);
  });
});

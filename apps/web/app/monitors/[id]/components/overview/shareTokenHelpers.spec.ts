/**
 * Unit tests for shareTokenHelpers.ts
 *
 * Pure helper functions — no mocks or external deps needed.
 */
import { describe, it, expect } from 'vitest';
import {
  buildShareTokenPath,
  buildShareJsonPath,
  copyButtonLabel,
  isTokenActionDisabled,
  generateButtonLabel,
} from './shareTokenHelpers';

describe('buildShareTokenPath', () => {
  it('returns /public/monitor/:token path', () => {
    expect(buildShareTokenPath('abc123')).toBe('/public/monitor/abc123');
  });

  it('preserves special characters in token', () => {
    expect(buildShareTokenPath('tok-en_01')).toBe('/public/monitor/tok-en_01');
  });

  it('handles empty token string gracefully', () => {
    expect(buildShareTokenPath('')).toBe('/public/monitor/');
  });
});

describe('buildShareJsonPath', () => {
  it('returns /v1/public/monitor/:token/status.json', () => {
    expect(buildShareJsonPath('xyz')).toBe('/v1/public/monitor/xyz/status.json');
  });

  it('preserves full token in path', () => {
    expect(buildShareJsonPath('tok-uuid-here')).toBe('/v1/public/monitor/tok-uuid-here/status.json');
  });
});

describe('copyButtonLabel', () => {
  it('returns "Copied!" when copied=true', () => {
    expect(copyButtonLabel(true)).toBe('Copied!');
  });

  it('returns "Copy JSON URL" when copied=false', () => {
    expect(copyButtonLabel(false)).toBe('Copy JSON URL');
  });
});

describe('isTokenActionDisabled', () => {
  it('returns true when loading', () => {
    expect(isTokenActionDisabled(true)).toBe(true);
  });

  it('returns false when not loading', () => {
    expect(isTokenActionDisabled(false)).toBe(false);
  });
});

describe('generateButtonLabel', () => {
  it('returns "Generating…" when loading=true', () => {
    expect(generateButtonLabel(true)).toBe('Generating…');
  });

  it('returns "Generate Share Token" when loading=false', () => {
    expect(generateButtonLabel(false)).toBe('Generate Share Token');
  });
});

import { describe, it, expect } from 'vitest';
import { extractVersionsFromMessage } from './VersionDiff';

describe('extractVersionsFromMessage', () => {
  it('parses "current X, latest Y" pattern', () => {
    const result = extractVersionsFromMessage('GitHub current 1.2.3, latest 1.4.0');
    expect(result).toEqual({ from: '1.2.3', to: '1.4.0' });
  });

  it('parses "current X latest Y" without comma', () => {
    const result = extractVersionsFromMessage('Docker current 22.04 latest 24.04');
    expect(result).toEqual({ from: '22.04', to: '24.04' });
  });

  it('is case-insensitive for "current/latest"', () => {
    const result = extractVersionsFromMessage('CURRENT 1.0.0, LATEST 2.0.0');
    expect(result).toEqual({ from: '1.0.0', to: '2.0.0' });
  });

  it('parses "New version: X (was Y)" pattern', () => {
    const result = extractVersionsFromMessage('New version: 2.0.0 (was 1.5.3)');
    expect(result).toEqual({ from: '1.5.3', to: '2.0.0' });
  });

  it('parses "New version X (was Y)" without colon', () => {
    const result = extractVersionsFromMessage('New version 3.1.0 (was 2.9.1)');
    expect(result).toEqual({ from: '2.9.1', to: '3.1.0' });
  });

  it('returns null pair when no pattern matches', () => {
    const result = extractVersionsFromMessage('Something went wrong');
    expect(result).toEqual({ from: null, to: null });
  });

  it('returns null pair on empty string', () => {
    const result = extractVersionsFromMessage('');
    expect(result).toEqual({ from: null, to: null });
  });

  it('handles v-prefixed versions in "current/latest" pattern', () => {
    const result = extractVersionsFromMessage('current v1.2.3, latest v2.0.0');
    expect(result).toEqual({ from: 'v1.2.3', to: 'v2.0.0' });
  });

  it('handles pre-release versions', () => {
    const result = extractVersionsFromMessage('current 1.0.0-beta.1, latest 1.0.0-rc.2');
    expect(result).toEqual({ from: '1.0.0-beta.1', to: '1.0.0-rc.2' });
  });

  it('handles Docker-style date versions', () => {
    const result = extractVersionsFromMessage('Docker current 22.04, latest 24.04');
    expect(result).toEqual({ from: '22.04', to: '24.04' });
  });
});

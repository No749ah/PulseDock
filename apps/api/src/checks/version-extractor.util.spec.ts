import { describe, it, expect } from 'vitest';
import { extractByPath, runExtractorPipeline, normalizeExtractors, isVersionLike, stripVPrefix, runHeuristicExtraction, extractVersionWithFallback } from './version-extractor.util';

describe('extractByPath', () => {
  it('extracts top-level key', () => {
    expect(extractByPath({ version: '1.2.3' }, 'version')).toBe('1.2.3');
  });

  it('extracts nested key', () => {
    expect(extractByPath({ data: { version: '1.2.3' } }, 'data.version')).toBe('1.2.3');
  });

  it('extracts deeply nested key', () => {
    expect(extractByPath({ build: { info: { version: '2.0.0' } } }, 'build.info.version')).toBe('2.0.0');
  });

  it('extracts array index', () => {
    expect(extractByPath({ items: ['1.2.3'] }, 'items.0')).toBe('1.2.3');
  });

  it('returns undefined for missing path', () => {
    expect(extractByPath({ other: '1.0.0' }, 'version')).toBeUndefined();
  });

  it('returns undefined for missing nested path', () => {
    expect(extractByPath({ data: {} }, 'data.version')).toBeUndefined();
  });

  it('handles null safely', () => {
    expect(extractByPath(null, 'version')).toBeUndefined();
  });

  it('handles undefined safely', () => {
    expect(extractByPath(undefined, 'version')).toBeUndefined();
  });

  it('handles non-object root', () => {
    expect(extractByPath('1.2.3', 'version')).toBeUndefined();
  });

  it('handles capital key', () => {
    expect(extractByPath({ Version: '2.19.4' }, 'Version')).toBe('2.19.4');
  });
});

describe('runExtractorPipeline', () => {
  it('returns first matching extractor result', () => {
    expect(runExtractorPipeline({ version: '2.5.0', other: 'nope' }, ['version', 'other'])).toBe('2.5.0');
  });

  it('skips non-version strings and finds next', () => {
    expect(runExtractorPipeline({ label: 'stable', version: '3.1.0' }, ['label', 'version'])).toBe('3.1.0');
  });

  it('returns null when no extractor matches', () => {
    expect(runExtractorPipeline({ unrelated: 'value' }, ['version'])).toBeNull();
  });

  it('handles nested path', () => {
    expect(runExtractorPipeline({ data: { version: '1.0.0' } }, ['data.version'])).toBe('1.0.0');
  });

  it('handles empty extractors list', () => {
    expect(runExtractorPipeline({ version: '1.0.0' }, [])).toBeNull();
  });

  it('handles capital key like Portainer/ArgoCD', () => {
    expect(runExtractorPipeline({ Version: '2.19.4' }, ['Version', 'version'])).toBe('2.19.4');
  });

  it('handles versionstring like Nextcloud', () => {
    expect(runExtractorPipeline({ versionstring: '28.0.0', version: '28' }, ['versionstring', 'version'])).toBe('28.0.0');
  });

  it('handles Prometheus nested data.version', () => {
    expect(runExtractorPipeline({ status: 'success', data: { version: '2.45.0', revision: 'abc' } }, ['data.version', 'version'])).toBe('2.45.0');
  });

  it('returns null for null body', () => {
    expect(runExtractorPipeline(null, ['version'])).toBeNull();
  });
});

describe('normalizeExtractors', () => {
  it('uses jsonPathExtractors when provided alone', () => {
    expect(normalizeExtractors(undefined, ['version'])).toEqual(['version']);
  });

  it('strips $. prefix from jsonPath', () => {
    expect(normalizeExtractors('$.version', undefined)).toEqual(['version']);
  });

  it('accepts jsonPath without $. prefix', () => {
    expect(normalizeExtractors('version', undefined)).toEqual(['version']);
  });

  it('accepts nested jsonPath with $. prefix', () => {
    expect(normalizeExtractors('$.data.version', undefined)).toEqual(['data.version']);
  });

  it('combines both with extractors first', () => {
    expect(normalizeExtractors('$.build.version', ['version'])).toEqual(['version', 'build.version']);
  });

  it('returns empty array when neither provided', () => {
    expect(normalizeExtractors(undefined, undefined)).toEqual([]);
  });

  it('returns empty array when both undefined', () => {
    expect(normalizeExtractors()).toEqual([]);
  });

  it('handles multiple extractors', () => {
    expect(normalizeExtractors(undefined, ['Version', 'version', 'data.version'])).toEqual(['Version', 'version', 'data.version']);
  });
});

describe('isVersionLike', () => {
  it('returns true for standard semver', () => {
    expect(isVersionLike('1.2.3')).toBe(true);
  });

  it('returns true for version with v prefix', () => {
    expect(isVersionLike('v1.2.3')).toBe(true);
  });

  it('returns true for two-part version', () => {
    expect(isVersionLike('10.5')).toBe(true);
  });

  it('returns false for non-version string', () => {
    expect(isVersionLike('ok')).toBe(false);
    expect(isVersionLike('healthy')).toBe(false);
    expect(isVersionLike('')).toBe(false);
  });
});

describe('stripVPrefix', () => {
  it('strips v prefix from vX.Y.Z', () => {
    expect(stripVPrefix('v1.2.3')).toBe('1.2.3');
  });

  it('leaves string unchanged if no v prefix', () => {
    expect(stripVPrefix('1.2.3')).toBe('1.2.3');
  });

  it('does not strip v from non-version strings', () => {
    expect(stripVPrefix('vault')).toBe('vault');
  });
});

describe('runHeuristicExtraction', () => {
  it('detects version from top-level version field', () => {
    expect(runHeuristicExtraction({ version: '2.5.0' })).toBe('2.5.0');
  });

  it('detects from Version (capitalized)', () => {
    expect(runHeuristicExtraction({ Version: '3.0.1' })).toBe('3.0.1');
  });

  it('detects from tag_name (GitHub releases style)', () => {
    expect(runHeuristicExtraction({ tag_name: 'v1.9.0' })).toBe('v1.9.0');
  });

  it('returns null when no version field found', () => {
    expect(runHeuristicExtraction({ status: 'ok', name: 'myapp' })).toBeNull();
  });

  it('returns null for non-object input', () => {
    expect(runHeuristicExtraction(null)).toBeNull();
    expect(runHeuristicExtraction([])).toBeNull();
    expect(runHeuristicExtraction('1.0.0')).toBeNull();
  });
});

describe('extractVersionWithFallback', () => {
  it('uses configured extractor when it matches', () => {
    const body = { app: { ver: '4.1.0' }, version: '2.0.0' };
    expect(extractVersionWithFallback(body, ['app.ver'])).toBe('4.1.0');
  });

  it('falls back to heuristic when extractor path misses', () => {
    const body = { version: '3.2.1' };
    expect(extractVersionWithFallback(body, ['nonexistent.path'])).toBe('3.2.1');
  });

  it('returns null when neither configured nor heuristic finds version', () => {
    const body = { status: 'healthy' };
    expect(extractVersionWithFallback(body, [])).toBeNull();
  });
});

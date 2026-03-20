import { describe, it, expect } from 'vitest';
import { extractByPath, runExtractorPipeline, normalizeExtractors } from './version-extractor.util';

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

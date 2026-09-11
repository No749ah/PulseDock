import { describe, it, expect } from 'vitest';

// Pure logic mirroring QuickAddModal component

function parseUrls(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function validateUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function countValid(urls: string[]): { valid: number; invalid: number } {
  const valid = urls.filter(validateUrl).length;
  return { valid, invalid: urls.length - valid };
}

interface MonitorPayload {
  urls: string[];
  folderId?: string;
  channelIds: string[];
  intervalSec: number;
}

function buildPayload(
  urls: string[],
  folderId: string,
  channelIds: string[],
  intervalSec: number
): MonitorPayload {
  return {
    urls,
    ...(folderId ? { folderId } : {}),
    channelIds,
    intervalSec,
  };
}

describe('QuickAddModal — pure logic', () => {
  describe('parseUrls', () => {
    it('splits by newline', () => {
      expect(parseUrls('https://a.com\nhttps://b.com')).toEqual([
        'https://a.com',
        'https://b.com',
      ]);
    });
    it('trims whitespace from each line', () => {
      expect(parseUrls('  https://a.com  \n  https://b.com  ')).toEqual([
        'https://a.com',
        'https://b.com',
      ]);
    });
    it('filters empty lines', () => {
      expect(parseUrls('https://a.com\n\nhttps://b.com\n')).toEqual([
        'https://a.com',
        'https://b.com',
      ]);
    });
    it('returns empty array for empty string', () => {
      expect(parseUrls('')).toEqual([]);
    });
    it('returns single item for single URL', () => {
      expect(parseUrls('https://example.com')).toEqual(['https://example.com']);
    });
    it('handles only whitespace lines', () => {
      expect(parseUrls('   \n   \n   ')).toEqual([]);
    });
  });

  describe('validateUrl', () => {
    it('accepts http URLs', () => {
      expect(validateUrl('http://example.com')).toBe(true);
    });
    it('accepts https URLs', () => {
      expect(validateUrl('https://example.com')).toBe(true);
    });
    it('rejects ftp URLs', () => {
      expect(validateUrl('ftp://example.com')).toBe(false);
    });
    it('rejects mailto URLs', () => {
      expect(validateUrl('mailto:test@example.com')).toBe(false);
    });
    it('rejects empty string', () => {
      expect(validateUrl('')).toBe(false);
    });
    it('rejects plain text', () => {
      expect(validateUrl('not-a-url')).toBe(false);
    });
    it('accepts https with path', () => {
      expect(validateUrl('https://api.example.com/health')).toBe(true);
    });
  });

  describe('countValid', () => {
    it('counts valid and invalid correctly', () => {
      const result = countValid([
        'https://good.com',
        'ftp://bad.com',
        'http://also-good.com',
        'not-a-url',
      ]);
      expect(result.valid).toBe(2);
      expect(result.invalid).toBe(2);
    });
    it('returns zero valid for all-invalid list', () => {
      expect(countValid(['bad', 'also-bad'])).toEqual({ valid: 0, invalid: 2 });
    });
    it('returns zero invalid for all-valid list', () => {
      expect(countValid(['https://a.com', 'https://b.com'])).toEqual({
        valid: 2,
        invalid: 0,
      });
    });
    it('handles empty array', () => {
      expect(countValid([])).toEqual({ valid: 0, invalid: 0 });
    });
  });

  describe('buildPayload', () => {
    it('includes folderId when provided', () => {
      const p = buildPayload(['https://x.com'], 'folder-1', [], 60);
      expect(p.folderId).toBe('folder-1');
    });
    it('omits folderId when empty string', () => {
      const p = buildPayload(['https://x.com'], '', [], 60);
      expect(p.folderId).toBeUndefined();
    });
    it('includes urls array', () => {
      const urls = ['https://a.com', 'https://b.com'];
      expect(buildPayload(urls, '', [], 60).urls).toEqual(urls);
    });
    it('includes channelIds', () => {
      const channels = ['ch-1', 'ch-2'];
      expect(buildPayload([], '', channels, 60).channelIds).toEqual(channels);
    });
    it('includes intervalSec', () => {
      expect(buildPayload([], '', [], 300).intervalSec).toBe(300);
    });
    it('payload does not have folderId key at all when empty', () => {
      const p = buildPayload(['https://x.com'], '', [], 60);
      expect('folderId' in p).toBe(false);
    });
  });
});

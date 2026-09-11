import { describe, it, expect } from 'vitest';

// Pure logic mirroring ResponseBodyViewer component

function tryFormatJson(raw: string): { isJson: boolean; formatted: string } {
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null) {
      return { isJson: true, formatted: JSON.stringify(parsed, null, 2) };
    }
    return { isJson: false, formatted: raw };
  } catch {
    return { isJson: false, formatted: raw };
  }
}

function getLineCount(text: string): number {
  return text.split('\n').length;
}

function isTall(lineCount: number): boolean {
  return lineCount > 8;
}

function getTypeLabel(isJson: boolean, charCount: number): string {
  const type = isJson ? 'JSON' : 'text';
  return `${type} · ${charCount} chars`;
}

describe('ResponseBodyViewer — pure logic', () => {
  describe('tryFormatJson', () => {
    it('parses a valid JSON object', () => {
      const { isJson, formatted } = tryFormatJson('{"key":"value"}');
      expect(isJson).toBe(true);
      expect(formatted).toContain('"key"');
    });

    it('returns 2-space indented output for JSON object', () => {
      const { formatted } = tryFormatJson('{"a":1}');
      expect(formatted).toBe(JSON.stringify({ a: 1 }, null, 2));
    });

    it('parses a valid JSON array', () => {
      const { isJson } = tryFormatJson('[1,2,3]');
      expect(isJson).toBe(true);
    });

    it('formats JSON array with indentation', () => {
      const { formatted } = tryFormatJson('[1,2,3]');
      expect(formatted).toBe(JSON.stringify([1, 2, 3], null, 2));
    });

    it('returns isJson=false for invalid JSON', () => {
      const { isJson, formatted } = tryFormatJson('not json {');
      expect(isJson).toBe(false);
      expect(formatted).toBe('not json {');
    });

    it('returns formatted===raw for invalid JSON', () => {
      const raw = 'plain text response';
      const { formatted } = tryFormatJson(raw);
      expect(formatted).toBe(raw);
    });

    it('returns isJson=false for plain text without braces', () => {
      const { isJson } = tryFormatJson('OK');
      expect(isJson).toBe(false);
    });

    it('handles empty string gracefully', () => {
      const { isJson, formatted } = tryFormatJson('');
      expect(isJson).toBe(false);
      expect(formatted).toBe('');
    });

    it('handles nested JSON objects', () => {
      const { isJson, formatted } = tryFormatJson('{"a":{"b":1}}');
      expect(isJson).toBe(true);
      expect(formatted).toContain('"b"');
    });
  });

  describe('getLineCount', () => {
    it('counts a single line', () => {
      expect(getLineCount('hello')).toBe(1);
    });
    it('counts multiple lines', () => {
      expect(getLineCount('a\nb\nc')).toBe(3);
    });
    it('counts empty string as 1 line', () => {
      expect(getLineCount('')).toBe(1);
    });
    it('counts trailing newline', () => {
      expect(getLineCount('a\nb\n')).toBe(3);
    });
  });

  describe('isTall', () => {
    it('returns true for lineCount > 8', () => {
      expect(isTall(9)).toBe(true);
    });
    it('returns false for lineCount === 8', () => {
      expect(isTall(8)).toBe(false);
    });
    it('returns false for lineCount < 8', () => {
      expect(isTall(3)).toBe(false);
    });
    it('returns true for large line counts', () => {
      expect(isTall(100)).toBe(true);
    });
  });

  describe('getTypeLabel', () => {
    it('returns "JSON · N chars" for JSON', () => {
      expect(getTypeLabel(true, 42)).toBe('JSON · 42 chars');
    });
    it('returns "text · N chars" for non-JSON', () => {
      expect(getTypeLabel(false, 100)).toBe('text · 100 chars');
    });
    it('uses exact char count', () => {
      const label = getTypeLabel(true, 0);
      expect(label).toContain('0 chars');
    });
  });
});

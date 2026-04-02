/**
 * Unit tests for HttpConfigSection pure logic.
 * Tests HTTP method options, auth types, assertion management, pre-auth logic.
 */
import { describe, it, expect } from 'vitest';

// ── Constants mirrored from component ────────────────────────────────────────

const HTTP_METHODS = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] as const;
type HttpMethod = (typeof HTTP_METHODS)[number];

const AUTH_TYPES = ['none', 'basic', 'bearer', 'api-key'] as const;
type AuthType = (typeof AUTH_TYPES)[number];

const ASSERTION_OPS = ['exists', 'not-exists', 'equals', 'contains'] as const;

const SECURITY_HEADER_SUGGESTIONS = [
  { header: 'strict-transport-security', op: 'exists' },
  { header: 'x-frame-options', op: 'exists' },
  { header: 'content-security-policy', op: 'exists' },
  { header: 'x-content-type-options', op: 'equals', value: 'nosniff' },
];

type HeaderAssertion = { header: string; op: string; value?: string };

// ── Logic mirrored from component ────────────────────────────────────────────

function addAssertion(assertions: HeaderAssertion[]): HeaderAssertion[] {
  if (assertions.length >= 10) return assertions;
  return [...assertions, { header: '', op: 'exists' }];
}

function removeAssertion(assertions: HeaderAssertion[], index: number): HeaderAssertion[] {
  return assertions.filter((_, i) => i !== index);
}

function updateAssertion(assertions: HeaderAssertion[], index: number, patch: Partial<HeaderAssertion>): HeaderAssertion[] {
  return assertions.map((a, i) => (i === index ? { ...a, ...patch } : a));
}

function isValueInputDisabled(op: string): boolean {
  return op === 'exists' || op === 'not-exists';
}

function needsRequestBody(method: HttpMethod): boolean {
  return ['POST', 'PUT', 'PATCH'].includes(method);
}

function clampMaxRedirects(value: number): number {
  return Math.min(20, Math.max(1, value || 10));
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('HttpConfigSection — HTTP_METHODS', () => {
  it('has 7 methods', () => {
    expect(HTTP_METHODS).toHaveLength(7);
  });

  it('contains expected method names', () => {
    const methods = [...HTTP_METHODS];
    expect(methods).toContain('GET');
    expect(methods).toContain('POST');
    expect(methods).toContain('PUT');
    expect(methods).toContain('PATCH');
    expect(methods).toContain('DELETE');
    expect(methods).toContain('HEAD');
    expect(methods).toContain('OPTIONS');
  });

  it('every method is non-empty string', () => {
    HTTP_METHODS.forEach((m) => expect(m.length).toBeGreaterThan(0));
  });
});

describe('HttpConfigSection — AUTH_TYPES', () => {
  it('has 4 auth types', () => {
    expect(AUTH_TYPES).toHaveLength(4);
  });

  it('contains none, basic, bearer, api-key', () => {
    const types = [...AUTH_TYPES];
    expect(types).toContain('none');
    expect(types).toContain('basic');
    expect(types).toContain('bearer');
    expect(types).toContain('api-key');
  });
});

describe('HttpConfigSection — ASSERTION_OPS', () => {
  it('has 4 assertion operators', () => {
    expect(ASSERTION_OPS).toHaveLength(4);
  });

  it('isValueInputDisabled is true for exists/not-exists', () => {
    expect(isValueInputDisabled('exists')).toBe(true);
    expect(isValueInputDisabled('not-exists')).toBe(true);
  });

  it('isValueInputDisabled is false for equals/contains', () => {
    expect(isValueInputDisabled('equals')).toBe(false);
    expect(isValueInputDisabled('contains')).toBe(false);
  });
});

describe('HttpConfigSection — security header suggestions', () => {
  it('has 4 suggestions', () => {
    expect(SECURITY_HEADER_SUGGESTIONS).toHaveLength(4);
  });

  it('first 3 suggestions use exists op', () => {
    SECURITY_HEADER_SUGGESTIONS.slice(0, 3).forEach((s) => {
      expect(s.op).toBe('exists');
    });
  });

  it('x-content-type-options suggestion uses equals with nosniff', () => {
    const s = SECURITY_HEADER_SUGGESTIONS.find((s) => s.header === 'x-content-type-options');
    expect(s).toBeDefined();
    expect(s!.op).toBe('equals');
    expect(s!.value).toBe('nosniff');
  });

  it('each suggestion has a non-empty header name', () => {
    SECURITY_HEADER_SUGGESTIONS.forEach((s) => {
      expect(s.header.length).toBeGreaterThan(0);
    });
  });
});

describe('HttpConfigSection — addAssertion', () => {
  it('adds empty assertion to empty list', () => {
    const result = addAssertion([]);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ header: '', op: 'exists' });
  });

  it('appends to existing assertions', () => {
    const existing: HeaderAssertion[] = [{ header: 'x-frame-options', op: 'exists' }];
    const result = addAssertion(existing);
    expect(result).toHaveLength(2);
    expect(result[0].header).toBe('x-frame-options');
  });

  it('does not add beyond 10 assertions', () => {
    const full: HeaderAssertion[] = Array.from({ length: 10 }, (_, i) => ({ header: `h${i}`, op: 'exists' }));
    const result = addAssertion(full);
    expect(result).toHaveLength(10);
  });

  it('returns new array reference', () => {
    const original: HeaderAssertion[] = [];
    const result = addAssertion(original);
    expect(result).not.toBe(original);
  });
});

describe('HttpConfigSection — removeAssertion', () => {
  it('removes assertion at given index', () => {
    const assertions: HeaderAssertion[] = [
      { header: 'a', op: 'exists' },
      { header: 'b', op: 'exists' },
      { header: 'c', op: 'exists' },
    ];
    const result = removeAssertion(assertions, 1);
    expect(result).toHaveLength(2);
    expect(result.map((a) => a.header)).toEqual(['a', 'c']);
  });

  it('removes first assertion', () => {
    const assertions: HeaderAssertion[] = [{ header: 'a', op: 'exists' }, { header: 'b', op: 'exists' }];
    const result = removeAssertion(assertions, 0);
    expect(result).toHaveLength(1);
    expect(result[0].header).toBe('b');
  });

  it('removes last assertion', () => {
    const assertions: HeaderAssertion[] = [{ header: 'a', op: 'exists' }, { header: 'b', op: 'exists' }];
    const result = removeAssertion(assertions, 1);
    expect(result).toHaveLength(1);
    expect(result[0].header).toBe('a');
  });
});

describe('HttpConfigSection — updateAssertion', () => {
  it('updates the header field', () => {
    const assertions: HeaderAssertion[] = [{ header: '', op: 'exists' }];
    const result = updateAssertion(assertions, 0, { header: 'x-frame-options' });
    expect(result[0].header).toBe('x-frame-options');
  });

  it('updates the op field', () => {
    const assertions: HeaderAssertion[] = [{ header: 'h', op: 'exists' }];
    const result = updateAssertion(assertions, 0, { op: 'equals' });
    expect(result[0].op).toBe('equals');
  });

  it('updates the value field', () => {
    const assertions: HeaderAssertion[] = [{ header: 'h', op: 'equals', value: undefined }];
    const result = updateAssertion(assertions, 0, { value: 'DENY' });
    expect(result[0].value).toBe('DENY');
  });

  it('does not mutate other assertions', () => {
    const assertions: HeaderAssertion[] = [
      { header: 'a', op: 'exists' },
      { header: 'b', op: 'exists' },
    ];
    const result = updateAssertion(assertions, 0, { header: 'updated' });
    expect(result[1].header).toBe('b');
  });

  it('returns new array reference', () => {
    const assertions: HeaderAssertion[] = [{ header: 'h', op: 'exists' }];
    const result = updateAssertion(assertions, 0, { header: 'x' });
    expect(result).not.toBe(assertions);
  });
});

describe('HttpConfigSection — needsRequestBody', () => {
  it('is true for POST', () => {
    expect(needsRequestBody('POST')).toBe(true);
  });

  it('is true for PUT', () => {
    expect(needsRequestBody('PUT')).toBe(true);
  });

  it('is true for PATCH', () => {
    expect(needsRequestBody('PATCH')).toBe(true);
  });

  it('is false for GET', () => {
    expect(needsRequestBody('GET')).toBe(false);
  });

  it('is false for HEAD', () => {
    expect(needsRequestBody('HEAD')).toBe(false);
  });

  it('is false for DELETE', () => {
    expect(needsRequestBody('DELETE')).toBe(false);
  });

  it('is false for OPTIONS', () => {
    expect(needsRequestBody('OPTIONS')).toBe(false);
  });
});

describe('HttpConfigSection — clampMaxRedirects', () => {
  it('clamps to max 20', () => {
    expect(clampMaxRedirects(99)).toBe(20);
  });

  it('uses default 10 for value 0 (falsy)', () => {
    expect(clampMaxRedirects(0)).toBe(10);
  });

  it('uses default 10 for falsy value', () => {
    expect(clampMaxRedirects(NaN)).toBe(10);
  });

  it('accepts value in range', () => {
    expect(clampMaxRedirects(5)).toBe(5);
  });

  it('accepts boundary 1', () => {
    expect(clampMaxRedirects(1)).toBe(1);
  });

  it('accepts boundary 20', () => {
    expect(clampMaxRedirects(20)).toBe(20);
  });
});

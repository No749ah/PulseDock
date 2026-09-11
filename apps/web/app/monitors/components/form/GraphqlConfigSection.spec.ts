/**
 * Unit tests for GraphqlConfigSection pure logic.
 * Tests default query, variable parsing, JSONPath validation.
 */
import { describe, it, expect } from 'vitest';

// ── Constants mirrored from component ────────────────────────────────────────

const GRAPHQL_DEFAULT_QUERY = '{ __typename }';
const GRAPHQL_VARIABLES_PLACEHOLDER = '{ "id": "123" }';
const GRAPHQL_DATA_PATH_PLACEHOLDER = '$.data.__typename';

// ── Logic mirrored from component ────────────────────────────────────────────

function resolveGraphqlQuery(query: string | null | undefined): string {
  return query?.trim() || GRAPHQL_DEFAULT_QUERY;
}

function parseGraphqlVariables(raw: string | null | undefined): Record<string, unknown> | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function isValidJsonPath(path: string): boolean {
  if (!path) return false;
  return path.startsWith('$');
}

function normalizeGraphqlField(value: string): string | null {
  return value.trim() || null;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GraphqlConfigSection — default query', () => {
  it('default introspection query is correct', () => {
    expect(GRAPHQL_DEFAULT_QUERY).toBe('{ __typename }');
  });

  it('uses default when query is empty', () => {
    expect(resolveGraphqlQuery('')).toBe(GRAPHQL_DEFAULT_QUERY);
    expect(resolveGraphqlQuery(null)).toBe(GRAPHQL_DEFAULT_QUERY);
    expect(resolveGraphqlQuery(undefined)).toBe(GRAPHQL_DEFAULT_QUERY);
  });

  it('uses custom query when provided', () => {
    const custom = '{ user { id name } }';
    expect(resolveGraphqlQuery(custom)).toBe(custom);
  });

  it('uses default when query is whitespace only', () => {
    expect(resolveGraphqlQuery('   ')).toBe(GRAPHQL_DEFAULT_QUERY);
  });
});

describe('GraphqlConfigSection — parseGraphqlVariables', () => {
  it('returns null for empty/null input', () => {
    expect(parseGraphqlVariables(null)).toBeNull();
    expect(parseGraphqlVariables(undefined)).toBeNull();
    expect(parseGraphqlVariables('')).toBeNull();
    expect(parseGraphqlVariables('   ')).toBeNull();
  });

  it('parses valid JSON object', () => {
    const result = parseGraphqlVariables('{ "id": "123" }');
    expect(result).toEqual({ id: '123' });
  });

  it('returns null for invalid JSON', () => {
    expect(parseGraphqlVariables('not json')).toBeNull();
    expect(parseGraphqlVariables('{broken')).toBeNull();
  });

  it('returns null for JSON array', () => {
    expect(parseGraphqlVariables('[1, 2, 3]')).toBeNull();
  });

  it('returns null for JSON string literal', () => {
    expect(parseGraphqlVariables('"string"')).toBeNull();
  });

  it('returns null for JSON null', () => {
    expect(parseGraphqlVariables('null')).toBeNull();
  });

  it('parses nested object', () => {
    const result = parseGraphqlVariables('{"user": {"id": 1}}');
    expect(result).toEqual({ user: { id: 1 } });
  });
});

describe('GraphqlConfigSection — isValidJsonPath', () => {
  it('returns false for empty string', () => {
    expect(isValidJsonPath('')).toBe(false);
  });

  it('returns true for paths starting with $', () => {
    expect(isValidJsonPath('$.data.__typename')).toBe(true);
    expect(isValidJsonPath('$.user.id')).toBe(true);
    expect(isValidJsonPath('$')).toBe(true);
  });

  it('returns false for paths not starting with $', () => {
    expect(isValidJsonPath('data.user')).toBe(false);
    expect(isValidJsonPath('.data')).toBe(false);
  });
});

describe('GraphqlConfigSection — normalizeGraphqlField', () => {
  it('returns null for empty string', () => {
    expect(normalizeGraphqlField('')).toBeNull();
  });

  it('returns null for whitespace-only', () => {
    expect(normalizeGraphqlField('   ')).toBeNull();
  });

  it('trims and returns non-empty string', () => {
    expect(normalizeGraphqlField('  $.data  ')).toBe('$.data');
  });

  it('returns value as-is when already trimmed', () => {
    expect(normalizeGraphqlField('$.data.id')).toBe('$.data.id');
  });
});

describe('GraphqlConfigSection — placeholder texts', () => {
  it('variables placeholder is valid JSON', () => {
    expect(() => JSON.parse(GRAPHQL_VARIABLES_PLACEHOLDER)).not.toThrow();
  });

  it('data path placeholder starts with $', () => {
    expect(GRAPHQL_DATA_PATH_PLACEHOLDER.startsWith('$')).toBe(true);
  });

  it('data path placeholder contains __typename', () => {
    expect(GRAPHQL_DATA_PATH_PLACEHOLDER).toContain('__typename');
  });
});

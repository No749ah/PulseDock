import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runGraphQLCheck, substituteVariables } from './graphql.runner';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function makeResponse(body: unknown, status = 200) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

describe('runGraphQLCheck', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns green for a basic introspection health check', async () => {
    mockFetch.mockResolvedValueOnce(
      makeResponse({ data: { __typename: 'Query' } }),
    );
    const result = await runGraphQLCheck({ url: 'https://api.example.com/graphql' });
    expect(result.ok).toBe(true);
    expect(result.level).toBe('green');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.statusCode).toBe(200);
  });

  it('returns yellow for GraphQL errors in response', async () => {
    mockFetch.mockResolvedValueOnce(
      makeResponse({
        errors: [{ message: 'Field not found' }, { message: 'Unauthorized' }],
        data: null,
      }),
    );
    const result = await runGraphQLCheck({ url: 'https://api.example.com/graphql' });
    expect(result.ok).toBe(false);
    expect(result.level).toBe('yellow');
    expect(result.message).toContain('GraphQL errors');
    expect(result.graphqlErrors).toHaveLength(2);
  });

  it('returns yellow when "data" field is missing from response', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ message: 'not a graphql response' }));
    const result = await runGraphQLCheck({ url: 'https://api.example.com/graphql' });
    expect(result.ok).toBe(false);
    expect(result.level).toBe('yellow');
    expect(result.message).toContain('missing "data" field');
  });

  it('returns red for HTTP 500', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({}, 500));
    const result = await runGraphQLCheck({ url: 'https://api.example.com/graphql' });
    expect(result.ok).toBe(false);
    expect(result.level).toBe('red');
    expect(result.message).toContain('500');
  });

  it('returns yellow for HTTP 401 authentication error', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({}, 401));
    const result = await runGraphQLCheck({ url: 'https://api.example.com/graphql' });
    expect(result.ok).toBe(false);
    expect(result.level).toBe('yellow');
    expect(result.message).toContain('Authentication error');
  });

  it('returns red for connection errors', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const result = await runGraphQLCheck({ url: 'https://api.example.com/graphql' });
    expect(result.ok).toBe(false);
    expect(result.level).toBe('red');
    expect(result.message).toContain('ECONNREFUSED');
  });

  it('returns red for timeout', async () => {
    mockFetch.mockRejectedValueOnce(new Error('The operation was aborted'));
    const result = await runGraphQLCheck({ url: 'https://api.example.com/graphql', timeoutMs: 100 });
    expect(result.ok).toBe(false);
    expect(result.level).toBe('red');
    expect(result.message).toContain('Timeout');
  });

  it('returns green when dataPath field exists and matches expectedValue', async () => {
    mockFetch.mockResolvedValueOnce(
      makeResponse({ data: { status: { health: 'ok' } } }),
    );
    const result = await runGraphQLCheck({
      url: 'https://api.example.com/graphql',
      query: '{ status { health } }',
      dataPath: '$.data.status.health',
      expectedValue: 'ok',
    });
    expect(result.ok).toBe(true);
    expect(result.level).toBe('green');
    expect(result.resolvedValue).toBe('ok');
  });

  it('returns yellow when dataPath field value does not match expected', async () => {
    mockFetch.mockResolvedValueOnce(
      makeResponse({ data: { status: { health: 'degraded' } } }),
    );
    const result = await runGraphQLCheck({
      url: 'https://api.example.com/graphql',
      query: '{ status { health } }',
      dataPath: '$.data.status.health',
      expectedValue: 'ok',
    });
    expect(result.ok).toBe(false);
    expect(result.level).toBe('yellow');
    expect(result.message).toContain('expected "ok" but got "degraded"');
  });

  it('returns yellow when dataPath field is missing from response', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ data: {} }));
    const result = await runGraphQLCheck({
      url: 'https://api.example.com/graphql',
      dataPath: '$.data.nonexistent.field',
    });
    expect(result.ok).toBe(false);
    expect(result.level).toBe('yellow');
    expect(result.message).toContain('not found in response');
  });

  it('returns yellow for invalid JSON in variables', async () => {
    const result = await runGraphQLCheck({
      url: 'https://api.example.com/graphql',
      variables: 'not-valid-json',
    });
    expect(result.ok).toBe(false);
    expect(result.level).toBe('yellow');
    expect(result.message).toContain('Invalid JSON in graphql variables');
  });

  it('returns red for non-JSON response body', async () => {
    mockFetch.mockResolvedValueOnce({
      status: 200,
      ok: true,
      json: () => Promise.reject(new Error('Invalid JSON')),
    } as unknown as Response);
    const result = await runGraphQLCheck({ url: 'https://api.example.com/graphql' });
    expect(result.ok).toBe(false);
    expect(result.level).toBe('red');
    expect(result.message).toContain('not valid JSON');
  });

  it('green when dataPath field exists without expectedValue constraint', async () => {
    mockFetch.mockResolvedValueOnce(
      makeResponse({ data: { viewer: { login: 'octocat' } } }),
    );
    const result = await runGraphQLCheck({
      url: 'https://api.github.com/graphql',
      query: '{ viewer { login } }',
      dataPath: '$.data.viewer.login',
      // no expectedValue — just check field exists
    });
    expect(result.ok).toBe(true);
    expect(result.resolvedValue).toBe('octocat');
  });

  it('substitutes template variables in the query', async () => {
    mockFetch.mockResolvedValueOnce(
      makeResponse({ data: { user: { name: 'Alice' } } }),
    );
    await runGraphQLCheck({
      url: 'https://api.example.com/graphql',
      query: '{ user(id: "{{USER_ID}}") { name } }',
      templateVars: { USER_ID: '42' },
    });
    const sentBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(sentBody.query).toBe('{ user(id: "42") { name } }');
  });

  it('returns yellow when latency exceeds threshold (no dataPath)', async () => {
    // Simulate slow response by mocking Date.now
    let callCount = 0;
    const originalNow = Date.now;
    vi.spyOn(Date, 'now').mockImplementation(() => {
      callCount++;
      // First call = start, subsequent calls = after fetch
      return callCount === 1 ? 1000 : 2500;
    });

    mockFetch.mockResolvedValueOnce(
      makeResponse({ data: { __typename: 'Query' } }),
    );

    const result = await runGraphQLCheck({
      url: 'https://api.example.com/graphql',
      latencyThresholdMs: 500,
    });
    expect(result.ok).toBe(true);
    expect(result.level).toBe('yellow');
    expect(result.message).toContain('slow');
    expect(result.message).toContain('threshold');

    Date.now = originalNow;
  });

  it('returns yellow when latency exceeds threshold (with dataPath)', async () => {
    let callCount = 0;
    vi.spyOn(Date, 'now').mockImplementation(() => {
      callCount++;
      return callCount === 1 ? 1000 : 3000;
    });

    mockFetch.mockResolvedValueOnce(
      makeResponse({ data: { status: 'ok' } }),
    );

    const result = await runGraphQLCheck({
      url: 'https://api.example.com/graphql',
      dataPath: '$.data.status',
      expectedValue: 'ok',
      latencyThresholdMs: 500,
    });
    expect(result.ok).toBe(true);
    expect(result.level).toBe('yellow');
    expect(result.message).toContain('slow');
  });

  it('runs introspection validation and returns schemaHash', async () => {
    const schemaData = {
      __schema: {
        queryType: { name: 'Query' },
        mutationType: null,
        subscriptionType: null,
        types: [{ name: 'Query', kind: 'OBJECT', fields: [{ name: 'hello', type: { name: 'String', kind: 'SCALAR', ofType: null } }] }],
      },
    };

    // First call = main query, second call = introspection
    mockFetch
      .mockResolvedValueOnce(makeResponse({ data: { __typename: 'Query' } }))
      .mockResolvedValueOnce(makeResponse({ data: schemaData }));

    const result = await runGraphQLCheck({
      url: 'https://api.example.com/graphql',
      validateIntrospection: true,
    });
    expect(result.ok).toBe(true);
    expect(result.level).toBe('green');
    expect(result.schemaHash).toBeDefined();
    expect(result.schemaHash!.length).toBe(16);
    expect(result.schemaTypeCount).toBe(1);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('detects schema change via previousSchemaHash', async () => {
    const schemaData = {
      __schema: {
        queryType: { name: 'Query' },
        mutationType: null,
        subscriptionType: null,
        types: [{ name: 'Query', kind: 'OBJECT', fields: [] }],
      },
    };

    mockFetch
      .mockResolvedValueOnce(makeResponse({ data: { __typename: 'Query' } }))
      .mockResolvedValueOnce(makeResponse({ data: schemaData }));

    const result = await runGraphQLCheck({
      url: 'https://api.example.com/graphql',
      validateIntrospection: true,
      previousSchemaHash: 'aaaaaaaaaaaaaaaa', // won't match
    });
    expect(result.ok).toBe(true);
    expect(result.schemaChanged).toBe(true);
    expect(result.message).toContain('schema changed');
  });
});

describe('substituteVariables', () => {
  it('replaces known placeholders', () => {
    expect(substituteVariables('Hello {{NAME}}!', { NAME: 'World' })).toBe('Hello World!');
  });

  it('leaves unknown placeholders intact', () => {
    expect(substituteVariables('{{KNOWN}} {{UNKNOWN}}', { KNOWN: 'yes' })).toBe('yes {{UNKNOWN}}');
  });

  it('handles multiple occurrences', () => {
    expect(substituteVariables('{{A}} and {{A}}', { A: 'x' })).toBe('x and x');
  });

  it('returns original string when no vars provided', () => {
    expect(substituteVariables('no vars {{HERE}}', {})).toBe('no vars {{HERE}}');
  });
});

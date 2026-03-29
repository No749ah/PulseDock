import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { MonitorsService } from './monitors.service';

// Minimal stub — previewFromOpenApi and importFromOpenApi have no Prisma dependency for preview
function makeService(): MonitorsService {
  const svc = new MonitorsService(
    null as never,
    null as never,
    null as never,
    null as never,
    null as never,
  );
  return svc;
}

const OPENAPI3_SPEC = JSON.stringify({
  openapi: '3.0.0',
  info: { title: 'Test API', version: '1.0.0' },
  paths: {
    '/users': {
      get: { summary: 'List users', tags: ['users'] },
      post: { summary: 'Create user', tags: ['users'] },
    },
    '/health': {
      get: { summary: 'Health check' },
    },
  },
});

const SWAGGER2_SPEC = JSON.stringify({
  swagger: '2.0',
  info: { title: 'Old API', version: '1.0.0' },
  basePath: '/api/v1',
  paths: {
    '/items': {
      get: { summary: 'List items' },
    },
    '/items/{id}': {
      get: { summary: 'Get item' },
      delete: { summary: 'Delete item' },
    },
  },
});

describe('MonitorsService.previewFromOpenApi', () => {
  let service: MonitorsService;

  beforeEach(() => {
    service = makeService();
  });

  it('returns suggestions for OpenAPI 3.x spec with GET/POST paths', async () => {
    const result = await service.previewFromOpenApi({
      specJson: OPENAPI3_SPEC,
      baseUrl: 'https://api.example.com',
    });

    expect(result.suggestions).toBeDefined();
    expect(result.suggestions.length).toBe(3);

    const listUsers = result.suggestions.find((s) => s.key === 'GET:/users');
    expect(listUsers).toBeDefined();
    expect(listUsers?.method).toBe('GET');
    expect(listUsers?.path).toBe('/users');
    expect(listUsers?.url).toBe('https://api.example.com/users');
    expect(listUsers?.expectedStatus).toBe(200);
    expect(listUsers?.summary).toBe('List users');
    expect(listUsers?.tags).toEqual(['users']);

    const createUser = result.suggestions.find((s) => s.key === 'POST:/users');
    expect(createUser).toBeDefined();
    expect(createUser?.method).toBe('POST');
    expect(createUser?.expectedStatus).toBe(201);
  });

  it('handles Swagger 2.x spec with basePath prefix', async () => {
    const result = await service.previewFromOpenApi({
      specJson: SWAGGER2_SPEC,
      baseUrl: 'https://api.example.com',
    });

    expect(result.suggestions.length).toBe(3);

    const listItems = result.suggestions.find((s) => s.key === 'GET:/items');
    expect(listItems).toBeDefined();
    // URL should include basePath
    expect(listItems?.url).toBe('https://api.example.com/api/v1/items');

    const deleteItem = result.suggestions.find((s) => s.key === 'DELETE:/items/{id}');
    expect(deleteItem).toBeDefined();
    expect(deleteItem?.expectedStatus).toBe(204);
  });

  it('respects maxPaths limit', async () => {
    const result = await service.previewFromOpenApi({
      specJson: OPENAPI3_SPEC,
      baseUrl: 'https://api.example.com',
      maxPaths: 2,
    });

    expect(result.suggestions.length).toBeLessThanOrEqual(2);
  });

  it('replaces {param} placeholders with values in URLs', async () => {
    const specWithParams = JSON.stringify({
      openapi: '3.0.0',
      info: { title: 'Param API', version: '1.0.0' },
      paths: {
        '/users/{userId}/posts/{postId}': {
          get: { summary: 'Get user post' },
        },
        '/items/{slug}/details': {
          get: { summary: 'Get item details' },
        },
      },
    });

    const result = await service.previewFromOpenApi({
      specJson: specWithParams,
      baseUrl: 'https://api.example.com',
    });

    const userPost = result.suggestions.find((s) => s.key === 'GET:/users/{userId}/posts/{postId}');
    expect(userPost).toBeDefined();
    expect(userPost?.url).toBe('https://api.example.com/users/1/posts/1');

    const itemDetails = result.suggestions.find((s) => s.key === 'GET:/items/{slug}/details');
    expect(itemDetails).toBeDefined();
    expect(itemDetails?.url).toBe('https://api.example.com/items/example/details');
  });

  it('returns empty suggestions for spec with no paths', async () => {
    const emptySpec = JSON.stringify({
      openapi: '3.0.0',
      info: { title: 'Empty API', version: '1.0.0' },
      paths: {},
    });

    const result = await service.previewFromOpenApi({
      specJson: emptySpec,
      baseUrl: 'https://api.example.com',
    });

    expect(result.suggestions).toHaveLength(0);
  });

  it('throws BadRequestException when neither url nor specJson is provided', async () => {
    await expect(
      service.previewFromOpenApi({ baseUrl: 'https://api.example.com' }),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('MonitorsService.importFromOpenApi', () => {
  let service: MonitorsService;

  beforeEach(() => {
    service = makeService();
    // Mock create to avoid Prisma
    let idCounter = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (service as any).create = async (_userId: string, body: { name: string; target: string }) => {
      idCounter++;
      return { id: `mock-${idCounter}`, name: body.name, target: body.target };
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates monitors only for selected paths', async () => {
    const result = await service.importFromOpenApi('user-1', {
      specJson: OPENAPI3_SPEC,
      baseUrl: 'https://api.example.com',
      selectedPaths: ['GET:/users', 'POST:/users'],
      intervalSec: 60,
    });

    expect(result.created).toBe(2);
    expect(result.monitors).toHaveLength(2);

    const names = (result.monitors as { name: string }[]).map((m) => m.name);
    expect(names).toContain('List users');
    expect(names).toContain('Create user');
  });
});

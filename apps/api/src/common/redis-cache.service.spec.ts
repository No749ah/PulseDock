import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RedisCacheService } from './redis-cache.service';

// Mock ioredis so tests don't need a real Redis server
vi.mock('ioredis', () => {
  const store = new Map<string, string>();
  class MockRedis {
    private handlers: Map<string, (...args: unknown[]) => void> = new Map();
    on(event: string, handler: (...args: unknown[]) => void) {
      this.handlers.set(event, handler);
      return this;
    }
    async connect() {
      this.handlers.get('connect')?.();
      return this;
    }
    async get(key: string): Promise<string | null> {
      return store.get(key) ?? null;
    }
    async setex(key: string, ttl: number, value: string): Promise<void> {
      store.set(key, value);
    }
    async del(...keys: string[]): Promise<void> {
      for (const k of keys) store.delete(k);
    }
    async scan(cursor: string, _match: string, pattern: string, _count: string, _n: number): Promise<[string, string[]]> {
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
      const matching = [...store.keys()].filter((k) => regex.test(k));
      return ['0', matching];
    }
    async quit() {}
    beforeEach() {
      store.clear();
    }
  }
  return { default: MockRedis };
});

describe('RedisCacheService', () => {
  let service: RedisCacheService;

  beforeEach(async () => {
    service = new RedisCacheService();
    await service.onModuleInit();
    // Allow connect event to fire
    await new Promise((r) => setTimeout(r, 0));
  });

  it('returns null for a missing key', async () => {
    const result = await service.get('nonexistent');
    expect(result).toBeNull();
  });

  it('stores and retrieves a value', async () => {
    await service.set('mykey', { foo: 'bar' }, 60);
    const result = await service.get<{ foo: string }>('mykey');
    expect(result).toEqual({ foo: 'bar' });
  });

  it('deletes a key', async () => {
    await service.set('delkey', { x: 1 }, 60);
    await service.del('delkey');
    expect(await service.get('delkey')).toBeNull();
  });

  it('invalidates keys by pattern', async () => {
    await service.set('widget:abc:uptime-bar:mon1:default', { data: 1 }, 60);
    await service.set('widget:def:uptime-bar:mon2:default', { data: 2 }, 60);
    await service.set('other:key', { data: 3 }, 60);
    await service.invalidatePattern('widget:*');
    expect(await service.get('widget:abc:uptime-bar:mon1:default')).toBeNull();
    expect(await service.get('widget:def:uptime-bar:mon2:default')).toBeNull();
    // Non-matching key should remain
    expect(await service.get('other:key')).not.toBeNull();
  });

  it('isConnected returns true after successful connect', async () => {
    expect(service.isConnected()).toBe(true);
  });
});

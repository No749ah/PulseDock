import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';

/** Default TTL in seconds for widget data cache entries. */
const DEFAULT_TTL_SEC = 30;

/**
 * Provides a Redis-backed cache for frequently-accessed read-heavy data.
 * Used primarily for status-page widget data to reduce DB load on public pages
 * that refresh every 60s with potentially many concurrent viewers.
 *
 * Gracefully degrades — if Redis is unavailable, all cache operations are no-ops
 * so callers fall through to the DB without any error propagation.
 */
@Injectable()
export class RedisCacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisCacheService.name);
  private client: Redis | null = null;
  private connected = false;

  onModuleInit(): void {
    const redisUrl = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
    try {
      this.client = new Redis(redisUrl, {
        lazyConnect: true,
        connectTimeout: 3000,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
      });

      this.client.on('connect', () => {
        this.connected = true;
        this.logger.log('Redis cache connected');
      });

      this.client.on('error', (err: Error) => {
        this.connected = false;
        this.logger.warn(`Redis cache error: ${err.message}`);
      });

      this.client.connect().catch((err: Error) => {
        this.logger.warn(`Redis cache initial connect failed: ${err.message}`);
      });
    } catch (err) {
      this.logger.warn(`Redis cache init failed: ${(err as Error).message}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      await this.client.quit().catch(() => {});
    }
  }

  /**
   * Retrieve a cached value by key.
   * @param key - Cache key
   * @returns Parsed value, or null if not found / Redis unavailable
   */
  async get<T>(key: string): Promise<T | null> {
    if (!this.client || !this.connected) return null;
    try {
      const raw = await this.client.get(key);
      if (!raw) return null;
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  /**
   * Store a value in the cache.
   * @param key - Cache key
   * @param value - Value to cache (must be JSON-serializable)
   * @param ttlSec - Time-to-live in seconds (default: 30)
   */
  async set(key: string, value: unknown, ttlSec: number = DEFAULT_TTL_SEC): Promise<void> {
    if (!this.client || !this.connected) return;
    try {
      await this.client.setex(key, ttlSec, JSON.stringify(value));
    } catch {
      // Silently ignore — cache is best-effort
    }
  }

  /**
   * Invalidate all keys matching a pattern.
   * @param pattern - Redis glob pattern (e.g., "widget:monitorId:*")
   */
  async invalidatePattern(pattern: string): Promise<void> {
    if (!this.client || !this.connected) return;
    try {
      let cursor = '0';
      do {
        const [nextCursor, keys] = await this.client.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        cursor = nextCursor;
        if (keys.length > 0) {
          await this.client.del(...keys);
        }
      } while (cursor !== '0');
    } catch {
      // Silently ignore
    }
  }

  /**
   * Delete a specific cache key.
   * @param key - Cache key to delete
   */
  async del(key: string): Promise<void> {
    if (!this.client || !this.connected) return;
    try {
      await this.client.del(key);
    } catch {
      // Silently ignore
    }
  }

  /** Returns whether the Redis cache is currently connected and usable. */
  isConnected(): boolean {
    return this.connected;
  }
}

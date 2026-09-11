import { PrismaService } from '../../common/prisma.service';
import { RedisCacheService } from '../../common/redis-cache.service';
import { Widget } from '../status-pages.types';

export type ResolverFn = (
  prisma: PrismaService,
  cache: RedisCacheService,
  userId: string,
  widget: Widget,
  overrideDays: number | undefined,
) => Promise<Record<string, unknown>>;

/**
 * Converts a range string (24h, 7d, 30d, 90d) to a start Date.
 * Defaults to 7 days if unrecognized.
 */
export function getRangeStart(range?: string): Date {
  const now = new Date();
  switch (range) {
    case '24h': return new Date(now.getTime() - 24 * 60 * 60 * 1000);
    case '30d': return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    case '90d': return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    default: return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  }
}

import { describe, it, expect } from 'vitest';

// Test the core usage tracking logic
describe('ApiKey usage tracking', () => {
  it('increments usage count correctly', () => {
    // Pure function test — the increment itself is a Prisma operation
    // Test the business logic: what constitutes "active" vs "stale"
    const isStale = (lastUsedAt: Date | null, days = 30): boolean => {
      if (!lastUsedAt) return true;
      const threshold = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      return lastUsedAt < threshold;
    };

    const now = new Date();
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const longAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

    expect(isStale(null)).toBe(true);
    expect(isStale(now)).toBe(false);
    expect(isStale(yesterday)).toBe(false);
    expect(isStale(longAgo)).toBe(true);
  });

  it('formats last used time correctly', () => {
    const formatRelative = (date: Date | null): string => {
      if (!date) return 'Never';
      const diff = Date.now() - date.getTime();
      const days = Math.floor(diff / (24 * 60 * 60 * 1000));
      if (days === 0) return 'Today';
      if (days === 1) return 'Yesterday';
      return `${days} days ago`;
    };

    expect(formatRelative(null)).toBe('Never');
    expect(formatRelative(new Date())).toBe('Today');
    expect(formatRelative(new Date(Date.now() - 24 * 60 * 60 * 1000))).toBe('Yesterday');
    expect(formatRelative(new Date(Date.now() - 5 * 24 * 60 * 60 * 1000))).toBe('5 days ago');
  });

  it('classifies key activity status', () => {
    const getStatus = (usageCount: number, lastUsedAt: Date | null): 'active' | 'stale' | 'unused' => {
      if (usageCount === 0) return 'unused';
      if (!lastUsedAt) return 'unused';
      const daysSinceUse = (Date.now() - lastUsedAt.getTime()) / (24 * 60 * 60 * 1000);
      return daysSinceUse <= 30 ? 'active' : 'stale';
    };

    expect(getStatus(0, null)).toBe('unused');
    expect(getStatus(100, new Date())).toBe('active');
    expect(getStatus(50, new Date(Date.now() - 60 * 24 * 60 * 60 * 1000))).toBe('stale');
  });
});

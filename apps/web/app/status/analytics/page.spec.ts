/**
 * @vitest-environment node
 * Unit tests for pure helpers in status/analytics/page.tsx
 */

import { describe, it, expect, vi, afterEach } from 'vitest';

// ── Inline helpers from page.tsx ─────────────────────────────────────────────

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// Derived computations from page component
function computeTotalViews(pages: { viewCount: number }[]): number {
  return pages.reduce((sum, p) => sum + p.viewCount, 0);
}

function computePublishedCount(pages: { isPublished: boolean }[]): number {
  return pages.filter(p => p.isPublished).length;
}

function computeMostViewed(pages: { title: string; viewCount: number }[]): { title: string; viewCount: number } | undefined {
  return pages[0]; // data is sorted by viewCount desc from API
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('status/analytics/page — formatRelativeTime', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('returns "Never" for null', () => {
    expect(formatRelativeTime(null)).toBe('Never');
  });

  it('returns "Just now" for < 1 minute ago', () => {
    vi.useFakeTimers();
    const now = new Date('2026-04-03T06:00:00Z').getTime();
    vi.setSystemTime(now);
    expect(formatRelativeTime(new Date(now - 30000).toISOString())).toBe('Just now');
    expect(formatRelativeTime(new Date(now - 59999).toISOString())).toBe('Just now');
  });

  it('returns Nm ago for 1–59 minutes', () => {
    vi.useFakeTimers();
    const now = new Date('2026-04-03T06:00:00Z').getTime();
    vi.setSystemTime(now);
    expect(formatRelativeTime(new Date(now - 60000).toISOString())).toBe('1m ago');
    expect(formatRelativeTime(new Date(now - 10 * 60000).toISOString())).toBe('10m ago');
    expect(formatRelativeTime(new Date(now - 59 * 60000).toISOString())).toBe('59m ago');
  });

  it('returns Nh ago for 1–23 hours', () => {
    vi.useFakeTimers();
    const now = new Date('2026-04-03T06:00:00Z').getTime();
    vi.setSystemTime(now);
    expect(formatRelativeTime(new Date(now - 3600000).toISOString())).toBe('1h ago');
    expect(formatRelativeTime(new Date(now - 6 * 3600000).toISOString())).toBe('6h ago');
    expect(formatRelativeTime(new Date(now - 23 * 3600000).toISOString())).toBe('23h ago');
  });

  it('returns Nd ago for 24h+', () => {
    vi.useFakeTimers();
    const now = new Date('2026-04-03T06:00:00Z').getTime();
    vi.setSystemTime(now);
    expect(formatRelativeTime(new Date(now - 24 * 3600000).toISOString())).toBe('1d ago');
    expect(formatRelativeTime(new Date(now - 7 * 24 * 3600000).toISOString())).toBe('7d ago');
    expect(formatRelativeTime(new Date(now - 30 * 24 * 3600000).toISOString())).toBe('30d ago');
  });

  it('capitalization: "Just now" (capital J) vs lowercase minute/hour/day versions', () => {
    vi.useFakeTimers();
    const now = new Date('2026-04-03T06:00:00Z').getTime();
    vi.setSystemTime(now);
    const justNow = formatRelativeTime(new Date(now - 10000).toISOString());
    expect(justNow[0]).toBe('J'); // capital J
    const minuteAgo = formatRelativeTime(new Date(now - 60000).toISOString());
    expect(minuteAgo).toMatch(/^\d/); // starts with digit
  });
});

describe('status/analytics/page — computeTotalViews', () => {
  it('returns 0 for empty array', () => {
    expect(computeTotalViews([])).toBe(0);
  });

  it('sums all view counts', () => {
    expect(computeTotalViews([
      { viewCount: 100 },
      { viewCount: 250 },
      { viewCount: 50 },
    ])).toBe(400);
  });

  it('handles single page', () => {
    expect(computeTotalViews([{ viewCount: 999 }])).toBe(999);
  });

  it('handles zero view counts', () => {
    expect(computeTotalViews([{ viewCount: 0 }, { viewCount: 0 }])).toBe(0);
  });
});

describe('status/analytics/page — computePublishedCount', () => {
  it('returns 0 for empty array', () => {
    expect(computePublishedCount([])).toBe(0);
  });

  it('counts only published pages', () => {
    expect(computePublishedCount([
      { isPublished: true },
      { isPublished: false },
      { isPublished: true },
    ])).toBe(2);
  });

  it('returns total if all published', () => {
    expect(computePublishedCount([
      { isPublished: true },
      { isPublished: true },
    ])).toBe(2);
  });

  it('returns 0 if none published', () => {
    expect(computePublishedCount([
      { isPublished: false },
      { isPublished: false },
    ])).toBe(0);
  });
});

describe('status/analytics/page — computeMostViewed', () => {
  it('returns undefined for empty array', () => {
    expect(computeMostViewed([])).toBeUndefined();
  });

  it('returns first element (assumed sorted by viewCount desc)', () => {
    const pages = [
      { title: 'Top Page', viewCount: 500 },
      { title: 'Mid Page', viewCount: 200 },
      { title: 'Low Page', viewCount: 10 },
    ];
    const result = computeMostViewed(pages);
    expect(result?.title).toBe('Top Page');
    expect(result?.viewCount).toBe(500);
  });

  it('returns the single item when there is only one page', () => {
    const result = computeMostViewed([{ title: 'Only', viewCount: 42 }]);
    expect(result?.title).toBe('Only');
  });
});

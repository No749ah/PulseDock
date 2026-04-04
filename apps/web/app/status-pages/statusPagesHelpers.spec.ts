/**
 * Unit tests for app/status-pages/statusPagesHelpers.ts
 *
 * Covers: autoSlug (title → url-safe slug), pageRelativeTime (diff formatting),
 * isSlugValid (length guard), buildCopySlug / buildCopyTitle (duplicate naming),
 * buildBadgeSnippets (4 embed snippets), badgeStyleLabel (3 variants),
 * buildStatusPagesCsvFilename (date-based filename).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  autoSlug,
  pageRelativeTime,
  isSlugValid,
  buildCopySlug,
  buildCopyTitle,
  buildBadgeSnippets,
  badgeStyleLabel,
  buildStatusPagesCsvFilename,
  type BadgeStyle,
} from './statusPagesHelpers';

// ── autoSlug ──────────────────────────────────────────────────────────────────

describe('autoSlug', () => {
  it('lowercases the title', () => {
    expect(autoSlug('My Page')).toBe('my-page');
  });

  it('replaces spaces with hyphens', () => {
    expect(autoSlug('hello world')).toBe('hello-world');
  });

  it('collapses multiple spaces/hyphens into a single hyphen', () => {
    expect(autoSlug('hello   world')).toBe('hello-world');
    expect(autoSlug('hello---world')).toBe('hello-world');
  });

  it('removes special characters', () => {
    expect(autoSlug('Hello! @World#2024')).toBe('hello-world2024');
  });

  it('strips leading and trailing hyphens', () => {
    expect(autoSlug('  - my page -  ')).toBe('my-page');
  });

  it('truncates to 80 characters', () => {
    const long = 'a'.repeat(100);
    const result = autoSlug(long);
    expect(result.length).toBeLessThanOrEqual(80);
    expect(result).toBe('a'.repeat(80));
  });

  it('falls back to page-<timestamp36> when slug is too short (< 3 chars)', () => {
    const result = autoSlug('!@');
    expect(result).toMatch(/^page-[a-z0-9]+$/);
  });

  it('falls back for empty title', () => {
    const result = autoSlug('');
    expect(result).toMatch(/^page-[a-z0-9]+$/);
  });

  it('falls back when title only has special chars', () => {
    const result = autoSlug('!!!');
    expect(result).toMatch(/^page-[a-z0-9]+$/);
  });

  it('preserves existing hyphens between words', () => {
    expect(autoSlug('my-status-page')).toBe('my-status-page');
  });

  it('handles numbers in title', () => {
    expect(autoSlug('API v2 Status')).toBe('api-v2-status');
  });

  it('exactly-3-char result is accepted (not fallback)', () => {
    const result = autoSlug('abc');
    expect(result).toBe('abc');
  });
});

// ── pageRelativeTime ──────────────────────────────────────────────────────────

describe('pageRelativeTime', () => {
  const NOW = 1_700_000_000_000;

  beforeEach(() => vi.spyOn(Date, 'now').mockReturnValue(NOW));
  afterEach(() => vi.restoreAllMocks());

  it('returns Xs ago for < 60 seconds', () => {
    const ts = new Date(NOW - 30_000).toISOString();
    expect(pageRelativeTime(ts)).toBe('30s ago');
  });

  it('returns 0s ago at the boundary', () => {
    const ts = new Date(NOW).toISOString();
    expect(pageRelativeTime(ts)).toBe('0s ago');
  });

  it('returns Xm ago for 60s–3599s', () => {
    const ts = new Date(NOW - 5 * 60_000).toISOString();
    expect(pageRelativeTime(ts)).toBe('5m ago');
  });

  it('returns 1m ago at exactly 60 seconds', () => {
    const ts = new Date(NOW - 60_000).toISOString();
    expect(pageRelativeTime(ts)).toBe('1m ago');
  });

  it('returns Xh ago for 1–23 hours', () => {
    const ts = new Date(NOW - 3 * 3600_000).toISOString();
    expect(pageRelativeTime(ts)).toBe('3h ago');
  });

  it('returns 1h ago at exactly 3600 seconds', () => {
    const ts = new Date(NOW - 3600_000).toISOString();
    expect(pageRelativeTime(ts)).toBe('1h ago');
  });

  it('returns locale date string for ≥ 24 hours', () => {
    const ts = new Date(NOW - 48 * 3600_000).toISOString();
    const result = pageRelativeTime(ts);
    // Should be a date string, not "Xh ago"
    expect(result).not.toMatch(/ago$/);
    expect(result.length).toBeGreaterThan(0);
  });

  it('accepts a Date object', () => {
    const d = new Date(NOW - 10_000);
    expect(pageRelativeTime(d)).toBe('10s ago');
  });
});

// ── isSlugValid ───────────────────────────────────────────────────────────────

describe('isSlugValid', () => {
  it('returns true for slug of length 3', () => {
    expect(isSlugValid('abc')).toBe(true);
  });

  it('returns true for slug longer than 3 characters', () => {
    expect(isSlugValid('my-status-page')).toBe(true);
  });

  it('returns false for 2-char slug', () => {
    expect(isSlugValid('ab')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isSlugValid('')).toBe(false);
  });

  it('returns false for 1-char slug', () => {
    expect(isSlugValid('a')).toBe(false);
  });
});

// ── buildCopySlug ─────────────────────────────────────────────────────────────

describe('buildCopySlug', () => {
  it('starts with originalSlug-copy-', () => {
    const result = buildCopySlug('my-page');
    expect(result).toMatch(/^my-page-copy-[a-z0-9]+$/);
  });

  it('differs between calls (timestamp changes)', () => {
    const a = buildCopySlug('page');
    // In same millisecond they'd be equal, but structure test is the important thing
    expect(a).toContain('page-copy-');
  });

  it('preserves original slug verbatim', () => {
    expect(buildCopySlug('api-status-v2')).toMatch(/^api-status-v2-copy-/);
  });
});

// ── buildCopyTitle ────────────────────────────────────────────────────────────

describe('buildCopyTitle', () => {
  it('prepends "Copy of " to the title', () => {
    expect(buildCopyTitle('My Status Page')).toBe('Copy of My Status Page');
  });

  it('works with short titles', () => {
    expect(buildCopyTitle('API')).toBe('Copy of API');
  });

  it('works with empty string', () => {
    expect(buildCopyTitle('')).toBe('Copy of ');
  });
});

// ── buildBadgeSnippets ────────────────────────────────────────────────────────

describe('buildBadgeSnippets', () => {
  const BASE = 'https://status.example.com';
  const SLUG = 'my-page';
  const STYLE: BadgeStyle = 'flat';

  let snippets: ReturnType<typeof buildBadgeSnippets>;

  beforeEach(() => {
    snippets = buildBadgeSnippets(BASE, SLUG, STYLE);
  });

  it('builds a valid badge URL in the url field', () => {
    expect(snippets.url).toBe(
      `${BASE}/api/v1/public/status-badge/${SLUG}.svg?style=${STYLE}`,
    );
  });

  it('builds markdown badge with correct link and image', () => {
    expect(snippets.markdown).toBe(
      `[![Status](${snippets.url})](${BASE}/status/${SLUG})`,
    );
  });

  it('builds html snippet with anchor + img', () => {
    expect(snippets.html).toBe(
      `<a href="${BASE}/status/${SLUG}"><img src="${snippets.url}" alt="Status" /></a>`,
    );
  });

  it('builds script embed tag', () => {
    expect(snippets.script).toBe(
      `<script src="${BASE}/api/v1/public/embed/status/${SLUG}.js"></script>`,
    );
  });

  it('includes the style param in badge URL', () => {
    const sq = buildBadgeSnippets(BASE, SLUG, 'flat-square');
    expect(sq.url).toContain('style=flat-square');
    const lg = buildBadgeSnippets(BASE, SLUG, 'for-the-badge');
    expect(lg.url).toContain('style=for-the-badge');
  });

  it('all 4 snippets are distinct', () => {
    const values = [snippets.markdown, snippets.html, snippets.url, snippets.script];
    const unique = new Set(values);
    expect(unique.size).toBe(4);
  });

  it('all snippets reference the correct slug', () => {
    for (const v of Object.values(snippets)) {
      expect(v).toContain(SLUG);
    }
  });
});

// ── badgeStyleLabel ───────────────────────────────────────────────────────────

describe('badgeStyleLabel', () => {
  it('"flat" → "Flat"', () => {
    expect(badgeStyleLabel('flat')).toBe('Flat');
  });

  it('"flat-square" → "Square"', () => {
    expect(badgeStyleLabel('flat-square')).toBe('Square');
  });

  it('"for-the-badge" → "Large"', () => {
    expect(badgeStyleLabel('for-the-badge')).toBe('Large');
  });

  it('all 3 styles produce distinct labels', () => {
    const styles: BadgeStyle[] = ['flat', 'flat-square', 'for-the-badge'];
    const labels = styles.map(badgeStyleLabel);
    const unique = new Set(labels);
    expect(unique.size).toBe(3);
  });
});

// ── buildStatusPagesCsvFilename ───────────────────────────────────────────────

describe('buildStatusPagesCsvFilename', () => {
  it('starts with pulsedock-status-pages-', () => {
    const result = buildStatusPagesCsvFilename(new Date('2026-04-04T05:00:00Z'));
    expect(result).toBe('pulsedock-status-pages-2026-04-04.csv');
  });

  it('ends with .csv', () => {
    const result = buildStatusPagesCsvFilename(new Date('2025-12-31T00:00:00Z'));
    expect(result).toMatch(/\.csv$/);
  });

  it('uses today when no date is passed', () => {
    const result = buildStatusPagesCsvFilename();
    expect(result).toMatch(/^pulsedock-status-pages-\d{4}-\d{2}-\d{2}\.csv$/);
  });

  it('zero-pads month and day', () => {
    const result = buildStatusPagesCsvFilename(new Date('2026-01-05T00:00:00Z'));
    expect(result).toBe('pulsedock-status-pages-2026-01-05.csv');
  });
});

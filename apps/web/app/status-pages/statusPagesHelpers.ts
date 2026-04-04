/**
 * Pure helper functions for the Status Pages section.
 *
 * Extracted from status-pages/page.tsx to enable unit testing and reuse.
 */

/** Slug style variants for badge embed. */
export type BadgeStyle = 'flat' | 'flat-square' | 'for-the-badge';

/** Snippet keys for status-badge embed modal. */
export type BadgeSnippetKey = 'markdown' | 'html' | 'url' | 'script';

/** Result of buildBadgeSnippets */
export interface BadgeSnippets {
  markdown: string;
  html: string;
  url: string;
  script: string;
}

/**
 * Convert a page title to a URL-safe slug.
 *
 * Rules:
 * - Lowercased
 * - Non-alphanumeric chars (except spaces and hyphens) removed
 * - Spaces → hyphens, consecutive hyphens collapsed, leading/trailing stripped
 * - Truncated to 80 characters
 * - If the result is fewer than 3 characters, falls back to `page-<timestamp36>`
 */
export function autoSlug(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return slug.length >= 3 ? slug : `page-${Date.now().toString(36)}`;
}

/**
 * Format the time elapsed since a page was last updated.
 *
 * Returns:
 * - `Xs ago` for < 1 minute
 * - `Xm ago` for < 1 hour
 * - `Xh ago` for < 24 hours
 * - Localized date string for older dates
 */
export function pageRelativeTime(updatedAt: string | Date): string {
  const diff = Date.now() - new Date(updatedAt).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(updatedAt).toLocaleDateString();
}

/**
 * Returns true if the slug string is valid (≥ 3 characters).
 *
 * Used to gate submission — slugs shorter than 3 are not sent to the API.
 */
export function isSlugValid(slug: string): boolean {
  return slug.length >= 3;
}

/**
 * Build a duplicate slug for a copied status page.
 *
 * Format: `{originalSlug}-copy-{timestamp36}`
 */
export function buildCopySlug(originalSlug: string): string {
  return `${originalSlug}-copy-${Date.now().toString(36)}`;
}

/**
 * Build a duplicate title for a copied status page.
 *
 * Format: `Copy of {originalTitle}`
 */
export function buildCopyTitle(originalTitle: string): string {
  return `Copy of ${originalTitle}`;
}

/**
 * Build all embed/badge snippet strings for a given status page.
 *
 * @param publicBase - Origin of the public site (e.g. "https://example.com")
 * @param slug       - Status page slug
 * @param style      - Badge SVG style variant
 */
export function buildBadgeSnippets(
  publicBase: string,
  slug: string,
  style: BadgeStyle,
): BadgeSnippets {
  const badgeUrl = `${publicBase}/api/v1/public/status-badge/${slug}.svg?style=${style}`;
  const pageUrl = `${publicBase}/status/${slug}`;
  const embedScriptUrl = `${publicBase}/api/v1/public/embed/status/${slug}.js`;
  return {
    markdown: `[![Status](${badgeUrl})](${pageUrl})`,
    html: `<a href="${pageUrl}"><img src="${badgeUrl}" alt="Status" /></a>`,
    url: badgeUrl,
    script: `<script src="${embedScriptUrl}"></script>`,
  };
}

/**
 * Return a human-readable label for a badge style variant.
 */
export function badgeStyleLabel(style: BadgeStyle): string {
  switch (style) {
    case 'flat': return 'Flat';
    case 'flat-square': return 'Square';
    case 'for-the-badge': return 'Large';
  }
}

/**
 * Build the CSV export filename for a status pages export.
 *
 * Format: `pulsedock-status-pages-YYYY-MM-DD.csv`
 */
export function buildStatusPagesCsvFilename(now: Date = new Date()): string {
  return `pulsedock-status-pages-${now.toISOString().slice(0, 10)}.csv`;
}

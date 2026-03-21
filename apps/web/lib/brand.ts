/**
 * White-label / brand configuration.
 *
 * All values read from environment variables at build time. Override in .env.local or
 * pass as NEXT_PUBLIC_* env vars when deploying. Defaults fall back to PulseDock branding.
 *
 * @example
 * NEXT_PUBLIC_APP_NAME="AcmeDock"
 * NEXT_PUBLIC_APP_DESCRIPTION="Acme monitoring platform"
 * NEXT_PUBLIC_APP_LOGO_URL="https://example.com/logo.svg"
 * NEXT_PUBLIC_APP_FAVICON_URL="https://example.com/favicon.ico"
 * NEXT_PUBLIC_APP_ACCENT_COLOR="#0070f3"
 * NEXT_PUBLIC_APP_URL="https://status.acme.com"
 * NEXT_PUBLIC_HIDE_BRANDING="true"
 */

export const brand = {
  /** Application name shown in titles, nav, emails. */
  name: process.env.NEXT_PUBLIC_APP_NAME || 'PulseDock',

  /** Short tagline used in meta descriptions. */
  description:
    process.env.NEXT_PUBLIC_APP_DESCRIPTION ||
    'Version Intelligence & Uptime Monitoring',

  /** Full description for meta/OG tags. */
  fullDescription:
    process.env.NEXT_PUBLIC_APP_FULL_DESCRIPTION ||
    'Monitor your applications for version updates, security patches, and uptime. Open source, self-hosted, built for developers.',

  /** Custom logo URL. When set, replaces the inline SVG logo in nav/login. */
  logoUrl: process.env.NEXT_PUBLIC_APP_LOGO_URL || null,

  /** Custom favicon URL. When set, used instead of /favicon.svg. */
  faviconUrl: process.env.NEXT_PUBLIC_APP_FAVICON_URL || null,

  /** Primary accent color (hex). Used in CSS custom property --color-accent. */
  accentColor: process.env.NEXT_PUBLIC_APP_ACCENT_COLOR || '#58a6ff',

  /** Canonical app URL. Used in metadata/OG tags. */
  url: process.env.NEXT_PUBLIC_APP_URL || 'https://oc-dev-test.no749ah.com',

  /** OG image URL for social sharing. */
  ogImageUrl:
    process.env.NEXT_PUBLIC_APP_OG_IMAGE_URL ||
    `${process.env.NEXT_PUBLIC_APP_URL || 'https://oc-dev-test.no749ah.com'}/og-image.png`,

  /** Hide "Powered by PulseDock" attribution in app footer and status pages. */
  hideBranding: process.env.NEXT_PUBLIC_HIDE_BRANDING === 'true',

  /** GitHub repo URL for docs/contributing links. Override for forks. */
  githubUrl:
    process.env.NEXT_PUBLIC_GITHUB_URL || 'https://github.com/No749ah/PulseDock',
} as const;

export type Brand = typeof brand;

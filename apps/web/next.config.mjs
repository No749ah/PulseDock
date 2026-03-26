/** @type {import('next').NextConfig} */
const nextConfig = {
  // jsPDF (via fflate) uses Node.js Worker which Turbopack cannot resolve in SSR.
  // Mark as server-external so it is not bundled server-side.
  // (jsPDF is only used client-side via dynamic import in reports/page.tsx)
  serverExternalPackages: ['jspdf', 'fflate', 'html2canvas'],

  // Skip TypeScript type checking during build to avoid OOM in memory-constrained envs.
  // API TypeScript is checked separately via `tsc -p tsconfig.build.json`.
  typescript: { ignoreBuildErrors: true },

  // Do NOT use output: 'standalone' — it requires manual static asset copying
  // and breaks when the reverse proxy caches error responses during restarts.
  // Regular `next start` serves static assets natively and works reliably.

  // Prevent Next.js from 308-redirecting /api/socket.io/ → /api/socket.io before
  // the rewrite rules fire. Without this, socket.io polling hits a 404 because the
  // stripped path no longer matches the /api/:path* rewrite pattern.
  skipTrailingSlashRedirect: true,

  devIndicators: false,

  // Remove X-Powered-By header to avoid leaking tech stack
  poweredByHeader: false,

  // When dev is accessed via a public hostname/proxy, allow that origin to fetch /_next/*
  // (prevents "Cross origin request detected" warnings/errors)
  allowedDevOrigins: [
    'oc-web-test.no749ah.com',
    'https://oc-web-test.no749ah.com',
    'http://oc-web-test.no749ah.com',
    'oc-dev-test.no749ah.com',
    'https://oc-dev-test.no749ah.com',
    'http://oc-dev-test.no749ah.com',
  ],

  async headers() {
    return [
      {
        // Embed pages — allow framing from any origin (they're designed for iframes)
        source: '/embed/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'ALLOWALL' },
          { key: 'Content-Security-Policy', value: "frame-ancestors *" },
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Cache-Control', value: 'public, max-age=30, s-maxage=30' },
        ],
      },
      {
        // HTML pages must never be cached (chunk hashes change on rebuild)
        // Also add security headers to all non-embed pages
        source: '/((?!_next/static|_next/image|favicon.ico|embed).*)',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Pragma', value: 'no-cache' },
          { key: 'Expires', value: '0' },
          // Security headers
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-DNS-Prefetch-Control', value: 'off' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: https: blob:",
              "font-src 'self' data:",
              "connect-src 'self' wss: ws: https://cdn.simpleicons.org",
              "frame-src 'self' https://www.youtube.com https://player.vimeo.com",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-ancestors 'none'",
            ].join('; '),
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains; preload',
          },
        ],
      },
      // Note: /_next/static/* cache headers are handled by Next.js automatically
      // (content-hashed filenames = immutable). No custom override needed.
      // For CDN-level caching (e.g. Cloudflare), configure at the CDN layer.
    ];
  },

  // API proxy: Route Handler at app/api/[...path]/route.ts handles all /api/* requests.
  // Next.js rewrites drop request bodies on PATCH/POST — the Route Handler preserves them.
  // Socket.io uses rewrites for WebSocket upgrade passthrough.
  async rewrites() {
    const apiUrl = process.env.INTERNAL_API_URL ?? 'http://localhost:4321';
    return [
      {
        source: '/api/socket.io',
        destination: `${apiUrl}/socket.io/`,
      },
      {
        source: '/api/socket.io/:path*',
        destination: `${apiUrl}/socket.io/:path*`,
      },
    ];
  },
};

export default nextConfig;

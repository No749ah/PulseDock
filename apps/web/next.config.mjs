/** @type {import('next').NextConfig} */
const nextConfig = {
  // jsPDF (via fflate) uses Node.js Worker which Turbopack cannot resolve in SSR.
  // Mark as server-external so it is not bundled server-side.
  // (jsPDF is only used client-side via dynamic import in reports/page.tsx)
  serverExternalPackages: ['jspdf', 'fflate', 'html2canvas'],

  // Do NOT use output: 'standalone' — it requires manual static asset copying
  // and breaks when the reverse proxy caches error responses during restarts.
  // Regular `next start` serves static assets natively and works reliably.

  // Prevent Next.js from 308-redirecting /api/socket.io/ → /api/socket.io before
  // the rewrite rules fire. Without this, socket.io polling hits a 404 because the
  // stripped path no longer matches the /api/:path* rewrite pattern.
  skipTrailingSlashRedirect: true,

  devIndicators: false,

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
        source: '/((?!_next/static|_next/image|favicon.ico).*)',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Pragma', value: 'no-cache' },
          { key: 'Expires', value: '0' },
        ],
      },
      {
        // Static assets ARE cached (content-hashed filenames = immutable)
        // CDN-Cache-Control tells Cloudflare specifically; Cache-Control is the fallback.
        source: '/_next/static/(.*)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
          { key: 'CDN-Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
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

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Do NOT use output: 'standalone' — it requires manual static asset copying
  // and breaks when the reverse proxy caches error responses during restarts.
  // Regular `next start` serves static assets natively and works reliably.

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
        // HTML pages must never be cached (chunk hashes change on rebuild)
        source: '/((?!_next/static|_next/image|favicon.ico).*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-cache, no-store, must-revalidate',
          },
        ],
      },
      {
        // Static assets ARE cached (content-hashed filenames = immutable)
        source: '/_next/static/(.*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ];
  },

  // Proxy all /api requests to the API server.
  // In dev: localhost:4321. In production Docker: set INTERNAL_API_URL=http://api:4321
  async rewrites() {
    const apiUrl = process.env.INTERNAL_API_URL ?? 'http://localhost:4321';
    return [
      {
        source: '/api/:path*',
        destination: `${apiUrl}/:path*`,
      },
    ];
  },
};

export default nextConfig;

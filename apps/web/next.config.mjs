/** @type {import('next').NextConfig} */
const nextConfig = {
  devIndicators: false,

  // When dev is accessed via a public hostname/proxy, allow that origin to fetch /_next/*
  // (prevents "Cross origin request detected" warnings/errors)
  allowedDevOrigins: [
    'oc-web-test.no749ah.com',
    'https://oc-web-test.no749ah.com',
    'http://oc-web-test.no749ah.com',
  ],

  // Proxy all /api requests to the API server (keeps frontend on / and API on /api)
  // Strip the /api prefix so backend receives paths like /v1/... (the API mounts routes at /v1)
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

  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:4321/:path*',
      },
    ];
  },
};

export default nextConfig;

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
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:4001/:path*',
      },
    ];
  },
};

export default nextConfig;

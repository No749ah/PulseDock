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
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:4000/api/:path*',
      },
    ];
  },
};

export default nextConfig;

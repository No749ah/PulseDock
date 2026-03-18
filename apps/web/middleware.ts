import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Middleware: add Cache-Control: no-store to every response for /_next/static/ paths.
 *
 * Why: when a static chunk is missing (e.g. during a rebuild window), Next.js returns
 * a 404 for the file. Without an explicit no-store header, Cloudflare and other CDNs
 * cache that 404 for hours, even after the file is restored. This middleware ensures
 * the "file not found" response is never cached — only real 200 responses (served
 * with immutable headers by next.config.mjs) get cached.
 *
 * For 200 responses the header here is overridden by the next.config.mjs headers()
 * rule which sets public, max-age=31536000, immutable.
 */
export function middleware(request: NextRequest) {
  const response = NextResponse.next();

  if (request.nextUrl.pathname.startsWith('/_next/static/')) {
    // Prevent any CDN/proxy from caching 404s for static assets.
    // Successful 200 responses will have this overridden by next.config.mjs headers().
    response.headers.set('Cache-Control', 'no-store');
    response.headers.set('CDN-Cache-Control', 'no-store');
    response.headers.set('Cloudflare-CDN-Cache-Control', 'no-store');
  }

  return response;
}

export const config = {
  matcher: ['/_next/static/:path*'],
};

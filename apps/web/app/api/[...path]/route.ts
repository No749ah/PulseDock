/**
 * Catch-all API proxy route handler.
 *
 * Next.js rewrites silently drop request bodies on PATCH/POST/PUT.
 * This Route Handler explicitly reads and forwards the body as an ArrayBuffer.
 *
 * It also correctly handles multiple Set-Cookie headers which Next.js
 * rewrites and Headers.forEach() would otherwise merge/drop.
 */

const API_URL = process.env.INTERNAL_API_URL ?? 'http://localhost:4321';

// Headers that should not be forwarded between hops
const HOP_BY_HOP = new Set(['transfer-encoding', 'connection', 'keep-alive']);

async function proxyHandler(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const target = '/' + path.join('/');
  const qs = new URL(request.url).search;

  // Read body for non-GET/HEAD methods
  let body: ArrayBuffer | undefined;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    body = await request.arrayBuffer();
  }

  // Copy request headers (except host)
  const reqHeaders = new Headers();
  request.headers.forEach((v, k) => {
    if (k.toLowerCase() !== 'host') reqHeaders.set(k, v);
  });

  const upstream = await fetch(`${API_URL}${target}${qs}`, {
    method: request.method,
    headers: reqHeaders,
    body: body && body.byteLength > 0 ? Buffer.from(body) : undefined,
  });

  // Build response headers, preserving multiple Set-Cookie headers.
  // Headers.getSetCookie() returns them as an array (Node 20+).
  const resHeaders = new Headers();
  upstream.headers.forEach((v, k) => {
    if (!HOP_BY_HOP.has(k.toLowerCase()) && k.toLowerCase() !== 'set-cookie') {
      resHeaders.set(k, v);
    }
  });

  // Append each Set-Cookie individually so the browser receives all of them
  const cookies = (upstream.headers as any).getSetCookie?.() ?? [];
  for (const cookie of cookies) {
    resHeaders.append('set-cookie', cookie);
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: resHeaders,
  });
}

export const GET = proxyHandler;
export const POST = proxyHandler;
export const PUT = proxyHandler;
export const PATCH = proxyHandler;
export const DELETE = proxyHandler;
export const OPTIONS = proxyHandler;

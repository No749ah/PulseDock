/**
 * Catch-all API proxy route handler.
 *
 * Next.js rewrites silently drop request bodies on PATCH/POST/PUT when using
 * Node.js fetch internally. This Route Handler explicitly reads and forwards
 * the body as an ArrayBuffer, which preserves it correctly.
 */

const API_URL = process.env.INTERNAL_API_URL ?? 'http://localhost:4321';

async function proxyHandler(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const target = '/' + path.join('/');
  const qs = new URL(request.url).search;

  // Read body for non-GET/HEAD methods
  let body: ArrayBuffer | undefined;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    body = await request.arrayBuffer();
  }

  // Copy headers (except host)
  const headers = new Headers();
  request.headers.forEach((v, k) => {
    if (k.toLowerCase() !== 'host') headers.set(k, v);
  });

  const upstream = await fetch(`${API_URL}${target}${qs}`, {
    method: request.method,
    headers,
    body: body && body.byteLength > 0 ? Buffer.from(body) : undefined,
  });

  // Copy response (skip hop-by-hop headers)
  const skip = new Set(['transfer-encoding', 'connection', 'keep-alive']);
  const rh = new Headers();
  upstream.headers.forEach((v, k) => { if (!skip.has(k.toLowerCase())) rh.set(k, v); });

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: rh,
  });
}

export const GET = proxyHandler;
export const POST = proxyHandler;
export const PUT = proxyHandler;
export const PATCH = proxyHandler;
export const DELETE = proxyHandler;
export const OPTIONS = proxyHandler;

/**
 * Catch-all API proxy route.
 * 
 * Next.js rewrites can drop request bodies on PATCH/POST in certain versions.
 * This Route Handler reads the raw body and forwards it explicitly to the API server,
 * preserving all headers, cookies, and the body intact.
 */

const API_URL = process.env.INTERNAL_API_URL ?? 'http://localhost:4321';

async function handler(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const targetPath = '/' + path.join('/');
  const url = new URL(request.url);
  const queryString = url.search; // includes the '?'

  // Read the raw body (if any)
  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  const body = hasBody ? await request.arrayBuffer() : undefined;

  // Forward all headers except host
  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (key.toLowerCase() !== 'host') {
      headers.set(key, value);
    }
  });

  const resp = await fetch(`${API_URL}${targetPath}${queryString}`, {
    method: request.method,
    headers,
    body: body && body.byteLength > 0 ? body : undefined,
    // @ts-expect-error -- Node fetch supports duplex
    duplex: hasBody ? 'half' : undefined,
  });

  // Forward response headers
  const responseHeaders = new Headers();
  resp.headers.forEach((value, key) => {
    // Skip hop-by-hop headers
    if (!['transfer-encoding', 'connection', 'keep-alive'].includes(key.toLowerCase())) {
      responseHeaders.set(key, value);
    }
  });

  return new Response(resp.body, {
    status: resp.status,
    statusText: resp.statusText,
    headers: responseHeaders,
  });
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const OPTIONS = handler;

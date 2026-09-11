import { io, Socket } from 'socket.io-client';

/**
 * Socket.io real-time connection.
 *
 * Path: /api/socket.io (NO trailing slash)
 * ─────────────────────────────────────────
 * Socket.io client appends its own query params (?EIO=4&transport=polling…).
 * Using a trailing slash (/api/socket.io/) causes Next.js to 308-redirect to
 * /api/socket.io (strips slash) BEFORE the rewrite rule fires, so the rewritten
 * request never reaches the API — resulting in 404s.
 *
 * Nginx must proxy /api/socket.io directly to the API (bypasses Next.js):
 *
 *   location ~ ^/api/socket\.io {
 *     proxy_pass          http://localhost:4321/socket.io;
 *     proxy_http_version  1.1;
 *     proxy_set_header    Upgrade    $http_upgrade;
 *     proxy_set_header    Connection "upgrade";
 *     proxy_set_header    Host       $host;
 *     proxy_read_timeout  86400s;
 *     proxy_send_timeout  86400s;
 *   }
 *
 * Next.js rewrites (/api/socket.io → 4321/socket.io) serve as fallback for
 * local dev when nginx is not in front.
 */
export function createRealtimeSocket(userId: string): Socket {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return io(`${origin}/realtime`, {
    withCredentials: true,
    path: '/api/socket.io',       // no trailing slash — avoids Next.js 308 redirect trap
    transports: ['polling', 'websocket'],
    auth: { userId },
    query: { userId },
    reconnectionAttempts: 5,
    reconnectionDelay: 2000,
  });
}

import { io, Socket } from 'socket.io-client';

/**
 * Socket.io connects through the web frontend's /api proxy path.
 * The reverse proxy (nginx/OpenResty) forwards /api/socket.io/ to the API.
 * Never connect directly to :4321 — it's not reachable from outside.
 */
export function createRealtimeSocket(userId: string): Socket {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return io(`${origin}/realtime`, {
    withCredentials: true,
    path: '/api/socket.io/',
    transports: ['polling', 'websocket'],
    auth: { userId },
    query: { userId },
    reconnectionAttempts: 5,
    reconnectionDelay: 2000,
  });
}

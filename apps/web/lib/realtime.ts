import { io, Socket } from 'socket.io-client';
import { API_BASE } from './api';

function resolveRealtimeBase() {
  const base = API_BASE.replace(/\/$/, '');
  // If the API is proxied at /api on the same host, use the direct API port
  // to avoid WebSocket issues through reverse proxies that don't support upgrades
  if (typeof window !== 'undefined' && base.endsWith('/api')) {
    // Prefer direct connection to API port (4321) to avoid proxy WS issues
    const protocol = window.location.protocol;
    const host = window.location.hostname;
    return `${protocol}//${host}:4321`;
  }
  return base;
}

export function createRealtimeSocket(userId: string): Socket {
  return io(`${resolveRealtimeBase()}/realtime`, {
    withCredentials: true,
    // Start with polling as fallback — more reliable through proxies
    transports: ['polling', 'websocket'],
    auth: { userId },
    query: { userId },
    reconnectionAttempts: 5,
    reconnectionDelay: 2000,
  });
}

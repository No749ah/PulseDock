import { io, Socket } from 'socket.io-client';
import { API_BASE } from './api';

function resolveRealtimeBase() {
  const base = API_BASE.replace(/\/$/, '');
  if (base.endsWith('/api')) return base;
  return base;
}

export function createRealtimeSocket(userId: string): Socket {
  return io(`${resolveRealtimeBase()}/realtime`, {
    withCredentials: true,
    transports: ['websocket', 'polling'],
    auth: { userId },
    query: { userId },
  });
}

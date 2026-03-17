import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RealtimeGateway } from './realtime.gateway';

// ── helpers ──────────────────────────────────────────────────────────────────

function makeSocket(opts: {
  id?: string;
  cookieToken?: string;
  authToken?: string;
  noCookieHeader?: boolean;
} = {}) {
  const joinedRooms = new Set<string>();
  const cookieHeader = opts.cookieToken
    ? `pulsedock_token=${opts.cookieToken}; other=val`
    : '';
  const headers: Record<string, string | undefined> = opts.noCookieHeader
    ? {}
    : { cookie: cookieHeader };
  return {
    id: opts.id ?? 'socket-abc',
    handshake: {
      query: {},
      auth: opts.authToken ? { token: opts.authToken } : {},
      headers,
    },
    join: vi.fn().mockImplementation((room: string) => {
      joinedRooms.add(room);
      return Promise.resolve();
    }),
    _joinedRooms: joinedRooms,
  };
}

function makeServer() {
  const emitFn = vi.fn();
  return {
    to: vi.fn().mockReturnValue({ emit: emitFn }),
    _emit: emitFn,
  };
}

function makeJwt(userId: string | null = 'user-1') {
  return {
    verify: vi.fn().mockImplementation(() => {
      if (userId === null) throw new Error('invalid token');
      return { sub: userId, type: 'access' };
    }),
  };
}

function makeGateway(userId: string | null = 'user-1') {
  const jwt = makeJwt(userId);
  const gateway = new RealtimeGateway(jwt as never);
  const server = makeServer();
  gateway.server = server as never;
  return { gateway, server, jwt };
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('RealtimeGateway', () => {
  // ── handleConnection() ─────────────────────────────────────────────────────

  describe('handleConnection()', () => {
    it('joins user room when cookie token is valid', async () => {
      const { gateway } = makeGateway('user-1');
      const socket = makeSocket({ cookieToken: 'valid-token' });
      await gateway.handleConnection(socket as never);
      expect(socket.join).toHaveBeenCalledWith('user:user-1');
    });

    it('joins user room when auth.token is valid', async () => {
      const { gateway } = makeGateway('user-2');
      const socket = makeSocket({ authToken: 'valid-bearer' });
      await gateway.handleConnection(socket as never);
      expect(socket.join).toHaveBeenCalledWith('user:user-2');
    });

    it('does not join any room when no token provided', async () => {
      const { gateway } = makeGateway(null);
      const socket = makeSocket();
      await gateway.handleConnection(socket as never);
      expect(socket.join).not.toHaveBeenCalled();
    });

    it('does not join room when token is invalid (jwt.verify throws)', async () => {
      const { gateway } = makeGateway(null);
      const socket = makeSocket({ authToken: 'bad-token' });
      await gateway.handleConnection(socket as never);
      expect(socket.join).not.toHaveBeenCalled();
    });

    it('uses empty string fallback when cookie header is undefined (line 78 ?? branch)', async () => {
      // noCookieHeader=true → headers.cookie is undefined → cookieHeader ?? '' hits the fallback
      const { gateway } = makeGateway('user-3');
      const socket = makeSocket({ authToken: 'valid-bearer', noCookieHeader: true });
      await gateway.handleConnection(socket as never);
      // Falls back to authToken path and still joins correctly
      expect(socket.join).toHaveBeenCalledWith('user:user-3');
    });

    it('does not join room when jwt.verify returns payload with no sub (line 92 branch)', async () => {
      const jwt = {
        verify: vi.fn().mockReturnValue({ type: 'access' }), // no sub field
      };
      const gateway = new RealtimeGateway(jwt as never);
      const server = makeServer();
      gateway.server = server as never;
      const socket = makeSocket({ authToken: 'no-sub-token' });
      await gateway.handleConnection(socket as never);
      expect(socket.join).not.toHaveBeenCalled();
    });
  });

  // ── handleDisconnect() ─────────────────────────────────────────────────────

  describe('handleDisconnect()', () => {
    it('logs disconnect without throwing', () => {
      const { gateway } = makeGateway();
      const socket = makeSocket();
      expect(() => gateway.handleDisconnect(socket as never)).not.toThrow();
    });
  });

  // ── subscribe() ────────────────────────────────────────────────────────────

  describe('subscribe()', () => {
    it('joins authenticated user room and returns { ok: true }', async () => {
      const { gateway } = makeGateway('user-1');
      const socket = makeSocket({ cookieToken: 'valid' });
      const result = await gateway.subscribe(socket as never, { userId: 'user-1' });
      expect(socket.join).toHaveBeenCalledWith('user:user-1');
      expect(result).toEqual({ ok: true });
    });

    it('returns ok:true when body.userId matches authenticated user', async () => {
      const { gateway } = makeGateway('user-1');
      const socket = makeSocket({ cookieToken: 'valid' });
      const result = await gateway.subscribe(socket as never, {});
      expect(socket.join).toHaveBeenCalledWith('user:user-1');
      expect(result).toEqual({ ok: true });
    });

    it('returns forbidden when body.userId differs from authenticated user', async () => {
      const { gateway } = makeGateway('user-1');
      const socket = makeSocket({ cookieToken: 'valid' });
      const result = await gateway.subscribe(socket as never, { userId: 'other-user' });
      expect(socket.join).not.toHaveBeenCalled();
      expect(result).toEqual({ ok: false, error: 'forbidden' });
    });

    it('returns unauthenticated when no valid token present', async () => {
      const { gateway } = makeGateway(null);
      const socket = makeSocket();
      const result = await gateway.subscribe(socket as never, {});
      expect(socket.join).not.toHaveBeenCalled();
      expect(result).toEqual({ ok: false, error: 'unauthenticated' });
    });

    it('handles undefined body gracefully', async () => {
      const { gateway } = makeGateway('user-5');
      const socket = makeSocket({ authToken: 'valid' });
      const result = await gateway.subscribe(socket as never, undefined);
      expect(socket.join).toHaveBeenCalledWith('user:user-5');
      expect(result).toEqual({ ok: true });
    });
  });

  // ── emitToUser() ───────────────────────────────────────────────────────────

  describe('emitToUser()', () => {
    it('emits event to the correct user room', () => {
      const { gateway, server } = makeGateway();
      gateway.emitToUser('user-1', 'monitor.checked', { status: 'ok' });
      expect(server.to).toHaveBeenCalledWith('user:user-1');
      expect(server._emit).toHaveBeenCalledWith('monitor.checked', { status: 'ok' });
    });

    it('emits different event types correctly', () => {
      const { gateway, server } = makeGateway();
      gateway.emitToUser('user-2', 'alert.triggered', { alertId: 'a1' });
      expect(server.to).toHaveBeenCalledWith('user:user-2');
      expect(server._emit).toHaveBeenCalledWith('alert.triggered', { alertId: 'a1' });
    });
  });
});

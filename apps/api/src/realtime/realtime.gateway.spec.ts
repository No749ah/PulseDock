import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RealtimeGateway } from './realtime.gateway';

// ── helpers ──────────────────────────────────────────────────────────────────

function makeSocket(opts: {
  id?: string;
  queryUserId?: string;
  authUserId?: string;
} = {}) {
  const joinedRooms = new Set<string>();
  return {
    id: opts.id ?? 'socket-abc',
    handshake: {
      query: { userId: opts.queryUserId ?? undefined },
      auth: { userId: opts.authUserId ?? undefined },
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

function makeGateway() {
  const gateway = new RealtimeGateway();
  const server = makeServer();
  gateway.server = server as never;
  return { gateway, server };
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('RealtimeGateway', () => {
  // ── handleConnection() ─────────────────────────────────────────────────────

  describe('handleConnection()', () => {
    it('joins user room when userId is in query params', async () => {
      const { gateway } = makeGateway();
      const socket = makeSocket({ queryUserId: 'user-1' });
      await gateway.handleConnection(socket as never);
      expect(socket.join).toHaveBeenCalledWith('user:user-1');
    });

    it('joins user room when userId is in auth', async () => {
      const { gateway } = makeGateway();
      const socket = makeSocket({ authUserId: 'user-2' });
      await gateway.handleConnection(socket as never);
      expect(socket.join).toHaveBeenCalledWith('user:user-2');
    });

    it('prefers queryUserId over authUserId when both present', async () => {
      const { gateway } = makeGateway();
      const socket = makeSocket({ queryUserId: 'query-user', authUserId: 'auth-user' });
      await gateway.handleConnection(socket as never);
      expect(socket.join).toHaveBeenCalledWith('user:query-user');
    });

    it('does not join any room when userId is missing', async () => {
      const { gateway } = makeGateway();
      const socket = makeSocket();
      await gateway.handleConnection(socket as never);
      expect(socket.join).not.toHaveBeenCalled();
    });

    it('does not join room for empty string userId', async () => {
      const { gateway } = makeGateway();
      const socket = makeSocket({ queryUserId: '  ' });
      // ' '.trim() = '' length 0, so should not join
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
    it('joins user room from body.userId and returns { ok: true }', async () => {
      const { gateway } = makeGateway();
      const socket = makeSocket();
      const result = await gateway.subscribe(socket as never, { userId: 'user-3' });
      expect(socket.join).toHaveBeenCalledWith('user:user-3');
      expect(result).toEqual({ ok: true });
    });

    it('falls back to socket handshake userId when body.userId missing', async () => {
      const { gateway } = makeGateway();
      const socket = makeSocket({ queryUserId: 'user-4' });
      const result = await gateway.subscribe(socket as never, {});
      expect(socket.join).toHaveBeenCalledWith('user:user-4');
      expect(result).toEqual({ ok: true });
    });

    it('returns { ok: false } when no userId available', async () => {
      const { gateway } = makeGateway();
      const socket = makeSocket();
      const result = await gateway.subscribe(socket as never, {});
      expect(socket.join).not.toHaveBeenCalled();
      expect(result).toEqual({ ok: false, error: 'missing userId' });
    });

    it('handles undefined body gracefully', async () => {
      const { gateway } = makeGateway();
      const socket = makeSocket({ authUserId: 'user-5' });
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

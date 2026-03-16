import { Injectable, Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import type { Server, Socket } from 'socket.io';

@Injectable()
@WebSocketGateway({
  namespace: '/realtime',
  cors: { origin: true, credentials: true },
})
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(private readonly jwt: JwtService) {}

  async handleConnection(client: Socket) {
    const userId = this.resolveUserId(client);
    if (!userId) {
      this.logger.debug(`socket connected without user binding: ${client.id}`);
      return;
    }

    await client.join(this.userRoom(userId));
    this.logger.debug(`socket connected: ${client.id} -> user:${userId}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`socket disconnected: ${client.id}`);
  }

  @SubscribeMessage('subscribe')
  async subscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { userId?: string } | undefined,
  ) {
    const verifiedUserId = this.resolveUserId(client);
    if (!verifiedUserId) {
      return { ok: false, error: 'unauthenticated' };
    }

    // Only allow subscribing to the authenticated user's own room
    const requestedUserId = body?.userId;
    if (requestedUserId && requestedUserId !== verifiedUserId) {
      return { ok: false, error: 'forbidden' };
    }

    await client.join(this.userRoom(verifiedUserId));
    return { ok: true };
  }

  emitToUser(userId: string, event: string, payload: unknown) {
    this.server.to(this.userRoom(userId)).emit(event, payload);
  }

  /**
   * Resolve the authenticated userId from the socket handshake.
   *
   * Order of precedence:
   * 1. JWT from httpOnly cookie (pulsedock_token)
   * 2. JWT from auth.token handshake field (Bearer token passed by client)
   *
   * A client-supplied userId string is no longer trusted — the identity is
   * always derived from the verified JWT to prevent room-hijacking.
   */
  private resolveUserId(client: Socket): string | undefined {
    // 1. Cookie-based JWT (preferred — set by the server on login)
    const cookieHeader = client.handshake.headers.cookie ?? '';
    const cookieMatch = /pulsedock_token=([^;]+)/.exec(cookieHeader);
    const cookieToken = cookieMatch?.[1];

    // 2. Bearer token passed via auth handshake
    const authToken = (client.handshake.auth as { token?: string } | undefined)?.token;

    const token = cookieToken ?? authToken;
    if (!token) return undefined;

    try {
      const payload = this.jwt.verify<{ sub: string; type?: string }>(token, {
        secret: process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret',
      });
      if (!payload.sub) return undefined;
      return payload.sub;
    } catch {
      return undefined;
    }
  }

  private userRoom(userId: string) {
    return `user:${userId}`;
  }
}

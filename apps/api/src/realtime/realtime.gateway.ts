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
    const userId = body?.userId ?? this.resolveUserId(client);
    if (!userId) {
      return { ok: false, error: 'missing userId' };
    }

    await client.join(this.userRoom(userId));
    return { ok: true };
  }

  emitToUser(userId: string, event: string, payload: unknown) {
    this.server.to(this.userRoom(userId)).emit(event, payload);
  }

  private resolveUserId(client: Socket): string | undefined {
    const queryUserId = client.handshake.query.userId;
    if (typeof queryUserId === 'string' && queryUserId.trim().length > 0) {
      return queryUserId;
    }

    const authUserId = (client.handshake.auth as { userId?: string } | undefined)?.userId;
    if (typeof authUserId === 'string' && authUserId.trim().length > 0) {
      return authUserId;
    }

    return undefined;
  }

  private userRoom(userId: string) {
    return `user:${userId}`;
  }
}

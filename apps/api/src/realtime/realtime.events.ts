import { Injectable } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway';

@Injectable()
export class RealtimeEvents {
  constructor(private readonly gateway: RealtimeGateway) {}

  monitorCreated(userId: string, payload: unknown) {
    this.gateway.emitToUser(userId, 'monitor.created', payload);
  }

  monitorUpdated(userId: string, payload: unknown) {
    this.gateway.emitToUser(userId, 'monitor.updated', payload);
  }

  monitorDeleted(userId: string, payload: unknown) {
    this.gateway.emitToUser(userId, 'monitor.deleted', payload);
  }

  monitorChecked(userId: string, payload: unknown) {
    this.gateway.emitToUser(userId, 'monitor.checked', payload);
  }

  alertTriggered(userId: string, payload: unknown) {
    this.gateway.emitToUser(userId, 'alert.triggered', payload);
  }

  statusPageUpdated(slug: string, payload: unknown) {
    this.gateway.emitToStatusPage(slug, 'status.updated', payload);
  }
}

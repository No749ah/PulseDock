import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RealtimeEvents } from './realtime.events';
import { RealtimeGateway } from './realtime.gateway';

function makeGateway(): RealtimeGateway {
  return {
    emitToUser: vi.fn(),
  } as unknown as RealtimeGateway;
}

describe('RealtimeEvents', () => {
  let events: RealtimeEvents;
  let gateway: RealtimeGateway;

  beforeEach(() => {
    gateway = makeGateway();
    events = new RealtimeEvents(gateway);
  });

  it('monitorCreated emits monitor.created to user', () => {
    const payload = { id: 'monitor-1', name: 'Test' };
    events.monitorCreated('user-1', payload);
    expect(gateway.emitToUser).toHaveBeenCalledWith('user-1', 'monitor.created', payload);
  });

  it('monitorUpdated emits monitor.updated to user', () => {
    const payload = { id: 'monitor-1', name: 'Updated' };
    events.monitorUpdated('user-1', payload);
    expect(gateway.emitToUser).toHaveBeenCalledWith('user-1', 'monitor.updated', payload);
  });

  it('monitorDeleted emits monitor.deleted to user', () => {
    const payload = { id: 'monitor-1' };
    events.monitorDeleted('user-1', payload);
    expect(gateway.emitToUser).toHaveBeenCalledWith('user-1', 'monitor.deleted', payload);
  });

  it('monitorChecked emits monitor.checked to user', () => {
    const payload = { id: 'monitor-1', status: 'ok', latencyMs: 42 };
    events.monitorChecked('user-1', payload);
    expect(gateway.emitToUser).toHaveBeenCalledWith('user-1', 'monitor.checked', payload);
  });

  it('alertTriggered emits alert.triggered to user', () => {
    const payload = { id: 'alert-1', message: 'Down!' };
    events.alertTriggered('user-1', payload);
    expect(gateway.emitToUser).toHaveBeenCalledWith('user-1', 'alert.triggered', payload);
  });

  it('passes different userIds correctly', () => {
    events.monitorCreated('user-abc', { id: 'm1' });
    expect(gateway.emitToUser).toHaveBeenCalledWith('user-abc', 'monitor.created', { id: 'm1' });
  });
});

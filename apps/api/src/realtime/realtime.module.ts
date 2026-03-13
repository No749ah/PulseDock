import { Module } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimeEvents } from './realtime.events';

@Module({
  providers: [RealtimeGateway, RealtimeEvents],
  exports: [RealtimeEvents],
})
export class RealtimeModule {}

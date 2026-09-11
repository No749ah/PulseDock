import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimeEvents } from './realtime.events';

@Module({
  imports: [JwtModule.register({})],
  providers: [RealtimeGateway, RealtimeEvents],
  exports: [RealtimeEvents],
})
export class RealtimeModule {}

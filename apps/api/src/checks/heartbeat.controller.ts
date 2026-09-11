import { Controller, HttpCode, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ChecksService } from './checks.service';

@ApiTags('Heartbeat')
@Controller('v1/heartbeat')
export class HeartbeatController {
  constructor(private readonly checksService: ChecksService) {}

  @Post(':token')
  @HttpCode(200)
  @ApiOperation({ summary: 'Heartbeat ping', description: 'Public endpoint for HEARTBEAT monitors. Updates lastHeartbeatAt for the matching token.' })
  @ApiParam({ name: 'token', description: 'Heartbeat monitor token' })
  @ApiResponse({ status: 200, description: 'Heartbeat accepted.' })
  @ApiResponse({ status: 404, description: 'Heartbeat monitor not found.' })
  async pingHeartbeat(@Param('token') token: string) {
    await this.checksService.handleHeartbeatPing(token);
    return { ok: true };
  }
}

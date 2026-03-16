import { Controller, Post, Get, Body, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '../common/auth.guard';
import { AgentService } from './agent.service';
import type { AgentReportBody } from './agent.dto';

interface AuthenticatedRequest {
  user: { id: string; email: string; role: string };
}

@Controller('v1/agent')
export class AgentController {
  constructor(private readonly agentService: AgentService) {}

  @Post('report')
  @UseGuards(AuthGuard)
  async report(
    @Req() req: AuthenticatedRequest,
    @Body() body: AgentReportBody,
  ) {
    return this.agentService.report(req.user.id, body);
  }

  @Get('status')
  @UseGuards(AuthGuard)
  async status(@Req() req: AuthenticatedRequest) {
    return this.agentService.status(req.user.id);
  }
}

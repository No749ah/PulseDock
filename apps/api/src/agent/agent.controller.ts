import { Controller, Post, Get, Body, UseGuards, Req } from '@nestjs/common';
import { ApiOperation, ApiTags, ApiBearerAuth, ApiBody, ApiOkResponse } from '@nestjs/swagger';
import { AuthGuard } from '../common/auth.guard';
import { AgentService } from './agent.service';
import type { AgentReportBody } from './agent.dto';

interface AuthenticatedRequest {
  user: { id: string; email: string; role: string };
}

@ApiTags('Agent')
@ApiBearerAuth()
@Controller('v1/agent')
export class AgentController {
  constructor(private readonly agentService: AgentService) {}

  /**
   * Receive a batch of tool-version reports from a PulseDock Agent instance.
   * Each report entry contains a toolId, the detected version, and optional metadata.
   * The agent authenticates via Bearer token (API key or JWT).
   */
  @Post('report')
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary: 'Submit agent version reports',
    description:
      'Receive a batch of tool-version reports from a PulseDock Agent. Each entry contains a toolId, detected version, and optional host metadata.',
  })
  @ApiBody({ description: 'Array of tool version report entries', type: Object })
  @ApiOkResponse({ description: 'Reports accepted and processed' })
  async report(
    @Req() req: AuthenticatedRequest,
    @Body() body: AgentReportBody,
  ) {
    return this.agentService.report(req.user.id, body);
  }

  /**
   * Returns the last-seen agent report data for the authenticated user's workspace.
   * Includes the most recent version per tool and the report timestamp.
   */
  @Get('status')
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary: 'Get agent status',
    description: 'Returns the most recent agent report entries for the current workspace, including per-tool version and last-seen timestamp.',
  })
  @ApiOkResponse({ description: 'Agent status data' })
  async status(@Req() req: AuthenticatedRequest) {
    return this.agentService.status(req.user.id);
  }
}

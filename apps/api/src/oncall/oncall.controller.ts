import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Req,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AuthGuard } from '../common/auth.guard';
import { OnCallService } from './oncall.service';
import {
  CreateOnCallScheduleDto,
  UpdateOnCallScheduleDto,
  AddParticipantDto,
  CreateEscalationPolicyDto,
  UpdateEscalationPolicyDto,
} from './oncall.dto';
import type { Request } from 'express';

@ApiTags('On-Call')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('oncall')
export class OnCallController {
  constructor(private readonly oncallService: OnCallService) {}

  // ─── Schedules ────────────────────────────────────────────────────────────

  @Post('schedules')
  @ApiOperation({ summary: 'Create on-call schedule' })
  @ApiResponse({ status: 201, description: 'Schedule created' })
  createSchedule(@Req() req: Request, @Body() dto: CreateOnCallScheduleDto) {
    const userId = (req as any).user.id;
    return this.oncallService.createSchedule(userId, dto);
  }

  @Get('schedules')
  @ApiOperation({ summary: 'List all on-call schedules' })
  @ApiResponse({ status: 200, description: 'List of schedules' })
  listSchedules(@Req() req: Request) {
    const userId = (req as any).user.id;
    return this.oncallService.findAllSchedules(userId);
  }

  @Get('schedules/:id')
  @ApiOperation({ summary: 'Get on-call schedule with current on-call person' })
  @ApiParam({ name: 'id', description: 'Schedule ID' })
  @ApiResponse({ status: 200, description: 'Schedule detail with current on-call' })
  @ApiResponse({ status: 404, description: 'Schedule not found' })
  getSchedule(@Req() req: Request, @Param('id') id: string) {
    const userId = (req as any).user.id;
    return this.oncallService.getScheduleWithCurrentOnCall(userId, id);
  }

  @Patch('schedules/:id')
  @ApiOperation({ summary: 'Update on-call schedule' })
  @ApiParam({ name: 'id', description: 'Schedule ID' })
  @ApiResponse({ status: 200, description: 'Schedule updated' })
  @ApiResponse({ status: 404, description: 'Schedule not found' })
  updateSchedule(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: UpdateOnCallScheduleDto,
  ) {
    const userId = (req as any).user.id;
    return this.oncallService.updateSchedule(userId, id, dto);
  }

  @Delete('schedules/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete on-call schedule' })
  @ApiParam({ name: 'id', description: 'Schedule ID' })
  @ApiResponse({ status: 204, description: 'Schedule deleted' })
  @ApiResponse({ status: 404, description: 'Schedule not found' })
  async deleteSchedule(@Req() req: Request, @Param('id') id: string) {
    const userId = (req as any).user.id;
    await this.oncallService.deleteSchedule(userId, id);
  }

  // ─── Participants ─────────────────────────────────────────────────────────

  @Post('schedules/:id/participants')
  @ApiOperation({ summary: 'Add participant to schedule' })
  @ApiParam({ name: 'id', description: 'Schedule ID' })
  @ApiResponse({ status: 201, description: 'Participant added' })
  addParticipant(
    @Req() req: Request,
    @Param('id') scheduleId: string,
    @Body() dto: AddParticipantDto,
  ) {
    const userId = (req as any).user.id;
    return this.oncallService.addParticipant(userId, scheduleId, dto);
  }

  @Delete('schedules/:id/participants/:participantId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove participant from schedule' })
  @ApiParam({ name: 'id', description: 'Schedule ID' })
  @ApiParam({ name: 'participantId', description: 'Participant ID' })
  @ApiResponse({ status: 204, description: 'Participant removed' })
  async removeParticipant(
    @Req() req: Request,
    @Param('id') scheduleId: string,
    @Param('participantId') participantId: string,
  ) {
    const userId = (req as any).user.id;
    await this.oncallService.removeParticipant(userId, scheduleId, participantId);
  }

  // ─── Escalation Policies ──────────────────────────────────────────────────

  @Post('policies')
  @ApiOperation({ summary: 'Create escalation policy' })
  @ApiResponse({ status: 201, description: 'Policy created' })
  createPolicy(@Req() req: Request, @Body() dto: CreateEscalationPolicyDto) {
    const userId = (req as any).user.id;
    return this.oncallService.createPolicy(userId, dto);
  }

  @Get('policies')
  @ApiOperation({ summary: 'List all escalation policies' })
  @ApiResponse({ status: 200, description: 'List of policies' })
  listPolicies(@Req() req: Request) {
    const userId = (req as any).user.id;
    return this.oncallService.findAllPolicies(userId);
  }

  @Get('policies/:id')
  @ApiOperation({ summary: 'Get escalation policy' })
  @ApiParam({ name: 'id', description: 'Policy ID' })
  @ApiResponse({ status: 200, description: 'Policy detail' })
  @ApiResponse({ status: 404, description: 'Policy not found' })
  getPolicy(@Req() req: Request, @Param('id') id: string) {
    const userId = (req as any).user.id;
    return this.oncallService.findPolicy(userId, id);
  }

  @Patch('policies/:id')
  @ApiOperation({ summary: 'Update escalation policy' })
  @ApiParam({ name: 'id', description: 'Policy ID' })
  @ApiResponse({ status: 200, description: 'Policy updated' })
  @ApiResponse({ status: 404, description: 'Policy not found' })
  updatePolicy(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: UpdateEscalationPolicyDto,
  ) {
    const userId = (req as any).user.id;
    return this.oncallService.updatePolicy(userId, id, dto);
  }

  @Delete('policies/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete escalation policy' })
  @ApiParam({ name: 'id', description: 'Policy ID' })
  @ApiResponse({ status: 204, description: 'Policy deleted' })
  async deletePolicy(@Req() req: Request, @Param('id') id: string) {
    const userId = (req as any).user.id;
    await this.oncallService.deletePolicy(userId, id);
  }
}

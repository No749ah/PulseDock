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

type AuthRequest = { user: { id: string } };

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
  createSchedule(@Req() req: AuthRequest, @Body() dto: CreateOnCallScheduleDto) {
    return this.oncallService.createSchedule(req.user.id, dto);
  }

  @Get('schedules')
  @ApiOperation({ summary: 'List all on-call schedules' })
  @ApiResponse({ status: 200, description: 'List of schedules' })
  listSchedules(@Req() req: AuthRequest) {
    return this.oncallService.findAllSchedules(req.user.id);
  }

  @Get('schedules/:id')
  @ApiOperation({ summary: 'Get on-call schedule with current on-call person' })
  @ApiParam({ name: 'id', description: 'Schedule ID' })
  @ApiResponse({ status: 200, description: 'Schedule detail with current on-call' })
  @ApiResponse({ status: 404, description: 'Schedule not found' })
  getSchedule(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.oncallService.getScheduleWithCurrentOnCall(req.user.id, id);
  }

  @Patch('schedules/:id')
  @ApiOperation({ summary: 'Update on-call schedule' })
  @ApiParam({ name: 'id', description: 'Schedule ID' })
  @ApiResponse({ status: 200, description: 'Schedule updated' })
  @ApiResponse({ status: 404, description: 'Schedule not found' })
  updateSchedule(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() dto: UpdateOnCallScheduleDto,
  ) {
    return this.oncallService.updateSchedule(req.user.id, id, dto);
  }

  @Delete('schedules/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete on-call schedule' })
  @ApiParam({ name: 'id', description: 'Schedule ID' })
  @ApiResponse({ status: 204, description: 'Schedule deleted' })
  @ApiResponse({ status: 404, description: 'Schedule not found' })
  async deleteSchedule(@Req() req: AuthRequest, @Param('id') id: string) {
    await this.oncallService.deleteSchedule(req.user.id, id);
  }

  // ─── Participants ─────────────────────────────────────────────────────────

  @Post('schedules/:id/participants')
  @ApiOperation({ summary: 'Add participant to schedule' })
  @ApiParam({ name: 'id', description: 'Schedule ID' })
  @ApiResponse({ status: 201, description: 'Participant added' })
  addParticipant(
    @Req() req: AuthRequest,
    @Param('id') scheduleId: string,
    @Body() dto: AddParticipantDto,
  ) {
    return this.oncallService.addParticipant(req.user.id, scheduleId, dto);
  }

  @Delete('schedules/:id/participants/:participantId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove participant from schedule' })
  @ApiParam({ name: 'id', description: 'Schedule ID' })
  @ApiParam({ name: 'participantId', description: 'Participant ID' })
  @ApiResponse({ status: 204, description: 'Participant removed' })
  async removeParticipant(
    @Req() req: AuthRequest,
    @Param('id') scheduleId: string,
    @Param('participantId') participantId: string,
  ) {
    await this.oncallService.removeParticipant(req.user.id, scheduleId, participantId);
  }

  // ─── Escalation Policies ──────────────────────────────────────────────────

  @Post('policies')
  @ApiOperation({ summary: 'Create escalation policy' })
  @ApiResponse({ status: 201, description: 'Policy created' })
  createPolicy(@Req() req: AuthRequest, @Body() dto: CreateEscalationPolicyDto) {
    return this.oncallService.createPolicy(req.user.id, dto);
  }

  @Get('policies')
  @ApiOperation({ summary: 'List all escalation policies' })
  @ApiResponse({ status: 200, description: 'List of policies' })
  listPolicies(@Req() req: AuthRequest) {
    return this.oncallService.findAllPolicies(req.user.id);
  }

  @Get('policies/:id')
  @ApiOperation({ summary: 'Get escalation policy' })
  @ApiParam({ name: 'id', description: 'Policy ID' })
  @ApiResponse({ status: 200, description: 'Policy detail' })
  @ApiResponse({ status: 404, description: 'Policy not found' })
  getPolicy(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.oncallService.findPolicy(req.user.id, id);
  }

  @Patch('policies/:id')
  @ApiOperation({ summary: 'Update escalation policy' })
  @ApiParam({ name: 'id', description: 'Policy ID' })
  @ApiResponse({ status: 200, description: 'Policy updated' })
  @ApiResponse({ status: 404, description: 'Policy not found' })
  updatePolicy(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() dto: UpdateEscalationPolicyDto,
  ) {
    return this.oncallService.updatePolicy(req.user.id, id, dto);
  }

  @Delete('policies/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete escalation policy' })
  @ApiParam({ name: 'id', description: 'Policy ID' })
  @ApiResponse({ status: 204, description: 'Policy deleted' })
  async deletePolicy(@Req() req: AuthRequest, @Param('id') id: string) {
    await this.oncallService.deletePolicy(req.user.id, id);
  }
}

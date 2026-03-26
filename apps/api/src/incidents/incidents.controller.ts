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
import { ApiTags, ApiOperation, ApiParam, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { IncidentsService, CreateIncidentDto, UpdateIncidentDto, AddUpdateDto } from './incidents.service';
import { AuthGuard } from '../common/auth.guard';
import type { Request } from 'express';
import { IsString, IsOptional, IsEnum, IsArray, MaxLength, MinLength } from 'class-validator';
import { IncidentStatus, IncidentSeverity } from '@prisma/client';

class CreateIncidentBody implements CreateIncidentDto {
  @IsString() @MinLength(1) @MaxLength(255)
  title!: string;

  @IsOptional() @IsString() @MaxLength(2000)
  description?: string;

  @IsOptional() @IsEnum(IncidentSeverity)
  severity?: IncidentSeverity;

  @IsOptional() @IsArray() @IsString({ each: true })
  monitorIds?: string[];
}

class UpdateIncidentBody implements UpdateIncidentDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(255)
  title?: string;

  @IsOptional() @IsString() @MaxLength(2000)
  description?: string;

  @IsOptional() @IsEnum(IncidentStatus)
  status?: IncidentStatus;

  @IsOptional() @IsEnum(IncidentSeverity)
  severity?: IncidentSeverity;

  @IsOptional() @IsArray() @IsString({ each: true })
  monitorIds?: string[];

  @IsOptional() @IsString() @MaxLength(5000)
  rootCause?: string | null;

  @IsOptional() @IsString() @MaxLength(10000)
  postmortemNotes?: string | null;
}

class AddUpdateBody implements AddUpdateDto {
  @IsString() @MinLength(1) @MaxLength(2000)
  body!: string;

  @IsEnum(IncidentStatus)
  status!: IncidentStatus;
}

interface AuthenticatedRequest extends Request {
  user: { sub: string; role: string };
}

@ApiTags('Incidents')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('v1/incidents')
export class IncidentsController {
  constructor(private readonly incidents: IncidentsService) {}

  @Get()
  @ApiOperation({ summary: 'List all incidents', description: 'Returns all incidents for the authenticated user, ordered by creation date descending. Includes active incidents first, then resolved.' })
  @ApiResponse({ status: 200, description: 'List of incidents ordered by createdAt descending.' })
  @ApiResponse({ status: 401, description: 'Not authenticated — Bearer token missing or expired.' })
  findAll(@Req() req: AuthenticatedRequest) {
    return this.incidents.findAll(req.user.sub);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single incident with full timeline', description: 'Returns a single incident including all status updates and affected monitors.' })
  @ApiParam({ name: 'id', description: 'Incident CUID', example: 'clfxyz123' })
  @ApiResponse({ status: 200, description: 'Incident detail with timeline updates and affected monitors.' })
  @ApiResponse({ status: 401, description: 'Not authenticated.' })
  @ApiResponse({ status: 403, description: 'Access denied — incident belongs to another user.' })
  @ApiResponse({ status: 404, description: 'Incident not found.' })
  findOne(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.incidents.findOne(req.user.sub, id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new incident', description: 'Creates an incident with the given title, severity, and optionally links monitors that are affected.' })
  @ApiResponse({ status: 201, description: 'Incident created. Returns the full incident object.' })
  @ApiResponse({ status: 400, description: 'Validation error — title is required and must be 1–255 characters.' })
  @ApiResponse({ status: 401, description: 'Not authenticated.' })
  create(@Req() req: AuthenticatedRequest, @Body() body: CreateIncidentBody) {
    return this.incidents.create(req.user.sub, body);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update incident (status, severity, title, monitors)', description: 'Partially updates an incident. All fields are optional. Changing status to RESOLVED sets resolvedAt.' })
  @ApiParam({ name: 'id', description: 'Incident CUID', example: 'clfxyz123' })
  @ApiResponse({ status: 200, description: 'Updated incident object.' })
  @ApiResponse({ status: 400, description: 'Validation error.' })
  @ApiResponse({ status: 401, description: 'Not authenticated.' })
  @ApiResponse({ status: 403, description: 'Access denied.' })
  @ApiResponse({ status: 404, description: 'Incident not found.' })
  update(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: UpdateIncidentBody,
  ) {
    return this.incidents.update(req.user.sub, id, body);
  }

  @Post(':id/updates')
  @ApiOperation({ summary: 'Post a status update to an incident', description: 'Appends a timeline update (message + status transition) to an existing incident. Also updates the parent incident\'s status.' })
  @ApiParam({ name: 'id', description: 'Incident CUID', example: 'clfxyz123' })
  @ApiResponse({ status: 201, description: 'Update posted. Returns the new IncidentUpdate object.' })
  @ApiResponse({ status: 400, description: 'Validation error — body is required; status must be a valid IncidentStatus enum value.' })
  @ApiResponse({ status: 401, description: 'Not authenticated.' })
  @ApiResponse({ status: 403, description: 'Access denied.' })
  @ApiResponse({ status: 404, description: 'Incident not found.' })
  addUpdate(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: AddUpdateBody,
  ) {
    return this.incidents.addUpdate(req.user.sub, id, body);
  }

  @Patch(':id/postmortem')
  @ApiOperation({ summary: 'Update incident post-mortem', description: 'Sets or updates the root cause analysis and post-mortem notes for a resolved incident.' })
  @ApiParam({ name: 'id', description: 'Incident CUID', example: 'clfxyz123' })
  @ApiResponse({ status: 200, description: 'Post-mortem updated.' })
  @ApiResponse({ status: 404, description: 'Incident not found.' })
  updatePostmortem(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: { rootCause?: string | null; postmortemNotes?: string | null },
  ) {
    return this.incidents.update(req.user.sub, id, {
      rootCause: body.rootCause,
      postmortemNotes: body.postmortemNotes,
    });
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an incident', description: 'Permanently deletes an incident and all its timeline updates.' })
  @ApiParam({ name: 'id', description: 'Incident CUID', example: 'clfxyz123' })
  @ApiResponse({ status: 204, description: 'Incident deleted successfully. No response body.' })
  @ApiResponse({ status: 401, description: 'Not authenticated.' })
  @ApiResponse({ status: 403, description: 'Access denied.' })
  @ApiResponse({ status: 404, description: 'Incident not found.' })
  async delete(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    await this.incidents.delete(req.user.sub, id);
  }
}

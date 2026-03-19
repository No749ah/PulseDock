import { Body, Controller, Delete, Get, HttpCode, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../common/auth.guard';
import { ApiKeysService } from './apikeys.service';
import { CreateApiKeyDto } from './apikeys.dto';

@ApiTags('API Keys')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('v1/api-keys')
export class ApiKeysController {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  @Get()
  @ApiOperation({ summary: 'List API keys', description: 'Returns all API keys for the authenticated user (key hash never exposed).' })
  @ApiResponse({ status: 200, description: 'API key list.' })
  list(@Req() req: { user: { id: string } }) {
    return this.apiKeysService.list(req.user.id);
  }

  @Post()
  @ApiOperation({
    summary: 'Create API key',
    description: 'Generates a new API key. The full key is returned **only once** — store it immediately.',
  })
  @ApiResponse({ status: 201, description: 'API key created. Contains one-time plaintext key.' })
  create(@Req() req: { user: { id: string } }, @Body() body: CreateApiKeyDto) {
    return this.apiKeysService.create(req.user.id, body);
  }

  @Post(':id/rotate')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Rotate API key',
    description: 'Generates a new secret for an existing key. The old key is immediately invalidated. The new plaintext key is returned **once** — store it immediately. Name, scope, and expiry are preserved.',
  })
  @ApiParam({ name: 'id', description: 'API key ID to rotate' })
  @ApiResponse({ status: 200, description: 'New key generated. Contains one-time plaintext key.' })
  @ApiResponse({ status: 404, description: 'Key not found.' })
  rotate(@Req() req: { user: { id: string } }, @Param('id') id: string) {
    return this.apiKeysService.rotate(req.user.id, id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Revoke API key', description: 'Permanently deletes an API key. Cannot be undone.' })
  @ApiParam({ name: 'id', description: 'API key ID' })
  @ApiResponse({ status: 200, description: 'Key revoked.' })
  @ApiResponse({ status: 404, description: 'Key not found.' })
  delete(@Req() req: { user: { id: string } }, @Param('id') id: string) {
    return this.apiKeysService.delete(req.user.id, id);
  }
}

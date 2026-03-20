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
  @ApiOperation({ summary: 'List API keys', description: 'Returns all API keys for the authenticated user. Key hashes are never exposed — only metadata (name, scope, lastUsedAt, expiresAt).' })
  @ApiResponse({ status: 200, description: 'Array of API key metadata objects.' })
  @ApiResponse({ status: 401, description: 'Not authenticated.' })
  list(@Req() req: { user: { id: string } }) {
    return this.apiKeysService.list(req.user.id);
  }

  @Post()
  @ApiOperation({
    summary: 'Create API key',
    description: 'Generates a new API key with the specified name, scope (read/write/admin), and optional expiry. The full plaintext key is returned **only once** — store it immediately as it cannot be retrieved again.',
  })
  @ApiResponse({ status: 201, description: 'API key created. Response includes one-time plaintext `key` field.' })
  @ApiResponse({ status: 400, description: 'Validation error — name is required.' })
  @ApiResponse({ status: 401, description: 'Not authenticated.' })
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
  @ApiResponse({ status: 200, description: 'New key generated. Response includes one-time plaintext `key` field.' })
  @ApiResponse({ status: 401, description: 'Not authenticated.' })
  @ApiResponse({ status: 404, description: 'Key not found.' })
  rotate(@Req() req: { user: { id: string } }, @Param('id') id: string) {
    return this.apiKeysService.rotate(req.user.id, id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Revoke API key', description: 'Permanently deletes an API key. Any requests using the deleted key will receive 401 immediately.' })
  @ApiParam({ name: 'id', description: 'API key ID' })
  @ApiResponse({ status: 200, description: '`{ ok: true }` on success.' })
  @ApiResponse({ status: 401, description: 'Not authenticated.' })
  @ApiResponse({ status: 404, description: 'Key not found.' })
  delete(@Req() req: { user: { id: string } }, @Param('id') id: string) {
    return this.apiKeysService.delete(req.user.id, id);
  }
}

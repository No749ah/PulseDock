import { Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../common/prisma.service';
import { ApiKeyScope, CreateApiKeyDto } from './apikeys.dto';

const KEY_PREFIX_LENGTH = 8;
const KEY_PREFIX = 'pdck_';

@Injectable()
export class ApiKeysService {
  constructor(private readonly prisma: PrismaService) {}

  private generateKey(): { plaintext: string; prefix: string; hash: string } {
    const raw = randomBytes(32).toString('hex'); // 64 hex chars
    const plaintext = `${KEY_PREFIX}${raw}`;
    const prefix = plaintext.slice(0, KEY_PREFIX.length + KEY_PREFIX_LENGTH); // pdck_XXXXXXXX
    const hash = createHash('sha256').update(plaintext).digest('hex');
    return { plaintext, prefix, hash };
  }

  async create(userId: string, dto: CreateApiKeyDto) {
    const { plaintext, prefix, hash } = this.generateKey();

    const apiKey = await this.prisma.apiKey.create({
      data: {
        userId,
        name: dto.name,
        keyHash: hash,
        prefix,
        scope: dto.scope ?? ApiKeyScope.WRITE,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      },
    });

    return {
      id: apiKey.id,
      name: apiKey.name,
      prefix: apiKey.prefix,
      scope: apiKey.scope,
      usageCount: apiKey.usageCount,
      createdAt: apiKey.createdAt,
      expiresAt: apiKey.expiresAt,
      // Only returned on creation — never again
      key: plaintext,
    };
  }

  async list(userId: string) {
    const keys = await this.prisma.apiKey.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        prefix: true,
        scope: true,
        usageCount: true,
        lastUsedAt: true,
        expiresAt: true,
        createdAt: true,
      },
    });
    return keys;
  }

  async delete(userId: string, id: string) {
    const key = await this.prisma.apiKey.findFirst({ where: { id, userId } });
    if (!key) throw new NotFoundException('API key not found');
    await this.prisma.apiKey.delete({ where: { id } });
    return { ok: true };
  }

  /** Validate a raw API key string — returns the owning user with scope or null */
  async validateKey(plaintext: string): Promise<{ id: string; email: string; role: 'admin' | 'user'; apiKeyScope: ApiKeyScope } | null> {
    if (!plaintext.startsWith(KEY_PREFIX)) return null;

    const prefix = plaintext.slice(0, KEY_PREFIX.length + KEY_PREFIX_LENGTH);
    const hash = createHash('sha256').update(plaintext).digest('hex');

    const apiKey = await this.prisma.apiKey.findFirst({
      where: {
        prefix,
        keyHash: hash,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      include: {
        user: { select: { id: true, email: true, role: true, isActive: true, lockedUntil: true } },
      },
    });

    if (!apiKey) return null;

    const u = apiKey.user;
    if (!u.isActive || (u.lockedUntil && u.lockedUntil > new Date())) return null;

    // Update lastUsedAt and increment usageCount (fire-and-forget — don't block the request)
    void this.prisma.apiKey.update({
      where: { id: apiKey.id },
      data: { lastUsedAt: new Date(), usageCount: { increment: 1 } },
    });

    return {
      id: u.id,
      email: u.email,
      role: u.role as 'admin' | 'user',
      apiKeyScope: apiKey.scope as ApiKeyScope,
    };
  }

  /** Check if a scope grants at least the required level */
  static scopeAllows(scope: ApiKeyScope, required: ApiKeyScope): boolean {
    const levels: Record<ApiKeyScope, number> = {
      [ApiKeyScope.READ]: 1,
      [ApiKeyScope.WRITE]: 2,
      [ApiKeyScope.ADMIN]: 3,
    };
    return levels[scope] >= levels[required];
  }
}

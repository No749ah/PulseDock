import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(action: string, actorUserId?: string | null, targetUserId?: string | null, meta?: unknown) {
    await this.prisma.auditLog.create({
      data: {
        action,
        actorUserId: actorUserId ?? null,
        targetUserId: targetUserId ?? null,
        metaJson: (meta ?? {}) as Prisma.InputJsonValue,
      },
    });
  }
}

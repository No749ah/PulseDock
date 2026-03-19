import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service';

/**
 * Service for writing structured audit log entries to the database.
 *
 * Every security-relevant action (logins, registrations, password changes,
 * admin operations, account lockouts, etc.) should be recorded via this service.
 * The log is queryable and exportable via the /v1/auth/audit-log endpoints.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Records a single audit log entry.
   *
   * @param action       - Machine-readable event name (e.g. "auth.login", "monitor.delete")
   * @param actorUserId  - ID of the user performing the action, or null for system events
   * @param targetUserId - ID of the affected user (if different from actor), or null
   * @param meta         - Arbitrary JSON metadata (IP, user agent, entity IDs, etc.)
   */
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

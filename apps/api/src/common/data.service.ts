import { Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import type { AlertChannel, Folder, Monitor, MonitorRun, Session, User } from '../types';

/**
 * In-memory data store used exclusively in unit tests and the legacy stub layer.
 *
 * @deprecated All persistence has migrated to Prisma + PostgreSQL. This service
 * is retained only for test fixtures that have not yet been migrated. Do not add
 * new production code here.
 */
@Injectable()
export class DataService {
  users: User[] = [];
  sessions: Session[] = [];
  folders: Folder[] = [];
  monitors: Monitor[] = [];
  runs: MonitorRun[] = [];
  alertChannels: AlertChannel[] = [];

  /**
   * Generates a cryptographically random UUID v4.
   * @returns A UUID string such as `"550e8400-e29b-41d4-a716-446655440000"`
   */
  id() {
    return randomUUID();
  }

  /**
   * Returns the SHA-256 hex digest of the given string.
   * Used for password/token hashing in test fixtures only.
   *
   * @param value - Plaintext string to hash
   * @returns 64-character lowercase hex string
   */
  hash(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }
}

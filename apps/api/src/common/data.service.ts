import { Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import type { AlertChannel, Folder, Monitor, MonitorRun, Session, User } from '../types';

@Injectable()
export class DataService {
  users: User[] = [];
  sessions: Session[] = [];
  folders: Folder[] = [];
  monitors: Monitor[] = [];
  runs: MonitorRun[] = [];
  alertChannels: AlertChannel[] = [];

  id() {
    return randomUUID();
  }

  hash(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }
}

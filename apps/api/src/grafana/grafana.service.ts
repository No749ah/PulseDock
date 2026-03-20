import { Injectable } from '@nestjs/common';

@Injectable()
export class GrafanaService {
  async search(_userId: string, _query: string): Promise<string[]> {
    return [];
  }

  async query(_userId: string, _body: unknown): Promise<unknown[]> {
    return [];
  }

  async annotations(_userId: string, _body: unknown): Promise<unknown[]> {
    return [];
  }

  async tagValues(_userId: string, _key: string): Promise<{ text: string }[]> {
    return [];
  }
}

/**
 * Unit tests for MonitorsService.runPlayground()
 * Tests one-off HTTP check playground feature.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { MonitorsService } from './monitors.service';
import { PrismaService } from '../common/prisma.service';
import { ChecksService } from '../checks/checks.service';
import { AuditService } from '../common/audit.service';
import { RealtimeEvents } from '../realtime/realtime.events';
import { VersionDetectionService } from './version-detection.service';
import type { PlaygroundDto } from './playground.dto';
import * as http from 'http';

// ─── Minimal stub server helpers ──────────────────────────────────────────────

function createStubServer(handler: (req: http.IncomingMessage, res: http.ServerResponse) => void): Promise<{ server: http.Server; port: number }> {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as { port: number };
      resolve({ server, port: addr.port });
    });
  });
}

function closeServer(server: http.Server): Promise<void> {
  return new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
}

// ─── Service factory ──────────────────────────────────────────────────────────

async function buildService(): Promise<MonitorsService> {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      MonitorsService,
      { provide: PrismaService, useValue: {} },
      { provide: ChecksService, useValue: { listPlugins: vi.fn().mockReturnValue([]), runMonitor: vi.fn() } },
      { provide: AuditService, useValue: { log: vi.fn() } },
      { provide: RealtimeEvents, useValue: { emitMonitorUpdate: vi.fn(), emitCheckResult: vi.fn() } },
      { provide: VersionDetectionService, useValue: {} },
    ],
  }).compile();
  return module.get<MonitorsService>(MonitorsService);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('MonitorsService.runPlayground', () => {
  let service: MonitorsService;
  let server: http.Server;
  let port: number;

  afterEach(async () => {
    if (server) {
      await closeServer(server);
      server = undefined as unknown as http.Server;
    }
  });

  beforeEach(async () => {
    service = await buildService();
  });

  it('1. Returns ok=true for 200 response', async () => {
    ({ server, port } = await createStubServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('OK');
    }));

    const dto: PlaygroundDto = { url: `http://127.0.0.1:${port}/health`, checkSsl: false };
    const result = await service.runPlayground(dto, 'user-1');

    expect(result.ok).toBe(true);
    expect(result.statusCode).toBe(200);
    expect(result.error).toBeUndefined();
  });

  it('2. Returns ok=false when expectedStatus mismatch', async () => {
    ({ server, port } = await createStubServer((_req, res) => {
      res.writeHead(200);
      res.end('OK');
    }));

    const dto: PlaygroundDto = { url: `http://127.0.0.1:${port}/`, expectedStatus: 201, checkSsl: false };
    const result = await service.runPlayground(dto, 'user-2');

    expect(result.ok).toBe(false);
    expect(result.assertions.statusOk).toBe(false);
    expect(result.statusCode).toBe(200);
  });

  it('3. Returns ok=false when bodyContains not found', async () => {
    ({ server, port } = await createStubServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
    }));

    const dto: PlaygroundDto = { url: `http://127.0.0.1:${port}/`, bodyContains: 'not-in-body', checkSsl: false };
    const result = await service.runPlayground(dto, 'user-3');

    expect(result.ok).toBe(false);
    expect(result.assertions.bodyContainsOk).toBe(false);
  });

  it('4. Returns error when URL is not http/https', async () => {
    const dto: PlaygroundDto = { url: 'ftp://example.com/file.txt', checkSsl: false };
    const result = await service.runPlayground(dto, 'user-4');

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/http/i);
    expect(result.statusCode).toBe(0);
  });

  it('5. Returns bodyExcerpt truncated to 500 chars', async () => {
    const longBody = 'X'.repeat(2000);
    ({ server, port } = await createStubServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end(longBody);
    }));

    const dto: PlaygroundDto = { url: `http://127.0.0.1:${port}/`, checkSsl: false };
    const result = await service.runPlayground(dto, 'user-5');

    expect(result.bodyExcerpt).toHaveLength(500);
    expect(result.bodyExcerpt).toBe('X'.repeat(500));
  });
});

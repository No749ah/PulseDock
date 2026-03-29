import { describe, it, expect, beforeEach } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { MonitorsService } from './monitors.service';

// Minimal stub for MonitorsService — importFromCompose has no Prisma dependency
function makeService(): MonitorsService {
  return new MonitorsService(
    null as never,
    null as never,
    null as never,
    null as never,
    null as never,
  );
}

describe('MonitorsService.importFromCompose', () => {
  let service: MonitorsService;

  beforeEach(() => {
    service = makeService();
  });

  it('parses nginx service and suggests HTTP monitor on port 80', () => {
    const compose = `
version: "3"
services:
  web:
    image: nginx:latest
    ports:
      - "80:80"
`;
    const result = service.importFromCompose(compose);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('web');
    expect(result[0].type).toBe('HTTP');
    expect(result[0].target).toBe('http://localhost:80');
    expect(result[0].reason).toMatch(/nginx/i);
    expect(result[0].intervalSec).toBe(60);
  });

  it('parses postgres service and suggests TCP monitor on port 5432', () => {
    const compose = `
version: "3"
services:
  db:
    image: postgres:15
    ports:
      - "5432:5432"
`;
    const result = service.importFromCompose(compose);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('db');
    expect(result[0].type).toBe('TCP');
    expect(result[0].target).toBe('localhost:5432');
    expect(result[0].reason).toMatch(/postgres/i);
  });

  it('parses redis service and suggests TCP monitor on port 6379', () => {
    const compose = `
version: "3"
services:
  cache:
    image: redis:7-alpine
    ports:
      - "6379:6379"
`;
    const result = service.importFromCompose(compose);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('cache');
    expect(result[0].type).toBe('TCP');
    expect(result[0].target).toBe('localhost:6379');
    expect(result[0].reason).toMatch(/redis/i);
  });

  it('skips services with no ports', () => {
    const compose = `
version: "3"
services:
  worker:
    image: myapp/worker:latest
`;
    const result = service.importFromCompose(compose);
    expect(result).toHaveLength(0);
  });

  it('throws BadRequestException on invalid YAML', () => {
    const badCompose = `
services:
  web: {
    image: nginx
    ports: [
`;
    expect(() => service.importFromCompose(badCompose)).toThrow(BadRequestException);
  });

  it('handles multi-service compose with mixed types', () => {
    const compose = `
version: "3"
services:
  web:
    image: nginx:latest
    ports:
      - "80:80"
  db:
    image: postgres:15
    ports:
      - "5432:5432"
  cache:
    image: redis:7
    ports:
      - "6379:6379"
  worker:
    image: myapp/worker:latest
`;
    const result = service.importFromCompose(compose);
    // web (HTTP), db (TCP), cache (TCP) — worker skipped (no ports)
    expect(result).toHaveLength(3);

    const web = result.find((m) => m.name === 'web');
    expect(web?.type).toBe('HTTP');

    const db = result.find((m) => m.name === 'db');
    expect(db?.type).toBe('TCP');

    const cache = result.find((m) => m.name === 'cache');
    expect(cache?.type).toBe('TCP');

    const worker = result.find((m) => m.name === 'worker');
    expect(worker).toBeUndefined();
  });
});

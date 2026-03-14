import { describe, it, expect, vi } from 'vitest';

// Mock PrismaClient and PrismaPg before importing PrismaService
vi.mock('@prisma/client', () => ({
  PrismaClient: class {
    $connect = vi.fn().mockResolvedValue(undefined);
    $disconnect = vi.fn().mockResolvedValue(undefined);
    constructor(_opts?: unknown) {}
  },
}));

vi.mock('@prisma/adapter-pg', () => ({
  PrismaPg: class {
    constructor(_opts?: unknown) {}
  },
}));

import { PrismaService } from './prisma.service';

describe('PrismaService', () => {
  it('calls $connect on onModuleInit', async () => {
    const svc = new PrismaService();
    await svc.onModuleInit();
    expect(svc.$connect).toHaveBeenCalledOnce();
  });

  it('calls $disconnect on onModuleDestroy', async () => {
    const svc = new PrismaService();
    await svc.onModuleDestroy();
    expect(svc.$disconnect).toHaveBeenCalledOnce();
  });

  it('constructs without throwing', () => {
    expect(() => new PrismaService()).not.toThrow();
  });
});

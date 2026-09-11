import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

/**
 * NestJS wrapper around PrismaClient.
 *
 * Uses the `@prisma/adapter-pg` driver adapter for direct PostgreSQL connections
 * (driver-level prepared statements, no extra Prisma proxy needed).
 *
 * Connection is established on module init and cleanly closed on module destroy
 * to ensure graceful shutdown without connection leaks in test teardown.
 *
 * Inject this service wherever database access is needed — it provides the full
 * Prisma model query API (e.g. `this.prisma.monitor.findMany(...)`).
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    const connectionString = process.env.DATABASE_URL;
    const adapter = new PrismaPg({ connectionString });
    super({ adapter });
  }

  /** Connects to PostgreSQL on application startup. */
  async onModuleInit() {
    await this.$connect();
  }

  /** Disconnects gracefully on application shutdown or test teardown. */
  async onModuleDestroy() {
    await this.$disconnect();
  }
}

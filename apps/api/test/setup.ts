/**
 * Integration test setup — boots a real NestJS app against the test database.
 *
 * Uses the same DATABASE_URL as dev (pulsedock DB on dind) but wraps each
 * test suite in a transaction that rolls back, keeping the DB clean.
 *
 * Usage:
 *   import { createTestApp, destroyTestApp } from './setup';
 *
 *   let app: INestApplication;
 *   let prisma: PrismaService;
 *
 *   beforeAll(async () => {
 *     ({ app, prisma } = await createTestApp());
 *   });
 *   afterAll(() => destroyTestApp(app));
 */
import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Load .env from project root before anything else accesses process.env
const envPath = resolve(__dirname, '..', '..', '..', '.env');
try {
  const envContent = readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
} catch {
  // .env not found — rely on existing env vars
}

// Enable public registration for integration tests
process.env.ALLOW_PUBLIC_REGISTRATION = 'true';

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma.service';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const cookieParser = require('cookie-parser') as (opts?: unknown) => (req: unknown, res: unknown, next: () => void) => void;

export async function createTestApp(): Promise<{
  app: INestApplication;
  prisma: PrismaService;
  module: TestingModule;
}> {
  const module = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  // Monkey-patch ThrottlerGuard to disable rate limiting in tests
  try {
    const guard = module.get(ThrottlerGuard);
    const origCanActivate = guard.canActivate.bind(guard);
    guard.canActivate = function () {
      void origCanActivate;
      return Promise.resolve(true);
    };
  } catch {
    // ThrottlerGuard not found — not an issue
  }

  const app = module.createNestApplication();

  // Mirror the same middleware as main.ts
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.use(cookieParser());

  // Disable throttling in tests
  app.enableCors({ origin: '*' });

  await app.init();

  const prisma = module.get(PrismaService);

  return { app, prisma, module };
}

export async function destroyTestApp(app: INestApplication): Promise<void> {
  await app.close();
}

/**
 * Create a test user directly via Prisma and return auth credentials.
 * Returns the user object and a JWT token for authenticated requests.
 */
export async function createTestUser(
  prisma: PrismaService,
  module: TestingModule,
  overrides: Record<string, unknown> = {},
): Promise<{ user: { id: string; email: string }; token: string }> {
  const { randomUUID } = await import('node:crypto');
  const { hashSync } = await import('bcryptjs');
  const { JwtService } = await import('@nestjs/jwt');

  const id = randomUUID();
  const email = overrides.email as string ?? `test-${id}@integration.test`;
  const password = hashSync('TestPassword123!', 10);

  const user = await prisma.user.create({
    data: {
      id,
      email,
      passwordHash: password,
      displayName: (overrides.displayName as string) ?? 'Integration Test User',
      role: (overrides.role as string) ?? 'admin',
      emailVerified: true,
    },
  });

  // Create a session (required by auth guard)
  const session = await prisma.session.create({
    data: {
      userId: user.id,
      refreshTokenHash: 'integration-test-hash',
      userAgent: 'integration-test',
    },
  });

  const jwt = module.get(JwtService);
  const accessSecret = process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret';
  const token = jwt.sign(
    { sub: user.id, sid: session.id, email: user.email, role: user.role, type: 'access' },
    { secret: accessSecret, expiresIn: '1h' },
  );

  return { user: { id: user.id, email: user.email }, token };
}

/**
 * Clean up all data created by a test user.
 */
export async function cleanupTestUser(prisma: PrismaService | undefined, userId: string): Promise<void> {
  if (!prisma) return;
  try {
    // Delete in dependency order
    await prisma.monitorRun.deleteMany({ where: { userId } });
    await prisma.monitorAlert.deleteMany({ where: { monitor: { userId } } });
    await prisma.monitorConfigChange.deleteMany({ where: { monitor: { userId } } });
    await prisma.monitorTag.deleteMany({ where: { monitor: { userId } } });
    await prisma.monitor.deleteMany({ where: { userId } });
    await prisma.alertChannel.deleteMany({ where: { userId } });
    await prisma.incident.deleteMany({ where: { userId } });
    await prisma.statusPage.deleteMany({ where: { userId } });
    await prisma.folder.deleteMany({ where: { userId } });
    await prisma.tag.deleteMany({ where: { userId } });
    await prisma.apiKey.deleteMany({ where: { userId } });
    await prisma.session.deleteMany({ where: { userId } });
    await prisma.auditLog.deleteMany({ where: { actorUserId: userId } });
    await prisma.user.delete({ where: { id: userId } }).catch(() => { /* already gone */ });
  } catch {
    // Best effort cleanup — DB might be unreachable
  }
}

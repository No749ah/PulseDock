/**
 * Integration tests: Authentication flow against a real PostgreSQL database.
 *
 * Note: Auth endpoints have strict per-route rate limits (@Throttle 5/60s).
 * Tests use Prisma directly for user creation where possible to avoid rate limits.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { createTestApp, destroyTestApp, createTestUser, cleanupTestUser } from './setup';
import type { PrismaService } from '../src/common/prisma.service';

describe('Auth (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let module: TestingModule;
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    ({ app, prisma, module } = await createTestApp());
  }, 30000);

  afterAll(async () => {
    for (const id of createdUserIds) {
      await cleanupTestUser(prisma, id);
    }
    await destroyTestApp(app);
  }, 15000);

  // ─── Registration ───

  it('should register a new user', async () => {
    const email = `register-${Date.now()}@integration.test`;
    const res = await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send({ email, password: 'StrongPassword123!' })
      .expect(201);

    expect(res.body.id).toBeDefined();
    expect(res.body.email).toBe(email);
    createdUserIds.push(res.body.id);
  });

  it('should reject duplicate email registration', async () => {
    const email = `dup-${Date.now()}@integration.test`;

    const first = await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send({ email, password: 'StrongPassword123!' })
      .expect(201);
    createdUserIds.push(first.body.id);

    // Duplicate — should fail
    await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send({ email, password: 'StrongPassword123!' })
      .expect(409);
  });

  it('should reject weak passwords', async () => {
    await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send({
        email: `weak-${Date.now()}@integration.test`,
        password: '123',
      })
      .expect(400);
  });

  // ─── Login ───

  it('should login with correct credentials and access protected endpoints', async () => {
    const email = `login-${Date.now()}@integration.test`;

    const reg = await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send({ email, password: 'StrongPassword123!' })
      .expect(201);
    createdUserIds.push(reg.body.id);

    // Mark email as verified (required for login)
    await prisma.user.update({
      where: { id: reg.body.id },
      data: { emailVerified: true },
    });

    // Login (NestJS POST may return 200 or 201 depending on setup)
    const loginRes = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email, password: 'StrongPassword123!' });

    expect([200, 201]).toContain(loginRes.status);

    expect(loginRes.body).toHaveProperty('accessToken');
    expect(loginRes.body).toHaveProperty('user');
    expect(loginRes.body.user.email).toBe(email);

    // Use the access token to hit a protected endpoint
    const monitorsRes = await request(app.getHttpServer())
      .get('/v1/monitors')
      .set('Authorization', `Bearer ${loginRes.body.accessToken}`)
      .expect(200);

    expect(Array.isArray(monitorsRes.body)).toBe(true);
  });

  it('should reject login with wrong password', async () => {
    // Create user directly via Prisma to avoid rate limiting
    const testUser = await createTestUser(prisma, module);
    createdUserIds.push(testUser.user.id);

    await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: testUser.user.email, password: 'WrongPassword999!' })
      .expect(401);
  });

  // ─── Token validation ───

  it('should reject expired/invalid tokens', async () => {
    await request(app.getHttpServer())
      .get('/v1/monitors')
      .set('Authorization', 'Bearer invalid.token.here')
      .expect(401);
  });

  it('should reject requests without auth', async () => {
    await request(app.getHttpServer())
      .get('/v1/monitors')
      .expect(401);
  });

  // ─── Account lockout ───

  it('should lock account after repeated failed attempts', async () => {
    // Create user directly to avoid rate limits
    const testUser = await createTestUser(prisma, module);
    createdUserIds.push(testUser.user.id);

    // 5 failed login attempts
    for (let i = 0; i < 5; i++) {
      await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ email: testUser.user.email, password: 'WrongPassword!' });
    }

    // Check that user account has lockout applied
    const lockedUser = await prisma.user.findUnique({ where: { id: testUser.user.id } });
    expect(lockedUser?.failedLoginCount).toBeGreaterThanOrEqual(5);
    expect(lockedUser?.lockedUntil).not.toBeNull();
  });

  // ─── Health ───

  it('should return health check without auth', async () => {
    const res = await request(app.getHttpServer())
      .get('/health')
      .expect(200);

    expect(res.body.ok).toBe(true);
    expect(res.body.checks.database.status).toBe('ok');
  });
});

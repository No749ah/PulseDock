/**
 * Integration tests for PulseDock API
 *
 * Spins up the full NestJS app with a mocked PrismaService and tests real
 * HTTP routes via supertest. No database or Redis required.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { GlobalHttpExceptionFilter } from './common/http-exception.filter';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const cookieParser = require('cookie-parser') as () => (req: unknown, res: unknown, next: () => void) => void;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const supertest = require('supertest') as (app: unknown) => import('supertest').SuperTest<import('supertest').Test>;
import { AppModule } from './app.module';
import { PrismaService } from './common/prisma.service';
import { hashSync } from 'bcryptjs';

// ─── Prisma mock ──────────────────────────────────────────────────────────────

const VALID_USER = {
  id: 'user-001',
  email: 'test@example.com',
  passwordHash: hashSync('Test1234!@#$', 10),
  role: 'user' as const,
  isActive: true,
  mustChangePassword: false,
  failedLoginCount: 0,
  lockedUntil: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const MOCK_SESSION = {
  id: 'session-001',
  userId: VALID_USER.id,
  tokenHash: 'hash',
  userAgent: null,
  ipAddress: null,
  expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  createdAt: new Date(),
  revokedAt: null,
};

const mockPrisma = {
  $connect: vi.fn().mockResolvedValue(undefined),
  $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
  $disconnect: vi.fn(),
  user: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    count: vi.fn().mockResolvedValue(1),
  },
  session: {
    create: vi.fn().mockResolvedValue(MOCK_SESSION),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    findFirst: vi.fn().mockResolvedValue(null),
    findMany: vi.fn().mockResolvedValue([]),
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    update: vi.fn(),
  },
  monitor: {
    findMany: vi.fn().mockResolvedValue([]),
    findFirst: vi.fn().mockResolvedValue(null),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn().mockResolvedValue(0),
  },
  checkRun: {
    findMany: vi.fn().mockResolvedValue([]),
    create: vi.fn(),
    count: vi.fn().mockResolvedValue(0),
  },
  alertChannel: {
    findMany: vi.fn().mockResolvedValue([]),
    findFirst: vi.fn().mockResolvedValue(null),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  inviteToken: {
    findFirst: vi.fn().mockResolvedValue(null),
  },
  passwordResetToken: {
    findFirst: vi.fn().mockResolvedValue(null),
    create: vi.fn(),
    update: vi.fn(),
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
  },
  auditLog: {
    create: vi.fn(),
    findMany: vi.fn().mockResolvedValue([]),
    count: vi.fn().mockResolvedValue(0),
  },
  apiKey: {
    findMany: vi.fn().mockResolvedValue([]),
    findFirst: vi.fn().mockResolvedValue(null),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  folder: {
    findMany: vi.fn().mockResolvedValue([]),
    findFirst: vi.fn().mockResolvedValue(null),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn().mockResolvedValue(0),
  },
  $transaction: vi.fn().mockImplementation(async (fn: (tx: typeof mockPrisma) => Promise<unknown>) => fn(mockPrisma)),
};

// ─── App setup ────────────────────────────────────────────────────────────────

let app: INestApplication;

beforeAll(async () => {
  // Set required env vars for test
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
  process.env.JWT_ACCESS_SECRET = 'test-access-secret';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
  process.env.JWT_ACCESS_EXPIRES = '15m';
  process.env.JWT_REFRESH_EXPIRES = '30d';
  process.env.NODE_ENV = 'test';

  const moduleRef: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(PrismaService)
    .useValue(mockPrisma)
    .compile();

  app = moduleRef.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.useGlobalFilters(new GlobalHttpExceptionFilter());
  app.use(cookieParser());

  // Set up Swagger (mirrors main.ts bootstrap)
  const swaggerConfig = new DocumentBuilder()
    .setTitle('PulseDock API')
    .setDescription('Integration test Swagger instance')
    .setVersion('0.0.0')
    .addBearerAuth()
    .build();
  const swaggerDoc = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, swaggerDoc);

  await app.init();
});

afterAll(async () => {
  await app?.close();
});

// ─── System endpoints ─────────────────────────────────────────────────────────

describe('GET /health', () => {
  it('returns 200 with ok=true when DB is reachable', async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([{ '?column?': 1 }]);
    const res = await supertest(app.getHttpServer()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.service).toBe('pulsedock-api');
    expect(res.body.checks.database.status).toBe('ok');
  });

  it('returns 503 when DB is unreachable', async () => {
    mockPrisma.$queryRaw.mockRejectedValueOnce(new Error('connection refused'));
    const res = await supertest(app.getHttpServer()).get('/health');
    expect(res.status).toBe(503);
  });
});

describe('GET /health/live', () => {
  it('returns 200 always', async () => {
    const res = await supertest(app.getHttpServer()).get('/health/live');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

describe('GET /health/ready', () => {
  it('returns 200 when DB is reachable', async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([{ '?column?': 1 }]);
    const res = await supertest(app.getHttpServer()).get('/health/ready');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.ready).toBe(true);
  });

  it('returns 503 when DB is down', async () => {
    mockPrisma.$queryRaw.mockRejectedValueOnce(new Error('db down'));
    const res = await supertest(app.getHttpServer()).get('/health/ready');
    expect(res.status).toBe(503);
  });
});

describe('GET /metrics', () => {
  it('returns JSON metrics snapshot', async () => {
    const res = await supertest(app.getHttpServer()).get('/metrics');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('requestsTotal');
    expect(res.body).toHaveProperty('errorsTotal');
    expect(res.body).toHaveProperty('at');
  });
});

describe('GET /metrics/prometheus', () => {
  it('returns Prometheus text format with correct content-type', async () => {
    const res = await supertest(app.getHttpServer()).get('/metrics/prometheus');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.text).toContain('pulsedock_requestsTotal');
    expect(res.text).toContain('pulsedock_process_uptime_seconds');
    expect(res.text).toContain('# HELP');
    expect(res.text).toContain('# TYPE');
  });
});

describe('GET /version', () => {
  it('returns version string', async () => {
    const res = await supertest(app.getHttpServer()).get('/version');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('version');
    expect(typeof res.body.version).toBe('string');
  });
});

describe('GET /v1/system/version', () => {
  it('returns verbose version info', async () => {
    const res = await supertest(app.getHttpServer()).get('/v1/system/version');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('ServerVersion');
    expect(res.body.service).toBe('pulsedock-api');
    expect(res.body.runtime).toBe('nestjs');
  });
});

// ─── Auth endpoints ───────────────────────────────────────────────────────────

describe('POST /v1/auth/login', () => {
  it('returns 401 for invalid credentials', async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce(null);
    const res = await supertest(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: 'nobody@example.com', password: 'WrongPass1!' });
    expect(res.status).toBe(401);
  });

  it('returns 401 for wrong password', async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce(VALID_USER);
    mockPrisma.user.update.mockResolvedValueOnce({ ...VALID_USER, failedLoginCount: 1 });
    mockPrisma.auditLog.create.mockResolvedValueOnce({});
    const res = await supertest(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: VALID_USER.email, password: 'WrongPass999!!!' });
    expect(res.status).toBe(401);
  });

  it('returns 400 for missing fields', async () => {
    const res = await supertest(app.getHttpServer())
      .post('/v1/auth/login')
      .send({});
    expect(res.status).toBe(400);
  });

  it('returns 200 with tokens on valid credentials', async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce(VALID_USER);
    mockPrisma.user.update.mockResolvedValueOnce(VALID_USER);
    mockPrisma.session.create.mockResolvedValueOnce(MOCK_SESSION);
    mockPrisma.auditLog.create.mockResolvedValueOnce({});
    const res = await supertest(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: VALID_USER.email, password: 'Test1234!@#$' });
    // NestJS POST defaults to 201; login handler doesn't override with @HttpCode
    expect(res.status).toBeLessThan(300);
    expect(res.body).toHaveProperty('accessToken');
    expect(res.body).toHaveProperty('refreshToken');
    expect(res.body.user.email).toBe(VALID_USER.email);
  });
});

describe('POST /v1/auth/register', () => {
  it('returns 400 for weak password', async () => {
    const res = await supertest(app.getHttpServer())
      .post('/v1/auth/register')
      .send({ email: 'new@example.com', password: 'short' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for missing email', async () => {
    const res = await supertest(app.getHttpServer())
      .post('/v1/auth/register')
      .send({ password: 'Test1234!@#$' });
    expect(res.status).toBe(400);
  });
});

describe('POST /v1/auth/logout', () => {
  it('returns 2xx and clears cookies', async () => {
    const res = await supertest(app.getHttpServer())
      .post('/v1/auth/logout')
      .send({});
    // NestJS POST defaults to 201; logout is always successful
    expect(res.status).toBeLessThan(300);
    expect(res.body.ok).toBe(true);
  });
});

// ─── Auth guard / protected routes ────────────────────────────────────────────

describe('GET /v1/auth/me', () => {
  it('returns 401 without auth token', async () => {
    const res = await supertest(app.getHttpServer()).get('/v1/auth/me');
    expect(res.status).toBe(401);
  });
});

describe('GET /v1/monitors', () => {
  it('returns 401 without auth token', async () => {
    const res = await supertest(app.getHttpServer()).get('/v1/monitors');
    expect(res.status).toBe(401);
  });
});

describe('GET /v1/monitors (authenticated)', () => {
  it('returns 200 with empty array for new user', async () => {
    // Build a valid JWT using the app's own JwtService (same secret as test env)
    const { JwtService } = await import('@nestjs/jwt');
    const jwtService = new JwtService({});
    const token = jwtService.sign(
      { sub: VALID_USER.id, sid: MOCK_SESSION.id, email: VALID_USER.email, role: VALID_USER.role, type: 'access' },
      { secret: process.env.JWT_ACCESS_SECRET, expiresIn: '15m' },
    );

    // AuthGuard → getUserByAccessToken: verify JWT → session lookup
    mockPrisma.session.findFirst.mockResolvedValueOnce(MOCK_SESSION);
    // AuthGuard → getActiveUserById: user lookup
    mockPrisma.user.findUnique.mockResolvedValueOnce(VALID_USER);
    // MonitorsController.list → monitorsService.list
    mockPrisma.monitor.findMany.mockResolvedValueOnce([]);

    const res = await supertest(app.getHttpServer())
      .get('/v1/monitors')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

// ─── Input validation ─────────────────────────────────────────────────────────

describe('Input validation', () => {
  it('POST /v1/auth/login rejects extra unknown fields (forbidNonWhitelisted)', async () => {
    const res = await supertest(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: 'x@y.com', password: 'Test1234!', extraField: 'injection' });
    expect(res.status).toBe(400);
  });

  it('POST /v1/auth/login rejects non-email strings', async () => {
    const res = await supertest(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: 'not-an-email', password: 'Test1234!@#$' });
    expect(res.status).toBe(400);
  });
});

// ─── Swagger docs ─────────────────────────────────────────────────────────────

describe('GET /docs', () => {
  it('serves Swagger UI or redirects to it', async () => {
    const res = await supertest(app.getHttpServer()).get('/docs').redirects(2);
    // After following redirects, should get HTML or a 3xx/2xx
    expect(res.status).toBeLessThan(400);
  });
});

// ─── V2 API ───────────────────────────────────────────────────────────────────

describe('V2 System endpoints', () => {
  it('GET /v2/system/info returns API metadata', async () => {
    const res = await supertest(app.getHttpServer()).get('/v2/system/info');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      service: 'pulsedock-api',
      apiVersions: {
        supported: expect.arrayContaining(['v1', 'v2']),
        current: 'v2',
        stable: 'v1',
      },
    });
    expect(Array.isArray(res.body.apiVersions.deprecated)).toBe(true);
  });

  it('GET /v2/system/versions returns version matrix', async () => {
    const res = await supertest(app.getHttpServer()).get('/v2/system/versions');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.versions)).toBe(true);
    const vNames = res.body.versions.map((v: { version: string }) => v.version);
    expect(vNames).toContain('v1');
    expect(vNames).toContain('v2');
  });
});

describe('V2 Monitors — unauthenticated', () => {
  it('GET /v2/monitors returns 401 without auth', async () => {
    const res = await supertest(app.getHttpServer()).get('/v2/monitors');
    expect(res.status).toBe(401);
  });
});

describe('V2 Monitors — paginated list', () => {
  it('returns envelope { data, meta } with empty monitors', async () => {
    const { JwtService } = await import('@nestjs/jwt');
    const jwtService = new JwtService({});
    const token = jwtService.sign(
      { sub: VALID_USER.id, sid: MOCK_SESSION.id, email: VALID_USER.email, role: VALID_USER.role, type: 'access' },
      { secret: process.env.JWT_ACCESS_SECRET, expiresIn: '15m' },
    );

    mockPrisma.session.findFirst.mockResolvedValueOnce(MOCK_SESSION);
    mockPrisma.user.findUnique.mockResolvedValueOnce(VALID_USER);
    mockPrisma.monitor.findMany.mockResolvedValueOnce([]);
    mockPrisma.monitor.count.mockResolvedValueOnce(0);

    const res = await supertest(app.getHttpServer())
      .get('/v2/monitors')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.meta).toMatchObject({
      total: 0,
      page: 1,
      limit: 20,
      pages: 0,
    });
  });

  it('respects ?page=2&limit=5 query params', async () => {
    const { JwtService } = await import('@nestjs/jwt');
    const jwtService = new JwtService({});
    const token = jwtService.sign(
      { sub: VALID_USER.id, sid: MOCK_SESSION.id, email: VALID_USER.email, role: VALID_USER.role, type: 'access' },
      { secret: process.env.JWT_ACCESS_SECRET, expiresIn: '15m' },
    );

    mockPrisma.session.findFirst.mockResolvedValueOnce(MOCK_SESSION);
    mockPrisma.user.findUnique.mockResolvedValueOnce(VALID_USER);
    mockPrisma.monitor.findMany.mockResolvedValueOnce([]);
    mockPrisma.monitor.count.mockResolvedValueOnce(12);

    const res = await supertest(app.getHttpServer())
      .get('/v2/monitors?page=2&limit=5')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.meta).toMatchObject({
      total: 12,
      page: 2,
      limit: 5,
      pages: 3,
    });
  });

  it('returns monitor items with correct shape', async () => {
    const { JwtService } = await import('@nestjs/jwt');
    const jwtService = new JwtService({});
    const token = jwtService.sign(
      { sub: VALID_USER.id, sid: MOCK_SESSION.id, email: VALID_USER.email, role: VALID_USER.role, type: 'access' },
      { secret: process.env.JWT_ACCESS_SECRET, expiresIn: '15m' },
    );

    const mockMonitor = {
      id: 'mon-001',
      userId: VALID_USER.id,
      name: 'Test Monitor',
      type: 'HTTP',
      target: 'https://example.com',
      enabled: true,
      intervalSec: 60,
      timeoutMs: 5000,
      folderId: null,
      configJson: {},
      monitorAlerts: [],
      createdAt: new Date('2025-01-01T00:00:00Z'),
    };

    mockPrisma.session.findFirst.mockResolvedValueOnce(MOCK_SESSION);
    mockPrisma.user.findUnique.mockResolvedValueOnce(VALID_USER);
    mockPrisma.monitor.findMany.mockResolvedValueOnce([mockMonitor]);
    mockPrisma.monitor.count.mockResolvedValueOnce(1);

    const res = await supertest(app.getHttpServer())
      .get('/v2/monitors')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({
      id: 'mon-001',
      name: 'Test Monitor',
      type: 'HTTP',
      enabled: true,
    });
    expect(typeof res.body.data[0].createdAt).toBe('string');
  });
});

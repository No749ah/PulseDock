import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const cookieParser = require('cookie-parser') as (opts?: unknown) => (req: unknown, res: unknown, next: () => void) => void;
import { AppModule } from './app.module';
import { validateEnv } from './common/env';
import { GlobalHttpExceptionFilter } from './common/http-exception.filter';
import { randomUUID } from 'node:crypto';
import { MetricsService } from './common/metrics.service';
import { createLogger } from './common/logger';
import { execSync } from 'child_process';

// Minimal request/response interface for Express middleware
interface AppRequest {
  headers: Record<string, string | string[] | undefined>;
  method: string;
  url: string;
  requestId?: string;
}

interface AppResponse {
  statusCode: number;
  headersSent: boolean;
  setHeader(key: string, value: string): void;
  on(event: string, callback: () => void): void;
  writeHead(...args: unknown[]): unknown;
}

const pkg = require('../package.json');

const logger = createLogger({ service: 'pulsedock-api' });

async function bootstrap() {
  validateEnv();
  
  // Optional: run migrations on startup when explicitly enabled
  if ((process.env.RUN_MIGRATIONS_ON_STARTUP ?? 'false') === 'true') {
    try {
      logger.info('Running database migrations');
      execSync('npx prisma migrate deploy --schema=../../prisma/schema.prisma', {
        stdio: 'inherit',
        env: { ...process.env },
      });
      logger.info('Migrations completed successfully');
    } catch (err) {
      logger.warn('Migrations check failed or already up to date', { error: err });
    }
  }
  const webOrigin = process.env.WEB_URL || 'http://localhost:1234';
  // Build CORS origins from env vars. CORS_ORIGINS accepts comma-separated additional origins.
  // APP_BASE_URL is auto-included if set. No hardcoded deployment-specific URLs.
  const corsOrigins: string[] = [webOrigin];
  if (process.env.APP_BASE_URL && process.env.APP_BASE_URL !== webOrigin) {
    corsOrigins.push(process.env.APP_BASE_URL.replace(/\/$/, ''));
  }
  if (process.env.CORS_ORIGINS) {
    for (const origin of process.env.CORS_ORIGINS.split(',')) {
      const trimmed = origin.trim();
      if (trimmed && !corsOrigins.includes(trimmed)) corsOrigins.push(trimmed);
    }
  }
  const app = await NestFactory.create(AppModule, {
    cors: {
      origin: corsOrigins,
      credentials: true,
    },
  });
  
  // Trust reverse proxy (Cloudflare/nginx/OpenResty) — required for secure cookies
  // and correct client IP resolution behind a proxy.
  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.set('trust proxy', 1);

  // Cookie parser (must be before route handlers)
  app.use(cookieParser());

  // Security middleware
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: [],
      },
    },
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    frameguard: { action: 'deny' },
    noSniff: true,
    // xssFilter removed in helmet v7+ (deprecated browser feature); CSP scriptSrc covers XSS protection
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    permittedCrossDomainPolicies: false,
    crossOriginEmbedderPolicy: false, // disabled: API is consumed cross-origin by the web frontend
    crossOriginOpenerPolicy: { policy: 'same-origin' },
    crossOriginResourcePolicy: { policy: 'cross-origin' }, // allow web frontend to fetch API
  }));
  const metrics = app.get(MetricsService);
  app.use((req: AppRequest, res: AppResponse, next: () => void) => {
    const startedAt = Date.now();
    const incoming = req.headers['x-request-id'];
    const requestId = typeof incoming === 'string' && incoming.trim() ? incoming : randomUUID();
    req.requestId = requestId;
    res.setHeader('x-request-id', requestId);

    // Intercept writeHead to inject X-Response-Time before headers are flushed
    const origWriteHead = res.writeHead;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (res as any).writeHead = function (this: AppResponse, ...args: any[]) {
      if (!this.headersSent) {
        const ms = Date.now() - startedAt;
        this.setHeader('X-Response-Time', `${ms}ms`);
      }
      return origWriteHead.apply(this, args);
    };

    res.on('finish', () => {
      const ms = Date.now() - startedAt;
      metrics.inc('requestsTotal');
      if (res.statusCode >= 400) metrics.inc('errorsTotal');
      if (ms >= 5000) {
        logger.error('slow_request', { requestId, method: req.method, path: req.url, status: res.statusCode, durationMs: ms });
      } else if (ms >= 1000) {
        logger.warn('slow_request', { requestId, method: req.method, path: req.url, status: res.statusCode, durationMs: ms });
      }
      logger.info('http_request', {
        requestId,
        method: req.method,
        path: req.url,
        status: res.statusCode,
        durationMs: ms,
      });
    });

    next();
  });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalFilters(new GlobalHttpExceptionFilter());
  // X-Response-Time + slow request logging handled in middleware above (works for all responses incl. auth errors)

  const swaggerConfig = new DocumentBuilder()
    .setTitle('PulseDock API')
    .setDescription('API for monitoring, version checks, alerts, auth and public status pages.')
    .setVersion(String(pkg.version ?? '0.1.0'))
    .addBearerAuth()
    .build();

  const swaggerDoc = SwaggerModule.createDocument(app, swaggerConfig);

  // Configure Swagger servers so client-facing docs use the proxied API path when behind a reverse proxy.
  // Priority:
  // 1) process.env.SWAGGER_BASE_URL (explicit full URL)
  // 2) process.env.APP_BASE_URL (frontend origin)
  // 3) default to relative '/api' so docs request the proxied path on the current origin
  const explicit = process.env.SWAGGER_BASE_URL || process.env.APP_BASE_URL || '';
  let swaggerServerUrl = '/api';
  if (explicit) {
    const trimmed = explicit.replace(/\/$/, '');
    // if explicit contains a protocol, assume full origin provided
    if (/^https?:\/\//i.test(trimmed)) swaggerServerUrl = `${trimmed}/api`;
    else swaggerServerUrl = `${trimmed}/api`;
  } else if (process.env.NODE_ENV === 'development') {
    const port = Number(process.env.API_PORT ?? 4000);
    swaggerServerUrl = `http://localhost:${port}`;
  }
  // attach servers entry to the swagger document
  swaggerDoc.servers = [{ url: swaggerServerUrl }];

  SwaggerModule.setup('docs', app, swaggerDoc, {
    swaggerOptions: { persistAuthorization: true },
  });

  // Enable NestJS lifecycle hooks (onModuleDestroy, onApplicationShutdown) on SIGTERM/SIGINT.
  // This ensures in-flight checks finish, DB connections close cleanly, and Redis disconnects
  // before the process exits — critical for zero-downtime deploys and container orchestration.
  app.enableShutdownHooks();

  const port = Number(process.env.API_PORT ?? 4000);
  await app.listen(port);
  logger.info('PulseDock API started', {
    port,
    version: pkg.version ?? '0.1.0',
    nodeEnv: process.env.NODE_ENV,
    swaggerServerUrl,
  });
  logger.info('Swagger docs available', { path: `/docs`, url: `http://localhost:${port}/docs` });
}

bootstrap();

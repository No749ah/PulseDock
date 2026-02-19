import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { validateEnv } from './common/env';
import { GlobalHttpExceptionFilter } from './common/http-exception.filter';
import { randomUUID } from 'node:crypto';
import { MetricsService } from './common/metrics.service';
import { execSync } from 'child_process';
const pkg = require('../package.json');

async function bootstrap() {
  validateEnv();
  
  // Optional: run migrations on startup when explicitly enabled
  if ((process.env.RUN_MIGRATIONS_ON_STARTUP ?? 'false') === 'true') {
    try {
      console.log('🔄 Running database migrations...');
      execSync('npx prisma migrate deploy --schema=../../prisma/schema.prisma', {
        stdio: 'inherit',
        env: { ...process.env },
      });
      console.log('✅ Migrations completed');
    } catch {
      console.warn('⚠️  Migrations check failed or already up to date');
    }
  }
  const app = await NestFactory.create(AppModule, { cors: true });
  const metrics = app.get(MetricsService);
  app.use((req: any, res: any, next: () => void) => {
    const startedAt = Date.now();
    const incoming = req.headers['x-request-id'];
    const requestId = typeof incoming === 'string' && incoming.trim() ? incoming : randomUUID();
    req.requestId = requestId;
    res.setHeader('x-request-id', requestId);

    res.on('finish', () => {
      const ms = Date.now() - startedAt;
      metrics.inc('requestsTotal');
      if (res.statusCode >= 400) metrics.inc('errorsTotal');
      console.log(JSON.stringify({
        level: 'info',
        msg: 'http_request',
        requestId,
        method: req.method,
        path: req.url,
        status: res.statusCode,
        durationMs: ms,
      }));
    });

    next();
  });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalFilters(new GlobalHttpExceptionFilter());

  const swaggerConfig = new DocumentBuilder()
    .setTitle('PulseDock API')
    .setDescription('API for monitoring, version checks, alerts, auth and public status pages.')
    .setVersion(String(pkg.version ?? '0.1.0'))
    .addBearerAuth()
    .build();

  const swaggerDoc = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, swaggerDoc, {
    swaggerOptions: { persistAuthorization: true },
  });

  const port = Number(process.env.API_PORT ?? 4000);
  await app.listen(port);
  console.log(`PulseDock API (NestJS) running on http://localhost:${port}`);
  console.log(`Swagger docs available at http://localhost:${port}/docs`);
}

bootstrap();

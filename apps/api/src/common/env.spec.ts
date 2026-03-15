import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock Logger to avoid output during tests
vi.mock('@nestjs/common', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@nestjs/common')>();
  return {
    ...actual,
    Logger: class {
      warn = vi.fn();
      log = vi.fn();
    },
  };
});

// ── helpers ──────────────────────────────────────────────────────────────────

function setEnv(env: Record<string, string | undefined>) {
  Object.entries(env).forEach(([k, v]) => {
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  });
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('validateEnv()', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    // Restore env
    // Remove any keys added during test
    Object.keys(process.env).forEach((k) => {
      if (!(k in originalEnv)) delete process.env[k];
    });
    Object.assign(process.env, originalEnv);
  });

  it('passes with all required dev env vars set', async () => {
    setEnv({
      NODE_ENV: 'development',
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
      JWT_ACCESS_SECRET: 'dev-access-secret-change-in-prod',
      JWT_REFRESH_SECRET: 'dev-refresh-secret-change-in-prod',
    });
    const { validateEnv } = await import('./env');
    expect(() => validateEnv()).not.toThrow();
  });

  it('throws when DATABASE_URL is missing', async () => {
    setEnv({ NODE_ENV: 'development', DATABASE_URL: undefined });
    const { validateEnv } = await import('./env');
    expect(() => validateEnv()).toThrow('Missing required env: DATABASE_URL');
  });

  it('uses dev fallback for JWT_ACCESS_SECRET in development', async () => {
    setEnv({
      NODE_ENV: 'development',
      DATABASE_URL: 'postgresql://x',
      JWT_ACCESS_SECRET: undefined,
      JWT_REFRESH_SECRET: 'dev-refresh-secret-change-in-prod',
    });
    const { validateEnv } = await import('./env');
    validateEnv();
    expect(process.env.JWT_ACCESS_SECRET).toBe('dev-access-secret-change-in-prod');
  });

  it('uses dev fallback for JWT_REFRESH_SECRET in development', async () => {
    setEnv({
      NODE_ENV: 'development',
      DATABASE_URL: 'postgresql://x',
      JWT_ACCESS_SECRET: 'dev-access-secret-change-in-prod',
      JWT_REFRESH_SECRET: undefined,
    });
    const { validateEnv } = await import('./env');
    validateEnv();
    expect(process.env.JWT_REFRESH_SECRET).toBe('dev-refresh-secret-change-in-prod');
  });

  it('throws when JWT_ACCESS_SECRET missing in production', async () => {
    setEnv({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://x',
      JWT_ACCESS_SECRET: undefined,
      JWT_REFRESH_SECRET: 'a-valid-secret-long-enough-here',
    });
    const { validateEnv } = await import('./env');
    expect(() => validateEnv()).toThrow('Missing required env: JWT_ACCESS_SECRET');
  });

  it('throws when JWT_REFRESH_SECRET missing in production', async () => {
    setEnv({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://x',
      JWT_ACCESS_SECRET: 'a-valid-secret-long-enough-here',
      JWT_REFRESH_SECRET: undefined,
    });
    const { validateEnv } = await import('./env');
    expect(() => validateEnv()).toThrow('Missing required env: JWT_REFRESH_SECRET');
  });

  it('throws when JWT secrets too short in production', async () => {
    setEnv({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://x',
      JWT_ACCESS_SECRET: 'short',
      JWT_REFRESH_SECRET: 'alsolongenoughsecrethere12345',
    });
    const { validateEnv } = await import('./env');
    expect(() => validateEnv()).toThrow('JWT secrets must be at least 24 characters');
  });

  it('throws for default admin password in production', async () => {
    setEnv({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://x',
      JWT_ACCESS_SECRET: 'a-valid-access-secret-long-enough',
      JWT_REFRESH_SECRET: 'a-valid-refresh-secret-long-enough',
      DEFAULT_ADMIN_PASSWORD: 'admin123',
      APP_BASE_URL: 'https://example.com',
      MAIL_FROM: 'no-reply@example.com',
      SMTP_HOST: 'smtp.example.com',
      SMTP_PORT: '587',
      SMTP_USER: 'user',
      SMTP_PASS: 'pass',
    });
    const { validateEnv } = await import('./env');
    expect(() => validateEnv()).toThrow('DEFAULT_ADMIN_PASSWORD must be overridden');
  });

  it('passes in production with all required env vars set', async () => {
    setEnv({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/prod',
      JWT_ACCESS_SECRET: 'a-valid-access-secret-long-enough',
      JWT_REFRESH_SECRET: 'a-valid-refresh-secret-long-enough',
      DEFAULT_ADMIN_PASSWORD: 'SuperSecure@Pass1!',
      APP_BASE_URL: 'https://example.com',
      MAIL_FROM: 'no-reply@example.com',
      SMTP_HOST: 'smtp.example.com',
      SMTP_PORT: '587',
      SMTP_USER: 'smtpuser',
      SMTP_PASS: 'smtppass',
    });
    const { validateEnv } = await import('./env');
    expect(() => validateEnv()).not.toThrow();
  });

  it('passes in staging with all required env vars set', async () => {
    setEnv({
      NODE_ENV: 'staging',
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/staging',
      JWT_ACCESS_SECRET: 'a-valid-access-secret-long-enough',
      JWT_REFRESH_SECRET: 'a-valid-refresh-secret-long-enough',
      DEFAULT_ADMIN_PASSWORD: 'SuperSecure@Pass1!',
      APP_BASE_URL: 'https://staging.example.com',
      MAIL_FROM: 'no-reply@staging.example.com',
      SMTP_HOST: 'smtp.example.com',
      SMTP_PORT: '465',
      SMTP_USER: 'stageuser',
      SMTP_PASS: 'stagepass',
    });
    const { validateEnv } = await import('./env');
    expect(() => validateEnv()).not.toThrow();
  });

  it('throws in production when APP_BASE_URL is missing', async () => {
    setEnv({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://x',
      JWT_ACCESS_SECRET: 'a-valid-access-secret-long-enough',
      JWT_REFRESH_SECRET: 'a-valid-refresh-secret-long-enough',
      DEFAULT_ADMIN_PASSWORD: 'SuperSecure@Pass1!',
      APP_BASE_URL: undefined,
    });
    const { validateEnv } = await import('./env');
    expect(() => validateEnv()).toThrow('Missing required env: APP_BASE_URL');
  });
});

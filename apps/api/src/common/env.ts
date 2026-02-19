import { Logger } from '@nestjs/common';

const log = new Logger('EnvValidation');

function required(name: string) {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

export function validateEnv() {
  const prodLike = process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging';

  required('DATABASE_URL');

  if (!process.env.JWT_ACCESS_SECRET) {
    if (prodLike) throw new Error('Missing required env: JWT_ACCESS_SECRET');
    process.env.JWT_ACCESS_SECRET = 'dev-access-secret-change-in-prod';
    log.warn('JWT_ACCESS_SECRET missing, using development fallback');
  }
  if (!process.env.JWT_REFRESH_SECRET) {
    if (prodLike) throw new Error('Missing required env: JWT_REFRESH_SECRET');
    process.env.JWT_REFRESH_SECRET = 'dev-refresh-secret-change-in-prod';
    log.warn('JWT_REFRESH_SECRET missing, using development fallback');
  }

  const accessSecret = process.env.JWT_ACCESS_SECRET ?? '';
  const refreshSecret = process.env.JWT_REFRESH_SECRET ?? '';

  if (prodLike && (accessSecret.length < 24 || refreshSecret.length < 24)) {
    throw new Error('JWT secrets must be at least 24 characters in production/staging');
  }

  if (prodLike && (process.env.DEFAULT_ADMIN_PASSWORD ?? 'admin123') === 'admin123') {
    throw new Error('DEFAULT_ADMIN_PASSWORD must be overridden in production/staging');
  }

  if (prodLike) {
    required('APP_BASE_URL');
    required('MAIL_FROM');
    required('SMTP_HOST');
    required('SMTP_PORT');
    required('SMTP_USER');
    required('SMTP_PASS');
  }

  log.log('Environment validation passed');
}

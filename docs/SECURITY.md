# Security — PulseDock

PulseDock is built with security as a first-class concern. This document covers the security measures in place and best practices for deployment.

## Authentication & Sessions

### JWT Tokens
- Access tokens: 15-minute expiry (configurable via `JWT_EXPIRES_IN`)
- Refresh tokens: 7-day expiry (configurable via `REFRESH_TOKEN_EXPIRES_IN`)
- Tokens are signed with RS256 or HS256 depending on `JWT_SECRET` config
- Refresh tokens are stored hashed in the database and rotated on use

### Account Security
- **Account lockout**: 5 consecutive failed login attempts locks the account for 15 minutes
- **Email verification**: New users must verify their email before accessing the app
- **Password requirements**: Minimum 12 characters, must include uppercase, lowercase, digit, and special character
- **Password hashing**: bcrypt with cost factor 12
- **Secure reset flow**: Password reset tokens are single-use, expire in 15 minutes, and are invalidated after use

### 2FA / TOTP
- Time-based one-time passwords (TOTP) via `otplib`
- QR code setup flow via `/account` page
- Recovery codes provided at setup (stored hashed)
- Backup codes: 10 single-use codes per account

### Session Management
- Sessions tracked with IP address and user agent
- Active sessions visible in account settings
- New login from unknown IP/device triggers email notification
- Sessions can be revoked individually or all at once

## API Security

### Authentication Methods
- **Bearer JWT**: `Authorization: Bearer <token>` — for user sessions
- **API Keys**: `X-API-Key: <key>` — for programmatic access
  - Multiple keys per user, scoped permissions
  - Keys stored hashed, displayed once on creation
  - Can be revoked at any time

### Rate Limiting
| Endpoint | Limit |
|----------|-------|
| Auth routes (`/auth/login`, `/auth/register`, `/auth/forgot-password`) | 5 req/min per IP |
| General API | 120 req/min per IP |
| Public status page endpoints | 60 req/min per IP |

### CSRF Protection
- Double-submit cookie pattern
- `GET /v1/auth/csrf` issues a non-httpOnly cookie and returns the token
- All state-changing requests require `X-CSRF-Token` header matching the cookie
- API key and Bearer token requests are exempt
- Token comparison uses `crypto.timingSafeEqual` to prevent timing attacks

### Input Validation
- All request bodies validated with class-validator DTOs
- Strict type checking — no `any` types in production code
- SQL injection prevention via Prisma parameterized queries
- XSS prevention: all user input sanitized before storage

## HTTP Security Headers

Configured via Helmet.js:

| Header | Value |
|--------|-------|
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` |
| `X-Frame-Options` | `DENY` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `X-XSS-Protection` | `0` (disabled — modern browsers handle this natively) |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` |
| `Content-Security-Policy` | Configured per environment (see below) |

### Content Security Policy

Development CSP is permissive. Production CSP (recommended):

```
default-src 'self';
script-src 'self' 'nonce-{nonce}';
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
font-src 'self' https://fonts.gstatic.com;
img-src 'self' data: https://cdn.simpleicons.org https://img.shields.io;
connect-src 'self' wss:;
frame-src 'none';
object-src 'none';
base-uri 'self';
```

## CORS

- Configured via `CORS_ORIGIN` environment variable
- Default: only `APP_URL` is allowed
- Credentials: `true` (required for cookies)
- Methods: GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS

## Data Security

### Sensitive Data
- Passwords: bcrypt hashed, never stored plaintext
- API keys: bcrypt hashed, only shown once
- TOTP secrets: encrypted with AES-256-GCM using `TOTP_ENCRYPTION_KEY`
- Alert channel credentials (webhook URLs, tokens): stored encrypted
- Password reset tokens: SHA-256 hashed before storage

### Database
- All queries use Prisma's parameterized query builder
- No raw SQL unless absolutely necessary, and always with parameter binding
- Database connection requires SSL in production (`?sslmode=require`)
- Regular backups recommended (see [DEPLOYMENT.md](./DEPLOYMENT.md))

### Environment Variables
Never commit secrets to git. Required secrets:
```
JWT_SECRET=<64+ random chars>
REFRESH_TOKEN_SECRET=<64+ random chars>
DATABASE_URL=postgresql://user:password@host:5432/db?sslmode=require
```

See [.env.example](../.env.example) for full reference.

## Audit Logging

Every sensitive action is logged to the `AuditLog` table:

| Action | Logged |
|--------|--------|
| Login (success/failure) | ✅ |
| Logout | ✅ |
| Password change | ✅ |
| Email change | ✅ |
| 2FA enable/disable | ✅ |
| Account lockout | ✅ |
| API key create/revoke | ✅ |
| Session revoke | ✅ |

Export audit logs from `/account` → Audit Log → Export (CSV or JSON).

## Vulnerability Disclosure

Found a security issue? Please report it **privately** via:
- GitHub Security Advisories: https://github.com/No749ah/PulseDock/security/advisories
- Email: see repository contact info

Do **not** open a public GitHub issue for security vulnerabilities.

## Dependency Security

```bash
# Check for known vulnerabilities
npm audit

# Update dependencies
npm update

# Check for outdated packages
npm outdated
```

Current known vulnerabilities: 10 moderate (transitive — `file-type` via `@nestjs/common`, `lodash` via `@prisma/dev`). No high or critical. Tracking upstream fixes.

## Security Checklist for Self-Hosted Deployments

- [ ] Set strong `JWT_SECRET` (64+ random characters)
- [ ] Use HTTPS with valid TLS certificate
- [ ] Configure `CORS_ORIGIN` to your domain only
- [ ] Enable `DATABASE_URL` with SSL (`?sslmode=require`)
- [ ] Set `NODE_ENV=production`
- [ ] Use a reverse proxy (nginx/Caddy) — never expose Node.js directly
- [ ] Configure firewall — only expose ports 80/443
- [ ] Enable email verification (`SMTP_*` configured)
- [ ] Regular database backups
- [ ] Monitor audit logs for suspicious activity
- [ ] Keep PulseDock updated (check GitHub releases)
- [ ] Rotate `JWT_SECRET` periodically (invalidates all sessions)

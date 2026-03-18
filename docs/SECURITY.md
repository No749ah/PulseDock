# Security — PulseDock

## Authentication

- JWT access tokens (15 min expiry) stored in httpOnly cookies
- Refresh tokens (30 days) in httpOnly cookies
- CSRF protection via double-submit cookie pattern
- `trust proxy` enabled — secure cookies work behind reverse proxies

## Security Features

| Feature | Status |
|---------|--------|
| 2FA / TOTP | ✅ Available |
| CSRF Protection | ✅ X-CSRF-Token header |
| Account Lockout | ✅ 5 failed attempts → 15 min lockout |
| Email Verification | ✅ Required on registration |
| Password Strength | ✅ 12+ chars, complexity enforced |
| Rate Limiting | ✅ 5 req/min on auth endpoints |
| Audit Log | ✅ All actions logged |
| Session Management | ✅ View/revoke active sessions |
| Security Headers | ✅ Helmet (CSP, HSTS, X-Frame, etc.) |
| Input Sanitization | ✅ DOMPurify on all stored content |

## Secure Deployment

- Run behind a reverse proxy (nginx/Caddy)
- Ensure `X-Forwarded-Proto: https` is forwarded
- Use strong JWT secrets (min 32 chars)
- Enable HTTPS on your domain
- Set `NODE_ENV=production`

## Environment Variables

```env
JWT_ACCESS_SECRET=<strong-random-32+-chars>
JWT_REFRESH_SECRET=<different-strong-random-32+-chars>
NODE_ENV=production
```

## Reporting Vulnerabilities

Please report security issues privately via GitHub Security Advisories.

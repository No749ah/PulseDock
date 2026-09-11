import { describe, it, expect } from 'vitest';

// ── Pure logic helpers mirrored from PasswordGate ─────────────────────

function isSubmitDisabled(loading: boolean, password: string): boolean {
  return loading || !password;
}

function getButtonLabel(loading: boolean): string {
  return loading ? 'Checking...' : 'Unlock';
}

function buildAuthUrl(apiBase: string, slug: string, password: string): string {
  return `${apiBase}/v1/public/status/${slug}?password=${encodeURIComponent(password)}`;
}

function buildRedirectUrl(pathname: string, password: string): string {
  return `${pathname}?password=${encodeURIComponent(password)}`;
}

function parseApiError(data: { message?: string; error?: string } | null): string {
  return data?.message || data?.error || 'Incorrect password';
}

// ── Tests ──────────────────────────────────────────────────────────────

describe('isSubmitDisabled', () => {
  it('returns true when loading=true and password non-empty', () => {
    expect(isSubmitDisabled(true, 'secret')).toBe(true);
  });

  it('returns true when password is empty and loading=false', () => {
    expect(isSubmitDisabled(false, '')).toBe(true);
  });

  it('returns true when both loading and empty password', () => {
    expect(isSubmitDisabled(true, '')).toBe(true);
  });

  it('returns false when not loading and password is non-empty', () => {
    expect(isSubmitDisabled(false, 'mypassword')).toBe(false);
  });

  it('returns false for a single char password', () => {
    expect(isSubmitDisabled(false, 'x')).toBe(false);
  });
});

describe('getButtonLabel', () => {
  it('returns "Checking..." when loading', () => {
    expect(getButtonLabel(true)).toBe('Checking...');
  });

  it('returns "Unlock" when not loading', () => {
    expect(getButtonLabel(false)).toBe('Unlock');
  });
});

describe('buildAuthUrl', () => {
  it('builds a correct URL', () => {
    expect(buildAuthUrl('https://api.example.com', 'my-status', 'secret123')).toBe(
      'https://api.example.com/v1/public/status/my-status?password=secret123',
    );
  });

  it('encodes spaces in password', () => {
    const url = buildAuthUrl('https://api.example.com', 'page', 'my password');
    expect(url).toContain('password=my%20password');
  });

  it('encodes & in password', () => {
    const url = buildAuthUrl('https://api.example.com', 'page', 'p&w');
    expect(url).toContain('password=p%26w');
  });

  it('encodes special chars comprehensively', () => {
    const url = buildAuthUrl('https://api.example.com', 'page', 'p@$$w0rd!');
    expect(url).toBe(
      `https://api.example.com/v1/public/status/page?password=${encodeURIComponent('p@$$w0rd!')}`,
    );
  });

  it('uses /api as base when provided', () => {
    expect(buildAuthUrl('/api', 'slug', 'pw')).toBe('/api/v1/public/status/slug?password=pw');
  });
});

describe('buildRedirectUrl', () => {
  it('builds correct redirect URL', () => {
    expect(buildRedirectUrl('/status/my-page', 'secret')).toBe(
      '/status/my-page?password=secret',
    );
  });

  it('encodes spaces', () => {
    expect(buildRedirectUrl('/status/page', 'my pass')).toBe(
      '/status/page?password=my%20pass',
    );
  });

  it('encodes ampersand', () => {
    expect(buildRedirectUrl('/status/page', 'a&b')).toBe(
      '/status/page?password=a%26b',
    );
  });

  it('encodes equals sign', () => {
    expect(buildRedirectUrl('/status/page', 'a=b')).toBe(
      `/status/page?password=${encodeURIComponent('a=b')}`,
    );
  });
});

describe('parseApiError', () => {
  it('prefers message over error', () => {
    expect(parseApiError({ message: 'Wrong password', error: 'Unauthorized' })).toBe(
      'Wrong password',
    );
  });

  it('falls back to error when no message', () => {
    expect(parseApiError({ error: 'Unauthorized' })).toBe('Unauthorized');
  });

  it('falls back to "Incorrect password" when both are missing', () => {
    expect(parseApiError({})).toBe('Incorrect password');
  });

  it('falls back to "Incorrect password" for null data', () => {
    expect(parseApiError(null)).toBe('Incorrect password');
  });

  it('falls back to "Incorrect password" when message is empty string', () => {
    expect(parseApiError({ message: '', error: '' })).toBe('Incorrect password');
  });

  it('falls back to error when message is undefined', () => {
    expect(parseApiError({ message: undefined, error: 'Bad auth' })).toBe('Bad auth');
  });
});

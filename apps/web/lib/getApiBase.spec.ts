import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getApiBase } from './getApiBase';

describe('getApiBase', () => {
  const originalWindow = global.window;

  afterEach(() => {
    // Restore
    if (originalWindow === undefined) {
      // @ts-expect-error -- restore server environment
      delete global.window;
    }
    vi.restoreAllMocks();
  });

  it('returns /api on same origin in browser', () => {
    // jsdom provides window with localhost origin
    expect(getApiBase()).toBe(`${window.location.origin}/api`);
  });

  it('prefers runtime override when set', () => {
    window.__NEXT_PUBLIC_API_BASE_URL_OVERRIDE__ = 'https://custom-api.example.com';
    expect(getApiBase()).toBe('https://custom-api.example.com');
    delete window.__NEXT_PUBLIC_API_BASE_URL_OVERRIDE__;
  });

  it('returns env var on server side when window is undefined', () => {
    const win = global.window;
    // @ts-expect-error -- simulating server environment
    delete global.window;
    process.env.NEXT_PUBLIC_API_BASE_URL = 'https://api.prod.com';
    expect(getApiBase()).toBe('https://api.prod.com');
    delete process.env.NEXT_PUBLIC_API_BASE_URL;
    global.window = win;
  });

  it('falls back to localhost:4321 on server without env var', () => {
    const win = global.window;
    // @ts-expect-error -- simulating server environment
    delete global.window;
    delete process.env.NEXT_PUBLIC_API_BASE_URL;
    expect(getApiBase()).toBe('http://localhost:4321');
    global.window = win;
  });
});

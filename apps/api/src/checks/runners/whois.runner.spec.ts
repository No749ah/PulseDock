import { describe, it, expect, vi, beforeEach } from 'vitest';
import type * as net from 'node:net';

// ─── ESM-safe mock for node:net ───────────────────────────────────────────────
// vi.spyOn cannot patch ESM namespace exports (read-only).
// Use vi.hoisted + vi.mock factory instead.

const mockCreateConnection = vi.hoisted(() => vi.fn<typeof net.createConnection>());

vi.mock('node:net', () => ({
  createConnection: mockCreateConnection,
}));

// Import AFTER mock is established
import { runWhoisCheck, parseWhoisExpiry } from './whois.runner';

// ─── parseWhoisExpiry ─────────────────────────────────────────────────────────

describe('parseWhoisExpiry()', () => {
  it('parses ISO 8601 registry expiry date', () => {
    const raw = `
Domain Name: EXAMPLE.COM
Registry Expiry Date: 2028-08-13T04:00:00Z
Registrar: Example Registrar
`;
    const date = parseWhoisExpiry(raw);
    expect(date).not.toBeNull();
    expect(date!.getFullYear()).toBe(2028);
    expect(date!.getMonth()).toBe(7); // 0-indexed August
    expect(date!.getDate()).toBe(13);
  });

  it('parses "Expiry Date:" key', () => {
    const raw = `
Domain name: example.co.uk
Expiry Date: 2026-12-01T00:00:00.0Z
`;
    const date = parseWhoisExpiry(raw);
    expect(date).not.toBeNull();
    expect(date!.getFullYear()).toBe(2026);
  });

  it('parses "Expiration Date:" key', () => {
    const raw = `
Domain Name: EXAMPLE.NET
Expiration Date: 2027-03-15T12:30:00Z
`;
    const date = parseWhoisExpiry(raw);
    expect(date).not.toBeNull();
    expect(date!.getFullYear()).toBe(2027);
  });

  it('parses dot-separated date format "YYYY.MM.DD"', () => {
    const raw = `
domain:       EXAMPLE.DE
paid-till:    2027.06.30 21:59:59
`;
    const date = parseWhoisExpiry(raw);
    expect(date).not.toBeNull();
    expect(date!.getFullYear()).toBe(2027);
    expect(date!.getMonth()).toBe(5); // June
  });

  it('parses "Renewal Date:" key', () => {
    const raw = `
Renewal Date: 2029-01-01T00:00:00Z
`;
    const date = parseWhoisExpiry(raw);
    expect(date).not.toBeNull();
    expect(date!.getFullYear()).toBe(2029);
  });

  it('returns null when no expiry date is found', () => {
    const raw = `
Domain Name: EXAMPLE.COM
Registrar: Example Registrar
Status: clientTransferProhibited
`;
    expect(parseWhoisExpiry(raw)).toBeNull();
  });

  it('returns null for empty input', () => {
    expect(parseWhoisExpiry('')).toBeNull();
  });
});

// ─── Socket factory ───────────────────────────────────────────────────────────

/**
 * Builds a minimal fake socket that emits data+end asynchronously,
 * or optionally emits an error instead.
 */
const makeSocket = (response: string, errorToEmit?: Error) => {
  type Listener = (...args: unknown[]) => void;
  const listeners: Record<string, Listener[]> = {};

  const emit = (event: string, ...args: unknown[]) => {
    listeners[event]?.forEach((fn) => fn(...args));
  };

  const socket = {
    setTimeout: vi.fn(),
    destroy: vi.fn(),
    write: vi.fn().mockImplementation(() => {
      if (!errorToEmit) {
        Promise.resolve().then(() => {
          emit('data', Buffer.from(response));
          emit('end');
        });
      }
    }),
    on: vi.fn().mockImplementation((event: string, cb: Listener) => {
      listeners[event] ??= [];
      listeners[event].push(cb);
      return socket;
    }),
    once: vi.fn().mockImplementation((event: string, cb: Listener) => {
      listeners[event] ??= [];
      listeners[event].push(cb);
      if (event === 'connect') {
        Promise.resolve().then(() => {
          if (errorToEmit) {
            emit('error', errorToEmit);
          } else {
            cb();
          }
        });
      }
      return socket;
    }),
  };

  return socket as unknown as net.Socket;
};

// ─── runWhoisCheck ────────────────────────────────────────────────────────────

describe('runWhoisCheck()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const futureDate = (daysFromNow: number) => {
    const d = new Date();
    d.setDate(d.getDate() + daysFromNow);
    return d.toISOString();
  };

  it('returns green when domain expires far in future (> warnDays)', async () => {
    const raw = `Domain Name: EXAMPLE.COM\nRegistry Expiry Date: ${futureDate(90)}\n`;
    mockCreateConnection.mockReturnValue(makeSocket(raw));

    const result = await runWhoisCheck('example.com', { warnDays: 30, criticalDays: 7 }, 5000);

    expect(result.ok).toBe(true);
    expect(result.level).toBe('green');
    expect(result.message).toMatch(/expires in \d+d/);
  });

  it('returns yellow when domain expires within warnDays (but > criticalDays)', async () => {
    const raw = `Domain Name: EXAMPLE.COM\nRegistry Expiry Date: ${futureDate(20)}\n`;
    mockCreateConnection.mockReturnValue(makeSocket(raw));

    const result = await runWhoisCheck('example.com', { warnDays: 30, criticalDays: 7 }, 5000);

    expect(result.ok).toBe(true);
    expect(result.level).toBe('yellow');
    expect(result.message).toMatch(/warning/);
  });

  it('returns red when domain expires within criticalDays', async () => {
    const raw = `Domain Name: EXAMPLE.COM\nRegistry Expiry Date: ${futureDate(3)}\n`;
    mockCreateConnection.mockReturnValue(makeSocket(raw));

    const result = await runWhoisCheck('example.com', { warnDays: 30, criticalDays: 7 }, 5000);

    expect(result.ok).toBe(false);
    expect(result.level).toBe('red');
    expect(result.message).toMatch(/CRITICAL/);
  });

  it('returns red when domain is already expired', async () => {
    const raw = `Domain Name: EXAMPLE.COM\nRegistry Expiry Date: ${futureDate(-5)}\n`;
    mockCreateConnection.mockReturnValue(makeSocket(raw));

    const result = await runWhoisCheck('example.com', {}, 5000);

    expect(result.ok).toBe(false);
    expect(result.level).toBe('red');
    expect(result.message).toMatch(/expired/);
  });

  it('returns red when WHOIS says domain not found', async () => {
    const raw = 'No match for "NOTEXIST.COM".';
    mockCreateConnection.mockReturnValue(makeSocket(raw));

    const result = await runWhoisCheck('notexist.com', {}, 5000);

    expect(result.ok).toBe(false);
    expect(result.level).toBe('red');
    expect(result.statusCode).toBe(404);
    expect(result.message).toMatch(/not found/i);
  });

  it('returns red on TCP connection error', async () => {
    mockCreateConnection.mockReturnValue(makeSocket('', new Error('connect ECONNREFUSED')));

    const result = await runWhoisCheck('example.com', {}, 5000);

    expect(result.ok).toBe(false);
    expect(result.level).toBe('red');
    expect(result.message).toMatch(/WHOIS query failed/i);
  });

  it('returns yellow when WHOIS responds but has no expiry date', async () => {
    const raw = [
      'Domain Name: EXAMPLE.COM',
      'Registrar: Some Registrar, LLC',
      'Status: clientTransferProhibited',
      'DNSSEC: unsigned',
    ].join('\n');
    mockCreateConnection.mockReturnValue(makeSocket(raw));

    const result = await runWhoisCheck('example.com', {}, 5000);

    expect(result.ok).toBe(true);
    expect(result.level).toBe('yellow');
    expect(result.message).toMatch(/expiry date not published/i);
  });

  it('strips https:// and www from the target domain', async () => {
    const raw = `Domain Name: EXAMPLE.COM\nRegistry Expiry Date: ${futureDate(90)}\n`;
    mockCreateConnection.mockReturnValue(makeSocket(raw));

    const result = await runWhoisCheck('https://www.example.com/some/path', {}, 5000);

    expect(result.ok).toBe(true);
    expect(result.message).toMatch(/example\.com/);
  });

  it('returns red for invalid/empty domain', async () => {
    const result = await runWhoisCheck('notadomain', {}, 5000);

    expect(result.ok).toBe(false);
    expect(result.level).toBe('red');
    expect(result.statusCode).toBe(400);
  });

  it('uses default warnDays=30 and criticalDays=7 when config omitted', async () => {
    const raw = `Domain Name: EXAMPLE.COM\nRegistry Expiry Date: ${futureDate(20)}\n`;
    mockCreateConnection.mockReturnValue(makeSocket(raw));

    const result = await runWhoisCheck('example.com');

    // 20 days < 30 days default warn threshold → yellow
    expect(result.level).toBe('yellow');
  });
});

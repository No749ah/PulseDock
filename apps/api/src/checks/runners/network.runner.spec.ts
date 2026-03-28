import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Socket } from 'node:net';
import type { TLSSocket } from 'node:tls';

// ── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('node:net');
vi.mock('node:tls');
vi.mock('node:dns/promises');
vi.mock('node:child_process');

import * as net from 'node:net';
import * as tls from 'node:tls';
import * as dns from 'node:dns/promises';
import { execFile } from 'node:child_process';

import {
  normalizeSslHost,
  runTcpCheck,
  runSslCheck,
  runDnsCheck,
  runPingCheck,
  runSmtpCheck,
  runFtpCheck,
  runImapCheck,
  runPop3Check,
} from './network.runner';

// ── normalizeSslHost ─────────────────────────────────────────────────────────

describe('normalizeSslHost', () => {
  it('extracts hostname from bare domain', () => {
    expect(normalizeSslHost('example.com')).toBe('example.com');
  });

  it('extracts hostname from https:// URL', () => {
    expect(normalizeSslHost('https://example.com')).toBe('example.com');
  });

  it('strips path from https:// URL', () => {
    expect(normalizeSslHost('https://example.com/path/to/page')).toBe('example.com');
  });

  it('strips port from https:// URL', () => {
    expect(normalizeSslHost('https://example.com:8443')).toBe('example.com');
  });

  it('handles http:// as valid input', () => {
    expect(normalizeSslHost('http://example.com')).toBe('example.com');
  });

  it('handles subdomain URLs', () => {
    expect(normalizeSslHost('https://api.example.com/v1/health')).toBe('api.example.com');
  });

  it('returns null for empty string', () => {
    expect(normalizeSslHost('')).toBeNull();
  });

  it('returns null for whitespace', () => {
    expect(normalizeSslHost('   ')).toBeNull();
  });
});

// ── runTcpCheck ──────────────────────────────────────────────────────────────

describe('runTcpCheck', () => {
  afterEach(() => { vi.clearAllMocks(); });

  it('returns red for empty target', async () => {
    const result = await runTcpCheck('');
    expect(result.ok).toBe(false);
    expect(result.level).toBe('red');
    expect(result.statusCode).toBe(400);
  });

  it('returns red for target without port', async () => {
    const result = await runTcpCheck('example.com');
    expect(result.ok).toBe(false);
    expect(result.level).toBe('red');
    expect(result.statusCode).toBe(400);
  });

  it('returns red for port out of range (0)', async () => {
    const result = await runTcpCheck('example.com:0');
    expect(result.ok).toBe(false);
    expect(result.level).toBe('red');
    expect(result.statusCode).toBe(400);
  });

  it('returns red for port out of range (65536)', async () => {
    const result = await runTcpCheck('example.com:65536');
    expect(result.ok).toBe(false);
    expect(result.level).toBe('red');
    expect(result.statusCode).toBe(400);
  });

  it('returns red for non-numeric port', async () => {
    const result = await runTcpCheck('example.com:abc');
    expect(result.ok).toBe(false);
    expect(result.level).toBe('red');
    expect(result.statusCode).toBe(400);
  });

  it('succeeds on TCP connect', async () => {
    const mockSocket = {
      setTimeout: vi.fn(),
      destroy: vi.fn(),
      once: vi.fn((event: string, cb: () => void) => {
        if (event === 'connect') setTimeout(cb, 0);
      }),
    } as unknown as Socket;
    vi.mocked(net.createConnection).mockReturnValue(mockSocket as ReturnType<typeof net.createConnection>);

    const result = await runTcpCheck('db.example.com:5432');
    expect(result.ok).toBe(true);
    expect(result.level).toBe('green');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.message).toContain('db.example.com:5432');
  });

  it('returns red on TCP error', async () => {
    const mockSocket = {
      setTimeout: vi.fn(),
      destroy: vi.fn(),
      once: vi.fn((event: string, cb: (err?: Error) => void) => {
        if (event === 'error') setTimeout(() => cb(new Error('ECONNREFUSED')), 0);
      }),
    } as unknown as Socket;
    vi.mocked(net.createConnection).mockReturnValue(mockSocket as ReturnType<typeof net.createConnection>);

    const result = await runTcpCheck('db.example.com:5432');
    expect(result.ok).toBe(false);
    expect(result.level).toBe('red');
    expect(result.message).toContain('ECONNREFUSED');
  });

  it('returns red on TCP timeout', async () => {
    const mockSocket = {
      setTimeout: vi.fn(),
      destroy: vi.fn(),
      once: vi.fn((event: string, cb: () => void) => {
        if (event === 'timeout') setTimeout(cb, 0);
      }),
    } as unknown as Socket;
    vi.mocked(net.createConnection).mockReturnValue(mockSocket as ReturnType<typeof net.createConnection>);

    const result = await runTcpCheck('slow.host:80');
    expect(result.ok).toBe(false);
    expect(result.level).toBe('red');
    expect(result.message).toContain('timeout');
  });
});

// ── runSslCheck ──────────────────────────────────────────────────────────────

describe('runSslCheck', () => {
  afterEach(() => { vi.clearAllMocks(); });

  it('returns red for empty target', async () => {
    const result = await runSslCheck('');
    expect(result.ok).toBe(false);
    expect(result.level).toBe('red');
    expect(result.statusCode).toBe(400);
  });

  it('returns green when cert has >30 days remaining', async () => {
    const futureDate = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000); // 60 days
    const mockSocket = {
      end: vi.fn(),
      destroy: vi.fn(),
      once: vi.fn((event: string, cb: () => void) => {
        if (event !== 'connect' && event !== 'error' && event !== 'timeout') return;
        if (event === 'connect') return; // handled by connect callback below
      }),
      getPeerCertificate: vi.fn().mockReturnValue({ valid_to: futureDate.toUTCString() }),
    } as unknown as TLSSocket;

    vi.mocked(tls.connect).mockImplementation(((_opts: unknown, cb?: () => void) => {
      if (cb) setTimeout(cb, 0);
      return mockSocket as ReturnType<typeof tls.connect>;
    }) as any);

    const result = await runSslCheck('example.com');
    expect(result.ok).toBe(true);
    expect(result.level).toBe('green');
    expect(result.message).toContain('days');
  });

  it('returns yellow when cert has 10-30 days remaining', async () => {
    const soonDate = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000); // 20 days
    const mockSocket = {
      end: vi.fn(),
      destroy: vi.fn(),
      once: vi.fn(),
      getPeerCertificate: vi.fn().mockReturnValue({ valid_to: soonDate.toUTCString() }),
    } as unknown as TLSSocket;

    vi.mocked(tls.connect).mockImplementation(((_opts: unknown, cb?: () => void) => {
      if (cb) setTimeout(cb, 0);
      return mockSocket as ReturnType<typeof tls.connect>;
    }) as any);

    const result = await runSslCheck('example.com');
    expect(result.ok).toBe(true);
    expect(result.level).toBe('yellow');
  });

  it('returns red level when cert has <10 days remaining (ok=true, critical warning)', async () => {
    const criticalDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000); // 5 days
    const mockSocket = {
      end: vi.fn(),
      destroy: vi.fn(),
      once: vi.fn(),
      getPeerCertificate: vi.fn().mockReturnValue({ valid_to: criticalDate.toUTCString() }),
    } as unknown as TLSSocket;

    vi.mocked(tls.connect).mockImplementation(((_opts: unknown, cb?: () => void) => {
      if (cb) setTimeout(cb, 0);
      return mockSocket as ReturnType<typeof tls.connect>;
    }) as any);

    const result = await runSslCheck('example.com');
    // ok=true (cert not yet expired), but level=red (critically close to expiry)
    expect(result.ok).toBe(true);
    expect(result.level).toBe('red');
    expect(result.message).toContain('days');
  });

  it('returns red for expired cert', async () => {
    const pastDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000); // 5 days ago
    const mockSocket = {
      end: vi.fn(),
      destroy: vi.fn(),
      once: vi.fn(),
      getPeerCertificate: vi.fn().mockReturnValue({ valid_to: pastDate.toUTCString() }),
    } as unknown as TLSSocket;

    vi.mocked(tls.connect).mockImplementation(((_opts: unknown, cb?: () => void) => {
      if (cb) setTimeout(cb, 0);
      return mockSocket as ReturnType<typeof tls.connect>;
    }) as any);

    const result = await runSslCheck('example.com');
    expect(result.ok).toBe(false);
    expect(result.level).toBe('red');
    expect(result.message).toContain('EXPIRED');
  });

  it('returns red when cert metadata is unavailable', async () => {
    const mockSocket = {
      end: vi.fn(),
      destroy: vi.fn(),
      once: vi.fn(),
      getPeerCertificate: vi.fn().mockReturnValue({ valid_to: undefined }),
    } as unknown as TLSSocket;

    vi.mocked(tls.connect).mockImplementation(((_opts: unknown, cb?: () => void) => {
      if (cb) setTimeout(cb, 0);
      return mockSocket as ReturnType<typeof tls.connect>;
    }) as any);

    const result = await runSslCheck('example.com');
    expect(result.ok).toBe(false);
    expect(result.message).toContain('unavailable');
  });

  it('returns red on TLS error', async () => {
    const mockSocket = {
      end: vi.fn(),
      destroy: vi.fn(),
      once: vi.fn((event: string, cb: (err?: Error) => void) => {
        if (event === 'error') setTimeout(() => cb(new Error('CERT_INVALID')), 0);
      }),
      getPeerCertificate: vi.fn().mockReturnValue({}),
    } as unknown as TLSSocket;

    vi.mocked(tls.connect).mockImplementation(() => mockSocket as ReturnType<typeof tls.connect>);

    const result = await runSslCheck('bad.example.com');
    expect(result.ok).toBe(false);
    expect(result.level).toBe('red');
    expect(result.message).toContain('CERT_INVALID');
  });

  it('accepts https:// prefixed target', async () => {
    const futureDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
    const mockSocket = {
      end: vi.fn(),
      destroy: vi.fn(),
      once: vi.fn(),
      getPeerCertificate: vi.fn().mockReturnValue({ valid_to: futureDate.toUTCString() }),
    } as unknown as TLSSocket;

    vi.mocked(tls.connect).mockImplementation(((_opts: unknown, cb?: () => void) => {
      if (cb) setTimeout(cb, 0);
      return mockSocket as ReturnType<typeof tls.connect>;
    }) as any);

    const result = await runSslCheck('https://example.com/health');
    expect(result.ok).toBe(true);
  });
});

// ── runDnsCheck ──────────────────────────────────────────────────────────────

describe('runDnsCheck', () => {
  afterEach(() => { vi.clearAllMocks(); });

  it('returns red for empty target', async () => {
    const result = await runDnsCheck('', {});
    expect(result.ok).toBe(false);
    expect(result.level).toBe('red');
    expect(result.statusCode).toBe(400);
    expect(result.message).toContain('hostname');
  });

  it('resolves A record successfully', async () => {
    vi.mocked(dns.resolve4).mockResolvedValue(['1.2.3.4']);

    const result = await runDnsCheck('example.com', { recordType: 'A' });
    expect(result.ok).toBe(true);
    expect(result.level).toBe('green');
    expect(result.message).toContain('A resolved');
    expect(result.message).toContain('1.2.3.4');
  });

  it('resolves AAAA record successfully', async () => {
    vi.mocked(dns.resolve6).mockResolvedValue(['::1']);

    const result = await runDnsCheck('example.com', { recordType: 'AAAA' });
    expect(result.ok).toBe(true);
    expect(result.message).toContain('AAAA resolved');
  });

  it('resolves MX record successfully', async () => {
    vi.mocked(dns.resolveMx).mockResolvedValue([{ exchange: 'mail.example.com', priority: 10 }]);

    const result = await runDnsCheck('example.com', { recordType: 'MX' });
    expect(result.ok).toBe(true);
    expect(result.message).toContain('MX resolved');
    expect(result.message).toContain('mail.example.com');
  });

  it('resolves TXT record successfully', async () => {
    vi.mocked(dns.resolveTxt).mockResolvedValue([['v=spf1', 'include:example.com', '~all']]);

    const result = await runDnsCheck('example.com', { recordType: 'TXT' });
    expect(result.ok).toBe(true);
    expect(result.message).toContain('TXT resolved');
  });

  it('resolves NS record successfully', async () => {
    vi.mocked(dns.resolveNs).mockResolvedValue(['ns1.example.com', 'ns2.example.com']);

    const result = await runDnsCheck('example.com', { recordType: 'NS' });
    expect(result.ok).toBe(true);
    expect(result.message).toContain('NS resolved');
  });

  it('resolves CNAME record successfully', async () => {
    vi.mocked(dns.resolveCname).mockResolvedValue(['alias.example.com']);

    const result = await runDnsCheck('www.example.com', { recordType: 'CNAME' });
    expect(result.ok).toBe(true);
    expect(result.message).toContain('CNAME resolved');
  });

  it('defaults to A record when no recordType specified', async () => {
    vi.mocked(dns.resolve4).mockResolvedValue(['10.0.0.1']);

    const result = await runDnsCheck('example.com', {});
    expect(result.ok).toBe(true);
    expect(result.message).toContain('A resolved');
  });

  it('returns yellow when expectedValue not found in records', async () => {
    vi.mocked(dns.resolve4).mockResolvedValue(['1.2.3.4']);

    const result = await runDnsCheck('example.com', { recordType: 'A', expectedValue: '9.9.9.9' });
    expect(result.ok).toBe(false);
    expect(result.level).toBe('yellow');
    expect(result.message).toContain('expected value');
    expect(result.message).toContain('9.9.9.9');
  });

  it('passes when expectedValue found in records', async () => {
    vi.mocked(dns.resolve4).mockResolvedValue(['1.2.3.4', '5.6.7.8']);

    const result = await runDnsCheck('example.com', { recordType: 'A', expectedValue: '1.2.3.4' });
    expect(result.ok).toBe(true);
    expect(result.level).toBe('green');
  });

  it('shows multiple record summary when >1 returned', async () => {
    vi.mocked(dns.resolve4).mockResolvedValue(['1.2.3.4', '5.6.7.8', '9.10.11.12']);

    const result = await runDnsCheck('example.com', { recordType: 'A' });
    expect(result.ok).toBe(true);
    expect(result.message).toContain('+2 more');
  });

  it('returns red on DNS resolution failure', async () => {
    vi.mocked(dns.resolve4).mockRejectedValue(new Error('ENOTFOUND'));

    const result = await runDnsCheck('nonexistent.example.com', { recordType: 'A' });
    expect(result.ok).toBe(false);
    expect(result.level).toBe('red');
    expect(result.message).toContain('ENOTFOUND');
  });

  it('returns red on DNS timeout', async () => {
    vi.mocked(dns.resolve4).mockRejectedValue(new Error('DNS lookup timed out'));

    const result = await runDnsCheck('slow.example.com', {}, 100);
    expect(result.ok).toBe(false);
    expect(result.level).toBe('red');
  });

  it('strips http:// prefix from target hostname', async () => {
    vi.mocked(dns.resolve4).mockResolvedValue(['1.2.3.4']);

    const result = await runDnsCheck('https://example.com/path', {});
    expect(result.ok).toBe(true);
    expect(dns.resolve4).toHaveBeenCalledWith('example.com');
  });
});

// ── runDnsCheck — Change Detection ──────────────────────────────────────────

describe('runDnsCheck — DNS change detection', () => {
  afterEach(() => { vi.clearAllMocks(); });

  it('returns resolvedRecords on successful A lookup', async () => {
    vi.mocked(dns.resolve4).mockResolvedValue(['1.2.3.4', '5.6.7.8'] as never);
    const result = await runDnsCheck('example.com', { recordType: 'A' });
    expect(result.ok).toBe(true);
    expect(result.resolvedRecords).toEqual(['1.2.3.4', '5.6.7.8'].sort());
  });

  it('returns null resolvedRecords on DNS failure', async () => {
    vi.mocked(dns.resolve4).mockRejectedValue(new Error('NXDOMAIN'));
    const result = await runDnsCheck('missing.example.com', { recordType: 'A' });
    expect(result.ok).toBe(false);
    expect(result.resolvedRecords).toBeNull();
  });

  it('fires green when detectChanges=true and records match baseline', async () => {
    vi.mocked(dns.resolve4).mockResolvedValue(['1.2.3.4'] as never);
    const result = await runDnsCheck('example.com', {
      recordType: 'A',
      detectChanges: true,
      dnsBaseline: ['1.2.3.4'],
    });
    expect(result.ok).toBe(true);
    expect(result.level).toBe('green');
  });

  it('fires red when detectChanges=true and records differ from baseline (IP changed)', async () => {
    vi.mocked(dns.resolve4).mockResolvedValue(['9.9.9.9'] as never);
    const result = await runDnsCheck('example.com', {
      recordType: 'A',
      detectChanges: true,
      dnsBaseline: ['1.2.3.4'],
    });
    expect(result.ok).toBe(false);
    expect(result.level).toBe('red');
    expect(result.message).toContain('changed');
    expect(result.message).toContain('+[9.9.9.9]');
    expect(result.message).toContain('-[1.2.3.4]');
  });

  it('fires red when detectChanges=true and a record is added', async () => {
    vi.mocked(dns.resolve4).mockResolvedValue(['1.2.3.4', '9.9.9.9'] as never);
    const result = await runDnsCheck('example.com', {
      recordType: 'A',
      detectChanges: true,
      dnsBaseline: ['1.2.3.4'],
    });
    expect(result.ok).toBe(false);
    expect(result.level).toBe('red');
    expect(result.message).toContain('+[9.9.9.9]');
  });

  it('fires red when detectChanges=true and a record is removed', async () => {
    vi.mocked(dns.resolve4).mockResolvedValue(['1.2.3.4'] as never);
    const result = await runDnsCheck('example.com', {
      recordType: 'A',
      detectChanges: true,
      dnsBaseline: ['1.2.3.4', '5.6.7.8'],
    });
    expect(result.ok).toBe(false);
    expect(result.level).toBe('red');
    expect(result.message).toContain('-[5.6.7.8]');
  });

  it('skips change detection when baseline is null (first run)', async () => {
    vi.mocked(dns.resolve4).mockResolvedValue(['1.2.3.4'] as never);
    const result = await runDnsCheck('example.com', {
      recordType: 'A',
      detectChanges: true,
      // no dnsBaseline — first run
    });
    // Should succeed — caller will store baseline after this
    expect(result.ok).toBe(true);
    expect(result.resolvedRecords).toEqual(['1.2.3.4']);
  });

  it('ignores detectChanges when baseline comparison results in no diff but order differs', async () => {
    vi.mocked(dns.resolve4).mockResolvedValue(['5.6.7.8', '1.2.3.4'] as never);
    const result = await runDnsCheck('example.com', {
      recordType: 'A',
      detectChanges: true,
      dnsBaseline: ['1.2.3.4', '5.6.7.8'],
    });
    // Different order should not trigger a change alert
    expect(result.ok).toBe(true);
    expect(result.level).toBe('green');
  });
});

// ── runPingCheck ─────────────────────────────────────────────────────────────

describe('runPingCheck', () => {
  afterEach(() => { vi.clearAllMocks(); });

  it('returns red for empty target', async () => {
    const result = await runPingCheck('', {});
    expect(result.ok).toBe(false);
    expect(result.level).toBe('red');
    expect(result.statusCode).toBe(400);
    expect(result.message).toContain('hostname');
  });

  it('succeeds with green when ping latency below warn threshold', async () => {
    vi.mocked(execFile).mockImplementation(
      (_cmd: unknown, _args: unknown, _opts: unknown, cb: unknown) => {
        const callback = cb as (err: null, stdout: string) => void;
        setTimeout(() => callback(null, 'rtt min/avg/max/mdev = 1.0/5.0/10.0/2.0 ms\n0% packet loss\n'), 0);
        return {} as ReturnType<typeof execFile>;
      },
    );

    const result = await runPingCheck('8.8.8.8', { warnLatencyMs: 100, critLatencyMs: 500 });
    expect(result.ok).toBe(true);
    expect(result.level).toBe('green');
    expect(result.latencyMs).toBe(5);
    expect(result.message).toContain('8.8.8.8');
  });

  it('returns yellow when ping latency exceeds warn threshold', async () => {
    vi.mocked(execFile).mockImplementation(
      (_cmd: unknown, _args: unknown, _opts: unknown, cb: unknown) => {
        const callback = cb as (err: null, stdout: string) => void;
        setTimeout(() => callback(null, 'rtt min/avg/max/mdev = 100.0/300.0/500.0/50.0 ms\n0% packet loss\n'), 0);
        return {} as ReturnType<typeof execFile>;
      },
    );

    const result = await runPingCheck('example.com', { warnLatencyMs: 200, critLatencyMs: 1000 });
    expect(result.ok).toBe(true);
    expect(result.level).toBe('yellow');
  });

  it('returns red when ping latency exceeds crit threshold', async () => {
    vi.mocked(execFile).mockImplementation(
      (_cmd: unknown, _args: unknown, _opts: unknown, cb: unknown) => {
        const callback = cb as (err: null, stdout: string) => void;
        setTimeout(() => callback(null, 'rtt min/avg/max/mdev = 500.0/1500.0/2000.0/100.0 ms\n0% packet loss\n'), 0);
        return {} as ReturnType<typeof execFile>;
      },
    );

    const result = await runPingCheck('example.com', { warnLatencyMs: 200, critLatencyMs: 1000 });
    expect(result.ok).toBe(false);
    expect(result.level).toBe('red');
  });

  it('returns red on 100% packet loss', async () => {
    vi.mocked(execFile).mockImplementation(
      (_cmd: unknown, _args: unknown, _opts: unknown, cb: unknown) => {
        const callback = cb as (err: null, stdout: string) => void;
        setTimeout(() => callback(null, '100% packet loss\n'), 0);
        return {} as ReturnType<typeof execFile>;
      },
    );

    const result = await runPingCheck('unreachable.host', {});
    expect(result.ok).toBe(false);
    expect(result.level).toBe('red');
    expect(result.message).toContain('100%');
  });

  it('includes packet loss percentage in message when partial', async () => {
    vi.mocked(execFile).mockImplementation(
      (_cmd: unknown, _args: unknown, _opts: unknown, cb: unknown) => {
        const callback = cb as (err: null, stdout: string) => void;
        setTimeout(() => callback(null, 'rtt min/avg/max/mdev = 1.0/5.0/10.0/2.0 ms\n33% packet loss\n'), 0);
        return {} as ReturnType<typeof execFile>;
      },
    );

    const result = await runPingCheck('flaky.host', {});
    expect(result.message).toContain('33% loss');
  });

  it('returns red on ping command error (unreachable)', async () => {
    vi.mocked(execFile).mockImplementation(
      (_cmd: unknown, _args: unknown, _opts: unknown, cb: unknown) => {
        const callback = cb as (err: Error, stdout: string) => void;
        setTimeout(() => callback(Object.assign(new Error('ping failed'), { code: 1 }), ''), 0);
        return {} as ReturnType<typeof execFile>;
      },
    );

    const result = await runPingCheck('192.0.2.1', {});
    expect(result.ok).toBe(false);
    expect(result.level).toBe('red');
    expect(result.message).toContain('unreachable');
  });

  it('strips https:// prefix from target', async () => {
    vi.mocked(execFile).mockImplementation(
      (_cmd: unknown, args: unknown, _opts: unknown, cb: unknown) => {
        const callback = cb as (err: null, stdout: string) => void;
        setTimeout(() => callback(null, 'rtt min/avg/max/mdev = 1.0/5.0/10.0/2.0 ms\n0% packet loss\n'), 0);
        // Verify the host arg does not include https://
        const pingArgs = args as string[];
        expect(pingArgs).toContain('example.com');
        return {} as ReturnType<typeof execFile>;
      },
    );

    await runPingCheck('https://example.com/health', {});
  });
});

// ── runSmtpCheck ─────────────────────────────────────────────────────────────

describe('runSmtpCheck', () => {
  afterEach(() => { vi.clearAllMocks(); });

  it('returns red for empty host', async () => {
    const result = await runSmtpCheck('', {});
    expect(result.ok).toBe(false);
    expect(result.level).toBe('red');
    expect(result.statusCode).toBe(400);
    expect(result.message).toContain('SMTP target');
  });

  it('returns red for invalid port', async () => {
    const result = await runSmtpCheck(':0', {});
    expect(result.ok).toBe(false);
    expect(result.level).toBe('red');
    expect(result.statusCode).toBe(400);
  });

  it('returns red for port out of range', async () => {
    const result = await runSmtpCheck('mail.example.com:99999', {});
    expect(result.ok).toBe(false);
    expect(result.statusCode).toBe(400);
  });

  it('strips smtp:// prefix', async () => {
    // Build a mock socket that errors immediately (proving parsing happened)
    const mockSocket = {
      write: vi.fn(),
      destroy: vi.fn(),
      on: vi.fn(),
      once: vi.fn((event: string, cb: (err?: Error) => void) => {
        if (event === 'error') setTimeout(() => cb(new Error('ECONNREFUSED')), 0);
      }),
    };
    vi.mocked(net.createConnection).mockReturnValue(mockSocket as unknown as ReturnType<typeof net.createConnection>);

    // Should NOT return 400 (bad target) — parsing must have succeeded
    const result = await runSmtpCheck('smtp://mail.example.com:25', {});
    expect(result.statusCode).not.toBe(400);
    expect(result.ok).toBe(false); // failed due to mock error
  });

  it('proceeds to connection phase for valid target (does not return 400)', async () => {
    const mockSocket = {
      write: vi.fn(),
      destroy: vi.fn(),
      on: vi.fn(),
      once: vi.fn((event: string, cb: (err?: Error) => void) => {
        if (event === 'error') setTimeout(() => cb(new Error('ECONNREFUSED')), 0);
      }),
    };
    vi.mocked(net.createConnection).mockReturnValue(mockSocket as unknown as ReturnType<typeof net.createConnection>);

    // Valid target — should not return 400 (parsing succeeded, connection attempted)
    const result = await runSmtpCheck('mail.example.com:25', {}, 500);
    expect(result.statusCode).not.toBe(400);
  });

  it('defaults to port 25 when no port given', async () => {
    let capturedPort: number | undefined;
    const mockSocket = {
      write: vi.fn(),
      destroy: vi.fn(),
      on: vi.fn(),
      once: vi.fn((event: string, cb: (err?: Error) => void) => {
        if (event === 'error') setTimeout(() => cb(new Error('ECONNREFUSED')), 0);
      }),
    };
    vi.mocked(net.createConnection).mockImplementation(
      (opts: unknown) => {
        const o = opts as { host: string; port: number };
        capturedPort = o.port;
        return mockSocket as unknown as ReturnType<typeof net.createConnection>;
      },
    );

    await runSmtpCheck('mail.example.com', {});
    expect(capturedPort).toBe(25);
  });
});

// ── runFtpCheck ───────────────────────────────────────────────────────────────

/** Builds a mock socket that emits a single data event with the given text. */
function makeFtpSocket(responses: string[]) {
  let dataHandler: ((buf: Buffer) => void) | null = null;
  const socket = {
    write: vi.fn((chunk: string) => {
      // After QUIT or AUTH TLS, emit the next response if any
      const next = responses.shift();
      if (next && dataHandler) {
        setTimeout(() => dataHandler!(Buffer.from(next)), 0);
      }
    }),
    destroy: vi.fn(),
    on: vi.fn((event: string, cb: (buf: Buffer) => void) => {
      if (event === 'data') dataHandler = cb;
    }),
    once: vi.fn((_event: string, _cb: unknown) => { /* no-op: only error path */ }),
  };
  return socket;
}

describe('runFtpCheck', () => {
  afterEach(() => { vi.clearAllMocks(); });

  it('returns red for empty host', async () => {
    const result = await runFtpCheck('', {});
    expect(result.ok).toBe(false);
    expect(result.level).toBe('red');
    expect(result.statusCode).toBe(400);
    expect(result.message).toContain('FTP target');
  });

  it('returns red for invalid port :0', async () => {
    const result = await runFtpCheck(':0', {});
    expect(result.ok).toBe(false);
    expect(result.statusCode).toBe(400);
  });

  it('returns red for port out of range (99999)', async () => {
    const result = await runFtpCheck('ftp.example.com:99999', {});
    expect(result.ok).toBe(false);
    expect(result.statusCode).toBe(400);
  });

  it('strips ftp:// prefix', async () => {
    const mockSocket = {
      write: vi.fn(), destroy: vi.fn(),
      on: vi.fn(), once: vi.fn((event: string, cb: (err: Error) => void) => {
        if (event === 'error') setTimeout(() => cb(new Error('ECONNREFUSED')), 0);
      }),
    };
    vi.mocked(net.createConnection).mockReturnValue(mockSocket as unknown as ReturnType<typeof net.createConnection>);
    const result = await runFtpCheck('ftp://ftp.example.com:21', {});
    expect(result.statusCode).not.toBe(400);
  });

  it('defaults to port 21 when no port given', async () => {
    let capturedPort: number | undefined;
    const mockSocket = {
      write: vi.fn(), destroy: vi.fn(),
      on: vi.fn(), once: vi.fn((event: string, cb: (err: Error) => void) => {
        if (event === 'error') setTimeout(() => cb(new Error('ECONNREFUSED')), 0);
      }),
    };
    vi.mocked(net.createConnection).mockImplementation((opts: unknown) => {
      capturedPort = (opts as { port: number }).port;
      return mockSocket as unknown as ReturnType<typeof net.createConnection>;
    });
    await runFtpCheck('ftp.example.com', {});
    expect(capturedPort).toBe(21);
  });

  it('returns green on 220 banner without TLS check', async () => {
    let dataHandler: ((buf: Buffer) => void) | null = null;
    const mockSocket = {
      write: vi.fn(),
      destroy: vi.fn(),
      on: vi.fn((event: string, cb: (buf: Buffer) => void) => {
        if (event === 'data') dataHandler = cb;
      }),
      once: vi.fn(),
    };
    vi.mocked(net.createConnection).mockReturnValue(mockSocket as unknown as ReturnType<typeof net.createConnection>);

    const promise = runFtpCheck('ftp.example.com:21', { checkTls: false });
    // Emit 220 banner
    setTimeout(() => dataHandler!(Buffer.from('220 FTP ready\r\n')), 10);
    const result = await promise;

    expect(result.ok).toBe(true);
    expect(result.level).toBe('green');
    expect(result.message).toContain('FTP ok');
    expect(result.message).toContain('banner');
  });

  it('returns green on 220 + 234 TLS response', async () => {
    let dataHandler: ((buf: Buffer) => void) | null = null;
    const mockSocket = {
      write: vi.fn((chunk: string) => {
        // After AUTH TLS, send 234 response
        if (chunk.includes('AUTH TLS') && dataHandler) {
          setTimeout(() => dataHandler!(Buffer.from('234 AUTH TLS OK\r\n')), 5);
        }
      }),
      destroy: vi.fn(),
      on: vi.fn((event: string, cb: (buf: Buffer) => void) => {
        if (event === 'data') dataHandler = cb;
      }),
      once: vi.fn(),
    };
    vi.mocked(net.createConnection).mockReturnValue(mockSocket as unknown as ReturnType<typeof net.createConnection>);

    const promise = runFtpCheck('ftp.example.com:21', { checkTls: true });
    setTimeout(() => dataHandler!(Buffer.from('220 FTP Server ready\r\n')), 10);
    const result = await promise;

    expect(result.ok).toBe(true);
    expect(result.level).toBe('green');
    expect(result.message).toContain('TLS supported');
  });

  it('returns yellow when AUTH TLS not supported (500/502/504)', async () => {
    let dataHandler: ((buf: Buffer) => void) | null = null;
    const mockSocket = {
      write: vi.fn((chunk: string) => {
        if (chunk.includes('AUTH TLS') && dataHandler) {
          setTimeout(() => dataHandler!(Buffer.from('502 Command not implemented\r\n')), 5);
        }
      }),
      destroy: vi.fn(),
      on: vi.fn((event: string, cb: (buf: Buffer) => void) => {
        if (event === 'data') dataHandler = cb;
      }),
      once: vi.fn(),
    };
    vi.mocked(net.createConnection).mockReturnValue(mockSocket as unknown as ReturnType<typeof net.createConnection>);

    const promise = runFtpCheck('ftp.example.com:21', { checkTls: true });
    setTimeout(() => dataHandler!(Buffer.from('220 FTP ready\r\n')), 10);
    const result = await promise;

    expect(result.ok).toBe(true);
    expect(result.level).toBe('yellow');
    expect(result.message).toContain('TLS not supported');
  });

  it('returns red on connection error', async () => {
    const mockSocket = {
      write: vi.fn(), destroy: vi.fn(),
      on: vi.fn(),
      once: vi.fn((event: string, cb: (err: Error) => void) => {
        if (event === 'error') setTimeout(() => cb(new Error('ECONNREFUSED')), 0);
      }),
    };
    vi.mocked(net.createConnection).mockReturnValue(mockSocket as unknown as ReturnType<typeof net.createConnection>);
    const result = await runFtpCheck('ftp.example.com:21', {});
    expect(result.ok).toBe(false);
    expect(result.level).toBe('red');
    expect(result.message).toContain('ECONNREFUSED');
  });
});

// ── runImapCheck ──────────────────────────────────────────────────────────────

describe('runImapCheck', () => {
  afterEach(() => { vi.clearAllMocks(); });

  it('returns red for empty host', async () => {
    const result = await runImapCheck('', {});
    expect(result.ok).toBe(false);
    expect(result.level).toBe('red');
    expect(result.statusCode).toBe(400);
    expect(result.message).toContain('IMAP target');
  });

  it('returns red for invalid port :0', async () => {
    const result = await runImapCheck(':0', {});
    expect(result.ok).toBe(false);
    expect(result.statusCode).toBe(400);
  });

  it('strips imap:// prefix', async () => {
    const mockSocket = {
      write: vi.fn(), destroy: vi.fn(),
      on: vi.fn(), once: vi.fn((event: string, cb: (err: Error) => void) => {
        if (event === 'error') setTimeout(() => cb(new Error('ECONNREFUSED')), 0);
      }),
    };
    vi.mocked(net.createConnection).mockReturnValue(mockSocket as unknown as ReturnType<typeof net.createConnection>);
    const result = await runImapCheck('imap://mail.example.com:143', {});
    expect(result.statusCode).not.toBe(400);
  });

  it('defaults to port 143 when no port given', async () => {
    let capturedPort: number | undefined;
    const mockSocket = {
      write: vi.fn(), destroy: vi.fn(),
      on: vi.fn(), once: vi.fn((event: string, cb: (err: Error) => void) => {
        if (event === 'error') setTimeout(() => cb(new Error('ECONNREFUSED')), 0);
      }),
    };
    vi.mocked(net.createConnection).mockImplementation((opts: unknown) => {
      capturedPort = (opts as { port: number }).port;
      return mockSocket as unknown as ReturnType<typeof net.createConnection>;
    });
    await runImapCheck('mail.example.com', {});
    expect(capturedPort).toBe(143);
  });

  it('returns green on * OK greeting without STARTTLS', async () => {
    let dataHandler: ((buf: Buffer) => void) | null = null;
    const mockSocket = {
      write: vi.fn(),
      destroy: vi.fn(),
      on: vi.fn((event: string, cb: (buf: Buffer) => void) => {
        if (event === 'data') dataHandler = cb;
      }),
      once: vi.fn(),
    };
    vi.mocked(net.createConnection).mockReturnValue(mockSocket as unknown as ReturnType<typeof net.createConnection>);

    const promise = runImapCheck('mail.example.com:143', { checkTls: false });
    setTimeout(() => dataHandler!(Buffer.from('* OK Dovecot ready\r\n')), 10);
    const result = await promise;

    expect(result.ok).toBe(true);
    expect(result.level).toBe('green');
    expect(result.message).toContain('IMAP ok');
  });

  it('returns green on STARTTLS OK response', async () => {
    let dataHandler: ((buf: Buffer) => void) | null = null;
    const mockSocket = {
      write: vi.fn((chunk: string) => {
        if (chunk.includes('STARTTLS') && dataHandler) {
          setTimeout(() => dataHandler!(Buffer.from('a001 OK Begin TLS negotiation\r\n')), 5);
        }
      }),
      destroy: vi.fn(),
      on: vi.fn((event: string, cb: (buf: Buffer) => void) => {
        if (event === 'data') dataHandler = cb;
      }),
      once: vi.fn(),
    };
    vi.mocked(net.createConnection).mockReturnValue(mockSocket as unknown as ReturnType<typeof net.createConnection>);

    const promise = runImapCheck('mail.example.com:143', { checkTls: true });
    setTimeout(() => dataHandler!(Buffer.from('* OK Dovecot ready\r\n')), 10);
    const result = await promise;

    expect(result.ok).toBe(true);
    expect(result.level).toBe('green');
    expect(result.message).toContain('STARTTLS accepted');
  });

  it('returns yellow when STARTTLS NO/BAD response', async () => {
    let dataHandler: ((buf: Buffer) => void) | null = null;
    const mockSocket = {
      write: vi.fn((chunk: string) => {
        if (chunk.includes('STARTTLS') && dataHandler) {
          setTimeout(() => dataHandler!(Buffer.from('a001 NO STARTTLS not supported\r\n')), 5);
        }
      }),
      destroy: vi.fn(),
      on: vi.fn((event: string, cb: (buf: Buffer) => void) => {
        if (event === 'data') dataHandler = cb;
      }),
      once: vi.fn(),
    };
    vi.mocked(net.createConnection).mockReturnValue(mockSocket as unknown as ReturnType<typeof net.createConnection>);

    const promise = runImapCheck('mail.example.com:143', { checkTls: true });
    setTimeout(() => dataHandler!(Buffer.from('* OK Dovecot ready\r\n')), 10);
    const result = await promise;

    expect(result.ok).toBe(true);
    expect(result.level).toBe('yellow');
    expect(result.message).toContain('STARTTLS not supported');
  });

  it('returns red on connection error', async () => {
    const mockSocket = {
      write: vi.fn(), destroy: vi.fn(),
      on: vi.fn(),
      once: vi.fn((event: string, cb: (err: Error) => void) => {
        if (event === 'error') setTimeout(() => cb(new Error('EHOSTUNREACH')), 0);
      }),
    };
    vi.mocked(net.createConnection).mockReturnValue(mockSocket as unknown as ReturnType<typeof net.createConnection>);
    const result = await runImapCheck('mail.example.com:143', {});
    expect(result.ok).toBe(false);
    expect(result.level).toBe('red');
    expect(result.message).toContain('EHOSTUNREACH');
  });
});

// ── runPop3Check ──────────────────────────────────────────────────────────────

describe('runPop3Check', () => {
  afterEach(() => { vi.clearAllMocks(); });

  it('returns red for empty host', async () => {
    const result = await runPop3Check('', {});
    expect(result.ok).toBe(false);
    expect(result.level).toBe('red');
    expect(result.statusCode).toBe(400);
    expect(result.message).toContain('POP3 target');
  });

  it('returns red for port out of range', async () => {
    const result = await runPop3Check('mail.example.com:99999', {});
    expect(result.ok).toBe(false);
    expect(result.statusCode).toBe(400);
  });

  it('strips pop3:// prefix', async () => {
    const mockSocket = {
      write: vi.fn(), destroy: vi.fn(),
      on: vi.fn(), once: vi.fn((event: string, cb: (err: Error) => void) => {
        if (event === 'error') setTimeout(() => cb(new Error('ECONNREFUSED')), 0);
      }),
    };
    vi.mocked(net.createConnection).mockReturnValue(mockSocket as unknown as ReturnType<typeof net.createConnection>);
    const result = await runPop3Check('pop3://mail.example.com:110', {});
    expect(result.statusCode).not.toBe(400);
  });

  it('defaults to port 110 when no port given', async () => {
    let capturedPort: number | undefined;
    const mockSocket = {
      write: vi.fn(), destroy: vi.fn(),
      on: vi.fn(), once: vi.fn((event: string, cb: (err: Error) => void) => {
        if (event === 'error') setTimeout(() => cb(new Error('ECONNREFUSED')), 0);
      }),
    };
    vi.mocked(net.createConnection).mockImplementation((opts: unknown) => {
      capturedPort = (opts as { port: number }).port;
      return mockSocket as unknown as ReturnType<typeof net.createConnection>;
    });
    await runPop3Check('mail.example.com', {});
    expect(capturedPort).toBe(110);
  });

  it('returns green on +OK greeting without STLS', async () => {
    let dataHandler: ((buf: Buffer) => void) | null = null;
    const mockSocket = {
      write: vi.fn(),
      destroy: vi.fn(),
      on: vi.fn((event: string, cb: (buf: Buffer) => void) => {
        if (event === 'data') dataHandler = cb;
      }),
      once: vi.fn(),
    };
    vi.mocked(net.createConnection).mockReturnValue(mockSocket as unknown as ReturnType<typeof net.createConnection>);

    const promise = runPop3Check('mail.example.com:110', { checkTls: false });
    setTimeout(() => dataHandler!(Buffer.from('+OK POP3 server ready\r\n')), 10);
    const result = await promise;

    expect(result.ok).toBe(true);
    expect(result.level).toBe('green');
    expect(result.message).toContain('POP3 ok');
  });

  it('returns green on STLS +OK response', async () => {
    let dataHandler: ((buf: Buffer) => void) | null = null;
    const mockSocket = {
      write: vi.fn((chunk: string) => {
        if (chunk.includes('STLS') && dataHandler) {
          setTimeout(() => dataHandler!(Buffer.from('+OK Begin TLS negotiation\r\n')), 5);
        }
      }),
      destroy: vi.fn(),
      on: vi.fn((event: string, cb: (buf: Buffer) => void) => {
        if (event === 'data') dataHandler = cb;
      }),
      once: vi.fn(),
    };
    vi.mocked(net.createConnection).mockReturnValue(mockSocket as unknown as ReturnType<typeof net.createConnection>);

    const promise = runPop3Check('mail.example.com:110', { checkTls: true });
    setTimeout(() => dataHandler!(Buffer.from('+OK POP3 server ready\r\n')), 10);
    const result = await promise;

    expect(result.ok).toBe(true);
    expect(result.level).toBe('green');
    expect(result.message).toContain('STLS accepted');
  });

  it('returns yellow when STLS -ERR response', async () => {
    let dataHandler: ((buf: Buffer) => void) | null = null;
    const mockSocket = {
      write: vi.fn((chunk: string) => {
        if (chunk.includes('STLS') && dataHandler) {
          setTimeout(() => dataHandler!(Buffer.from('-ERR STLS command not supported\r\n')), 5);
        }
      }),
      destroy: vi.fn(),
      on: vi.fn((event: string, cb: (buf: Buffer) => void) => {
        if (event === 'data') dataHandler = cb;
      }),
      once: vi.fn(),
    };
    vi.mocked(net.createConnection).mockReturnValue(mockSocket as unknown as ReturnType<typeof net.createConnection>);

    const promise = runPop3Check('mail.example.com:110', { checkTls: true });
    setTimeout(() => dataHandler!(Buffer.from('+OK POP3 server ready\r\n')), 10);
    const result = await promise;

    expect(result.ok).toBe(true);
    expect(result.level).toBe('yellow');
    expect(result.message).toContain('STLS not supported');
  });

  it('returns red on connection error', async () => {
    const mockSocket = {
      write: vi.fn(), destroy: vi.fn(),
      on: vi.fn(),
      once: vi.fn((event: string, cb: (err: Error) => void) => {
        if (event === 'error') setTimeout(() => cb(new Error('ETIMEDOUT')), 0);
      }),
    };
    vi.mocked(net.createConnection).mockReturnValue(mockSocket as unknown as ReturnType<typeof net.createConnection>);
    const result = await runPop3Check('mail.example.com:110', {});
    expect(result.ok).toBe(false);
    expect(result.level).toBe('red');
    expect(result.message).toContain('ETIMEDOUT');
  });
});

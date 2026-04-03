/**
 * Unit tests for MonitorConfigCard pure logic helpers.
 * Tests host/port extraction, config rendering decisions, and config field derivation
 * across all supported monitor types (HTTP, SSL, TCP, HEARTBEAT, DNS, PING, SMTP,
 * FTP, IMAP, POP3, BROWSER, GRAPHQL).
 */
import { describe, it, expect } from 'vitest';

// ── Pure helpers mirrored from component ─────────────────────────────────────

function extractHost(target: string): string {
  return target.includes(':') ? target.split(':')[0] : target;
}

function extractPort(target: string, fallback: string): string {
  return target.includes(':') ? (target.split(':').pop() ?? fallback) : fallback;
}

function sslWarnDays(config: Record<string, unknown> | null | undefined): string {
  if (config && typeof config.warnDays === 'number') return `${config.warnDays} days`;
  return '30 days';
}

function dnsTimeout(config: Record<string, unknown> | null | undefined): string {
  if (config?.timeoutMs && typeof config.timeoutMs === 'number') {
    return `${Math.round(config.timeoutMs / 1000)}s`;
  }
  return '10s';
}

function smtpTimeout(config: Record<string, unknown> | null | undefined): string {
  if (config?.timeoutMs && typeof config.timeoutMs === 'number') {
    return `${Math.round(Number(config.timeoutMs) / 1000)}s`;
  }
  return '10s';
}

function pingPacketLossLabel(config: Record<string, unknown> | null | undefined): string {
  if (config?.maxPacketLossPct !== undefined) {
    return `>${String(config.maxPacketLossPct)}% = fail`;
  }
  return 'Any loss = warn';
}

function browserAllowedStatusCodes(config: Record<string, unknown> | null | undefined): string {
  if (config?.allowedStatusCodes) {
    return (config.allowedStatusCodes as number[]).join(', ');
  }
  return '200–299, 301, 302';
}

function browserTimeout(config: Record<string, unknown> | null | undefined): string {
  if (config?.timeoutMs) return `${Math.round(Number(config.timeoutMs) / 1000)}s`;
  return '10s';
}

function httpExpectedStatusLabel(expectedStatus: unknown): string {
  if (Array.isArray(expectedStatus)) return (expectedStatus as number[]).join(', ');
  return String(expectedStatus);
}

function ftpProtocol(checkTls: boolean): string {
  return checkTls ? 'FTPS Explicit' : 'Plain FTP';
}

function imapEncryption(checkTls: boolean): string {
  return checkTls ? 'STARTTLS' : 'Plain (port 143) or IMAPS (port 993)';
}

function pop3Encryption(checkTls: boolean): string {
  return checkTls ? 'STLS' : 'Plain (port 110) or POP3S (port 995)';
}

function dnsRecordType(config: Record<string, unknown> | null | undefined): string {
  return String(config?.recordType ?? 'A').toUpperCase();
}

function heartbeatToken(config: Record<string, unknown> | null | undefined): string {
  return String(config?.token ?? '—');
}

function heartbeatTimeout(config: Record<string, unknown> | null | undefined): string {
  return String(config?.timeoutMin ?? 5);
}

function smtpStarttlsLabel(requireStarttls: boolean): string {
  return requireStarttls ? 'Required' : 'Optional';
}

function ftpTlsLabel(checkTls: boolean): string {
  return checkTls ? 'Tested' : 'Not tested';
}

// ── extractHost ───────────────────────────────────────────────────────────────

describe('extractHost', () => {
  it('extracts host from host:port', () => {
    expect(extractHost('db.example.com:5432')).toBe('db.example.com');
  });

  it('returns full target when no port present', () => {
    expect(extractHost('example.com')).toBe('example.com');
  });

  it('handles IPv4 with port', () => {
    expect(extractHost('192.168.1.1:25')).toBe('192.168.1.1');
  });

  it('handles empty string', () => {
    expect(extractHost('')).toBe('');
  });

  it('handles host-only (smtp default port)', () => {
    expect(extractHost('mail.example.com')).toBe('mail.example.com');
  });
});

// ── extractPort ───────────────────────────────────────────────────────────────

describe('extractPort', () => {
  it('extracts port from host:port', () => {
    expect(extractPort('mail.example.com:25', '25')).toBe('25');
  });

  it('returns fallback when no port present', () => {
    expect(extractPort('example.com', '21')).toBe('21');
  });

  it('handles IPv4 with port', () => {
    expect(extractPort('192.168.1.1:143', '143')).toBe('143');
  });

  it('extracts 993 as IMAPS port', () => {
    expect(extractPort('mail.imap.com:993', '143')).toBe('993');
  });

  it('handles empty target — falls back', () => {
    expect(extractPort('', '110')).toBe('110');
  });
});

// ── sslWarnDays ───────────────────────────────────────────────────────────────

describe('sslWarnDays', () => {
  it('returns configured warnDays with unit suffix', () => {
    expect(sslWarnDays({ warnDays: 14 })).toBe('14 days');
  });

  it('returns default 30 days when config is null', () => {
    expect(sslWarnDays(null)).toBe('30 days');
  });

  it('returns default 30 days when config is undefined', () => {
    expect(sslWarnDays(undefined)).toBe('30 days');
  });

  it('returns default 30 days when warnDays is a string (not number)', () => {
    expect(sslWarnDays({ warnDays: '14' })).toBe('30 days');
  });

  it('returns 7 days when warnDays is 7', () => {
    expect(sslWarnDays({ warnDays: 7 })).toBe('7 days');
  });
});

// ── dnsTimeout ────────────────────────────────────────────────────────────────

describe('dnsTimeout', () => {
  it('converts ms to seconds', () => {
    expect(dnsTimeout({ timeoutMs: 5000 })).toBe('5s');
  });

  it('rounds fractional seconds', () => {
    expect(dnsTimeout({ timeoutMs: 1500 })).toBe('2s');
  });

  it('returns default 10s when config is null', () => {
    expect(dnsTimeout(null)).toBe('10s');
  });

  it('returns default 10s when timeoutMs is missing', () => {
    expect(dnsTimeout({})).toBe('10s');
  });

  it('handles 30000ms → 30s', () => {
    expect(dnsTimeout({ timeoutMs: 30000 })).toBe('30s');
  });
});

// ── smtpTimeout ───────────────────────────────────────────────────────────────

describe('smtpTimeout', () => {
  it('converts ms to seconds', () => {
    expect(smtpTimeout({ timeoutMs: 10000 })).toBe('10s');
  });

  it('returns default 10s when config is null', () => {
    expect(smtpTimeout(null)).toBe('10s');
  });

  it('rounds 3500ms to 4s', () => {
    expect(smtpTimeout({ timeoutMs: 3500 })).toBe('4s');
  });
});

// ── pingPacketLossLabel ───────────────────────────────────────────────────────

describe('pingPacketLossLabel', () => {
  it('formats threshold with > sign and percent', () => {
    expect(pingPacketLossLabel({ maxPacketLossPct: 25 })).toBe('>25% = fail');
  });

  it('returns fallback label when maxPacketLossPct is undefined', () => {
    expect(pingPacketLossLabel({})).toBe('Any loss = warn');
  });

  it('returns fallback when config is null', () => {
    expect(pingPacketLossLabel(null)).toBe('Any loss = warn');
  });

  it('handles 0% threshold', () => {
    expect(pingPacketLossLabel({ maxPacketLossPct: 0 })).toBe('>0% = fail');
  });

  it('handles 100% threshold', () => {
    expect(pingPacketLossLabel({ maxPacketLossPct: 100 })).toBe('>100% = fail');
  });
});

// ── browserAllowedStatusCodes ─────────────────────────────────────────────────

describe('browserAllowedStatusCodes', () => {
  it('joins array of codes with comma-space', () => {
    expect(browserAllowedStatusCodes({ allowedStatusCodes: [200, 201, 204] })).toBe('200, 201, 204');
  });

  it('returns default range when config is null', () => {
    expect(browserAllowedStatusCodes(null)).toBe('200–299, 301, 302');
  });

  it('returns default range when allowedStatusCodes is missing', () => {
    expect(browserAllowedStatusCodes({})).toBe('200–299, 301, 302');
  });

  it('handles single status code', () => {
    expect(browserAllowedStatusCodes({ allowedStatusCodes: [200] })).toBe('200');
  });
});

// ── browserTimeout ────────────────────────────────────────────────────────────

describe('browserTimeout', () => {
  it('converts 15000ms to 15s', () => {
    expect(browserTimeout({ timeoutMs: 15000 })).toBe('15s');
  });

  it('returns default 10s when not set', () => {
    expect(browserTimeout({})).toBe('10s');
  });

  it('returns default 10s when config is null', () => {
    expect(browserTimeout(null)).toBe('10s');
  });
});

// ── httpExpectedStatusLabel ───────────────────────────────────────────────────

describe('httpExpectedStatusLabel', () => {
  it('joins array of status codes', () => {
    expect(httpExpectedStatusLabel([200, 201, 202])).toBe('200, 201, 202');
  });

  it('converts single number to string', () => {
    expect(httpExpectedStatusLabel(200)).toBe('200');
  });

  it('converts string value to string', () => {
    expect(httpExpectedStatusLabel('200')).toBe('200');
  });

  it('handles single-item array', () => {
    expect(httpExpectedStatusLabel([404])).toBe('404');
  });
});

// ── ftpProtocol ───────────────────────────────────────────────────────────────

describe('ftpProtocol', () => {
  it('returns FTPS Explicit when TLS is enabled', () => {
    expect(ftpProtocol(true)).toBe('FTPS Explicit');
  });

  it('returns Plain FTP when TLS is disabled', () => {
    expect(ftpProtocol(false)).toBe('Plain FTP');
  });
});

// ── imapEncryption ────────────────────────────────────────────────────────────

describe('imapEncryption', () => {
  it('returns STARTTLS when TLS is enabled', () => {
    expect(imapEncryption(true)).toBe('STARTTLS');
  });

  it('returns plain options when TLS is disabled', () => {
    expect(imapEncryption(false)).toBe('Plain (port 143) or IMAPS (port 993)');
  });
});

// ── pop3Encryption ────────────────────────────────────────────────────────────

describe('pop3Encryption', () => {
  it('returns STLS when TLS is enabled', () => {
    expect(pop3Encryption(true)).toBe('STLS');
  });

  it('returns plain options when TLS is disabled', () => {
    expect(pop3Encryption(false)).toBe('Plain (port 110) or POP3S (port 995)');
  });
});

// ── dnsRecordType ─────────────────────────────────────────────────────────────

describe('dnsRecordType', () => {
  it('returns A as default when config is empty', () => {
    expect(dnsRecordType({})).toBe('A');
  });

  it('uppercases record type', () => {
    expect(dnsRecordType({ recordType: 'mx' })).toBe('MX');
  });

  it('handles AAAA', () => {
    expect(dnsRecordType({ recordType: 'AAAA' })).toBe('AAAA');
  });

  it('handles null config — returns A', () => {
    expect(dnsRecordType(null)).toBe('A');
  });

  it('handles CNAME', () => {
    expect(dnsRecordType({ recordType: 'cname' })).toBe('CNAME');
  });

  it('handles TXT', () => {
    expect(dnsRecordType({ recordType: 'TXT' })).toBe('TXT');
  });
});

// ── heartbeatToken ────────────────────────────────────────────────────────────

describe('heartbeatToken', () => {
  it('returns token from config', () => {
    expect(heartbeatToken({ token: 'abc-123-xyz' })).toBe('abc-123-xyz');
  });

  it('returns — when config is null', () => {
    expect(heartbeatToken(null)).toBe('—');
  });

  it('returns — when token is missing', () => {
    expect(heartbeatToken({})).toBe('—');
  });
});

// ── heartbeatTimeout ──────────────────────────────────────────────────────────

describe('heartbeatTimeout', () => {
  it('returns configured timeoutMin', () => {
    expect(heartbeatTimeout({ timeoutMin: 10 })).toBe('10');
  });

  it('returns default 5 when config is null', () => {
    expect(heartbeatTimeout(null)).toBe('5');
  });

  it('returns default 5 when timeoutMin is missing', () => {
    expect(heartbeatTimeout({})).toBe('5');
  });
});

// ── smtpStarttlsLabel ─────────────────────────────────────────────────────────

describe('smtpStarttlsLabel', () => {
  it('returns Required when enabled', () => {
    expect(smtpStarttlsLabel(true)).toBe('Required');
  });

  it('returns Optional when disabled', () => {
    expect(smtpStarttlsLabel(false)).toBe('Optional');
  });
});

// ── ftpTlsLabel ───────────────────────────────────────────────────────────────

describe('ftpTlsLabel', () => {
  it('returns Tested when TLS is checked', () => {
    expect(ftpTlsLabel(true)).toBe('Tested');
  });

  it('returns Not tested when TLS is not checked', () => {
    expect(ftpTlsLabel(false)).toBe('Not tested');
  });
});

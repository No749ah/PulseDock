/**
 * Unit tests for DnsConfigSection pure logic.
 * Tests DNS record types, expected value matching, timeout validation.
 */
import { describe, it, expect } from 'vitest';

// ── Constants mirrored from component ────────────────────────────────────────

const DNS_RECORD_TYPES = ['A', 'AAAA', 'MX', 'TXT', 'CNAME', 'NS'] as const;
type DnsRecordType = (typeof DNS_RECORD_TYPES)[number];

const DNS_TIMEOUT_MIN = 500;
const DNS_TIMEOUT_MAX = 30000;
const DNS_TIMEOUT_DEFAULT = 10000;

// ── Logic mirrored from component ────────────────────────────────────────────

function clampDnsTimeout(value: number): number {
  return Math.min(DNS_TIMEOUT_MAX, Math.max(DNS_TIMEOUT_MIN, value));
}

function isDnsExpectedValueRelevant(recordType: DnsRecordType): boolean {
  // A: IP address, AAAA: IPv6, MX: mail server, TXT: any text, CNAME: alias, NS: name server
  // All types support expected value matching
  return true;
}

function dnsExpectedValuePlaceholder(recordType: DnsRecordType): string {
  const placeholders: Record<DnsRecordType, string> = {
    A: '1.2.3.4',
    AAAA: '2001:db8::1',
    MX: 'mail.example.com.',
    TXT: 'v=spf1 include:example.com ~all',
    CNAME: 'alias.example.com.',
    NS: 'ns1.example.com.',
  };
  return `e.g. ${placeholders[recordType]} or mail.example.com.`;
}

function buildDnsFormData(overrides: Partial<{ dnsRecordType: DnsRecordType; dnsExpectedValue: string; dnsTimeoutMs: number; dnsDetectChanges: boolean }> = {}) {
  return {
    dnsRecordType: 'A' as DnsRecordType,
    dnsExpectedValue: '',
    dnsTimeoutMs: DNS_TIMEOUT_DEFAULT,
    dnsDetectChanges: false,
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DnsConfigSection — DNS_RECORD_TYPES', () => {
  it('has 6 record types', () => {
    expect(DNS_RECORD_TYPES).toHaveLength(6);
  });

  it('contains A, AAAA, MX, TXT, CNAME, NS', () => {
    const types = [...DNS_RECORD_TYPES];
    expect(types).toContain('A');
    expect(types).toContain('AAAA');
    expect(types).toContain('MX');
    expect(types).toContain('TXT');
    expect(types).toContain('CNAME');
    expect(types).toContain('NS');
  });

  it('every type is a non-empty string', () => {
    DNS_RECORD_TYPES.forEach((t) => expect(t.length).toBeGreaterThan(0));
  });

  it('default record type is A', () => {
    const fd = buildDnsFormData();
    expect(fd.dnsRecordType).toBe('A');
  });
});

describe('DnsConfigSection — timeout clamping', () => {
  it('defaults to 10000ms', () => {
    const fd = buildDnsFormData();
    expect(fd.dnsTimeoutMs).toBe(DNS_TIMEOUT_DEFAULT);
  });

  it('clamps to minimum 500ms', () => {
    expect(clampDnsTimeout(100)).toBe(500);
    expect(clampDnsTimeout(0)).toBe(500);
  });

  it('clamps to maximum 30000ms', () => {
    expect(clampDnsTimeout(60000)).toBe(30000);
    expect(clampDnsTimeout(99999)).toBe(30000);
  });

  it('accepts valid range', () => {
    expect(clampDnsTimeout(5000)).toBe(5000);
    expect(clampDnsTimeout(500)).toBe(500);
    expect(clampDnsTimeout(30000)).toBe(30000);
  });
});

describe('DnsConfigSection — expectedValue', () => {
  it('defaults to empty string', () => {
    const fd = buildDnsFormData();
    expect(fd.dnsExpectedValue).toBe('');
  });

  it('all record types support expected value matching', () => {
    DNS_RECORD_TYPES.forEach((t) => {
      expect(isDnsExpectedValueRelevant(t)).toBe(true);
    });
  });
});

describe('DnsConfigSection — expected value placeholder labels', () => {
  it('A record placeholder contains IP address format', () => {
    const p = dnsExpectedValuePlaceholder('A');
    expect(p).toContain('1.2.3.4');
  });

  it('AAAA record placeholder contains IPv6', () => {
    const p = dnsExpectedValuePlaceholder('AAAA');
    expect(p).toContain('2001:db8');
  });

  it('MX record placeholder references mail server', () => {
    const p = dnsExpectedValuePlaceholder('MX');
    expect(p).toContain('mail');
  });

  it('TXT record placeholder contains SPF-like content', () => {
    const p = dnsExpectedValuePlaceholder('TXT');
    expect(p).toContain('v=spf1');
  });

  it('CNAME placeholder contains alias', () => {
    const p = dnsExpectedValuePlaceholder('CNAME');
    expect(p).toContain('alias');
  });

  it('NS placeholder contains ns1', () => {
    const p = dnsExpectedValuePlaceholder('NS');
    expect(p).toContain('ns1');
  });
});

describe('DnsConfigSection — detectChanges flag', () => {
  it('defaults to false', () => {
    const fd = buildDnsFormData();
    expect(fd.dnsDetectChanges).toBe(false);
  });

  it('can be enabled', () => {
    const fd = buildDnsFormData({ dnsDetectChanges: true });
    expect(fd.dnsDetectChanges).toBe(true);
  });
});

describe('DnsConfigSection — form data mutation', () => {
  it('updating record type does not mutate original', () => {
    const fd = buildDnsFormData({ dnsRecordType: 'A' });
    const updated = { ...fd, dnsRecordType: 'MX' as DnsRecordType };
    expect(fd.dnsRecordType).toBe('A');
    expect(updated.dnsRecordType).toBe('MX');
  });

  it('updating expected value does not mutate original', () => {
    const fd = buildDnsFormData({ dnsExpectedValue: '' });
    const updated = { ...fd, dnsExpectedValue: '1.2.3.4' };
    expect(fd.dnsExpectedValue).toBe('');
    expect(updated.dnsExpectedValue).toBe('1.2.3.4');
  });
});

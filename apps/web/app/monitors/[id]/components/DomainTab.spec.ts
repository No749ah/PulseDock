/**
 * Unit tests for DomainTab pure logic.
 *
 * Tests: message parsing helpers (days remaining, expiry date, domain name),
 * status derivation, expiry bar width, notPublished/notFound detection.
 */
import { describe, it, expect } from 'vitest';

// ── Pure helpers mirrored from DomainTab ──────────────────────────────────────

type ExpiryStatus = 'green' | 'yellow' | 'red' | 'unknown';

interface ParsedDomainInfo {
  daysRemaining: number | null;
  expiryDate: string | null;
  domainName: string | null;
  notPublished: boolean;
  notFound: boolean;
}

function parseDomainMessage(msg: string): ParsedDomainInfo {
  let daysRemaining: number | null = null;
  let expiryDate: string | null = null;
  let domainName: string | null = null;
  let notPublished = false;
  let notFound = false;

  const domainMatch = msg.match(/["\u201c\u201d]([^"\u201c\u201d]+)["\u201c\u201d]/);
  if (domainMatch) domainName = domainMatch[1];
  if (!domainName) {
    const whoisMatch = msg.match(/WHOIS:\s+([^\s\u2014\u2013]+)/);
    if (whoisMatch) domainName = whoisMatch[1];
  }

  const expiresMatch = msg.match(/expires in (\d+)d \((\d{4}-\d{2}-\d{2})\)/);
  if (expiresMatch) {
    daysRemaining = parseInt(expiresMatch[1], 10);
    expiryDate = expiresMatch[2];
  }

  const expiredMatch = msg.match(/expired on (\d{4}-\d{2}-\d{2})/);
  if (expiredMatch) {
    expiryDate = expiredMatch[1];
    daysRemaining = 0;
  }

  if (msg.includes('expiry date not published')) notPublished = true;
  if (msg.includes('not found in WHOIS')) notFound = true;

  return { daysRemaining, expiryDate, domainName, notPublished, notFound };
}

function expiryStatusFromLevel(level?: string): ExpiryStatus {
  if (level === 'green') return 'green';
  if (level === 'yellow') return 'yellow';
  if (level === 'red') return 'red';
  return 'unknown';
}

function expiryBarWidth(daysRemaining: number | null): number {
  if (daysRemaining === null || daysRemaining <= 0) return 0;
  return Math.min(100, Math.round((daysRemaining / 365) * 100));
}

function statusBannerClass(status: ExpiryStatus): string {
  switch (status) {
    case 'green': return 'bg-success/10 border-success/30 text-success';
    case 'yellow': return 'bg-yellow-400/10 border-yellow-400/30 text-yellow-400';
    case 'red': return 'bg-danger/10 border-danger/30 text-danger';
    default: return 'bg-surface-elevated border-border text-text-secondary';
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DomainTab — parseDomainMessage (expires in)', () => {
  it('parses "expires in Nd (YYYY-MM-DD)" pattern', () => {
    const result = parseDomainMessage('Domain expires in 30d (2026-05-01)');
    expect(result.daysRemaining).toBe(30);
    expect(result.expiryDate).toBe('2026-05-01');
  });

  it('parses large day values', () => {
    const result = parseDomainMessage('expires in 365d (2027-04-01)');
    expect(result.daysRemaining).toBe(365);
    expect(result.expiryDate).toBe('2027-04-01');
  });

  it('returns null when no expiry info', () => {
    const result = parseDomainMessage('All good');
    expect(result.daysRemaining).toBeNull();
    expect(result.expiryDate).toBeNull();
  });
});

describe('DomainTab — parseDomainMessage (expired)', () => {
  it('parses "expired on YYYY-MM-DD" and sets daysRemaining=0', () => {
    const result = parseDomainMessage('Domain expired on 2025-01-15');
    expect(result.daysRemaining).toBe(0);
    expect(result.expiryDate).toBe('2025-01-15');
  });
});

describe('DomainTab — parseDomainMessage (domain name)', () => {
  it('extracts domain name from quoted string', () => {
    const result = parseDomainMessage('"example.com" expires in 60d (2026-06-01)');
    expect(result.domainName).toBe('example.com');
  });

  it('extracts domain name from WHOIS prefix', () => {
    const result = parseDomainMessage('WHOIS: example.com — expires in 60d (2026-06-01)');
    expect(result.domainName).toBe('example.com');
  });

  it('returns null when no domain name found', () => {
    const result = parseDomainMessage('Some message without domain');
    expect(result.domainName).toBeNull();
  });
});

describe('DomainTab — parseDomainMessage (special cases)', () => {
  it('detects notPublished flag', () => {
    const result = parseDomainMessage('expiry date not published');
    expect(result.notPublished).toBe(true);
    expect(result.notFound).toBe(false);
  });

  it('detects notFound flag', () => {
    const result = parseDomainMessage('domain not found in WHOIS');
    expect(result.notFound).toBe(true);
    expect(result.notPublished).toBe(false);
  });

  it('both flags false for normal message', () => {
    const result = parseDomainMessage('expires in 90d (2026-07-01)');
    expect(result.notPublished).toBe(false);
    expect(result.notFound).toBe(false);
  });
});

describe('DomainTab — expiryStatusFromLevel', () => {
  it('green level → green status', () => {
    expect(expiryStatusFromLevel('green')).toBe('green');
  });

  it('yellow level → yellow status', () => {
    expect(expiryStatusFromLevel('yellow')).toBe('yellow');
  });

  it('red level → red status', () => {
    expect(expiryStatusFromLevel('red')).toBe('red');
  });

  it('undefined level → unknown status', () => {
    expect(expiryStatusFromLevel(undefined)).toBe('unknown');
    expect(expiryStatusFromLevel('')).toBe('unknown');
  });
});

describe('DomainTab — expiryBarWidth', () => {
  it('365 days = 100%', () => {
    expect(expiryBarWidth(365)).toBe(100);
  });

  it('182 days ≈ 50%', () => {
    expect(expiryBarWidth(182)).toBe(50);
  });

  it('0 days = 0%', () => {
    expect(expiryBarWidth(0)).toBe(0);
  });

  it('null days = 0%', () => {
    expect(expiryBarWidth(null)).toBe(0);
  });

  it('more than 365 days is capped at 100%', () => {
    expect(expiryBarWidth(400)).toBe(100);
    expect(expiryBarWidth(9999)).toBe(100);
  });

  it('negative days = 0%', () => {
    expect(expiryBarWidth(-5)).toBe(0);
  });

  it('36 days ≈ 10%', () => {
    expect(expiryBarWidth(36)).toBe(10);
  });
});

describe('DomainTab — statusBannerClass', () => {
  it('green status → success classes', () => {
    expect(statusBannerClass('green')).toContain('success');
  });

  it('yellow status → yellow classes', () => {
    expect(statusBannerClass('yellow')).toContain('yellow');
  });

  it('red status → danger classes', () => {
    expect(statusBannerClass('red')).toContain('danger');
  });

  it('unknown status → neutral surface classes', () => {
    const cls = statusBannerClass('unknown');
    expect(cls).toContain('bg-surface-elevated');
    expect(cls).toContain('text-text-secondary');
  });

  it('all four statuses produce different class strings', () => {
    const classes = (['green', 'yellow', 'red', 'unknown'] as ExpiryStatus[]).map(statusBannerClass);
    expect(new Set(classes).size).toBe(4);
  });
});

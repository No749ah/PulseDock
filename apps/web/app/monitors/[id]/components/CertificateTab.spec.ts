/**
 * Unit tests for CertificateTab pure logic.
 * Tests SSL status color, grade color, days remaining calculations, and expiry detection.
 */
import { describe, it, expect } from 'vitest';

// ── Logic mirrored from component ────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  valid: 'text-success',
  expiring: 'text-yellow-400',
  critical: 'text-danger',
  expired: 'text-danger',
};

const GRADE_COLORS: Record<string, string> = {
  good: 'bg-success/15 text-success border-success/30',
  fair: 'bg-yellow-400/15 text-yellow-400 border-yellow-400/30',
  warning: 'bg-yellow-400/15 text-yellow-400 border-yellow-400/30',
  critical: 'bg-danger/15 text-danger border-danger/30',
  expired: 'bg-danger/15 text-danger border-danger/30',
};

function statusColor(status: string | undefined): string {
  return STATUS_COLORS[status ?? ''] ?? 'text-text-muted';
}

function gradeColor(grade: string | undefined): string {
  return GRADE_COLORS[grade ?? ''] ?? 'bg-surface text-text-secondary border-border';
}

function isCertExpiringSoon(daysRemaining: number | undefined): boolean {
  if (daysRemaining === undefined) return false;
  return daysRemaining <= 30;
}

function isCertExpired(daysRemaining: number | undefined): boolean {
  if (daysRemaining === undefined) return false;
  return daysRemaining <= 0;
}

function certExpiryLabel(daysRemaining: number | undefined): string {
  if (daysRemaining === undefined) return 'Unknown';
  if (daysRemaining <= 0) return 'Expired';
  if (daysRemaining === 1) return '1 day';
  return `${daysRemaining} days`;
}

function isCertAvailable(certDetails: Record<string, unknown> | null): boolean {
  if (!certDetails) return false;
  return certDetails['available'] !== false;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('CertificateTab — STATUS_COLORS', () => {
  it('valid → text-success', () => expect(statusColor('valid')).toBe('text-success'));
  it('expiring → text-yellow-400', () => expect(statusColor('expiring')).toBe('text-yellow-400'));
  it('critical → text-danger', () => expect(statusColor('critical')).toBe('text-danger'));
  it('expired → text-danger', () => expect(statusColor('expired')).toBe('text-danger'));
  it('unknown status → text-text-muted fallback', () => expect(statusColor('unknown_status')).toBe('text-text-muted'));
  it('undefined status → text-text-muted fallback', () => expect(statusColor(undefined)).toBe('text-text-muted'));
});

describe('CertificateTab — GRADE_COLORS', () => {
  it('good → success colors', () => expect(gradeColor('good')).toContain('success'));
  it('fair → yellow colors', () => expect(gradeColor('fair')).toContain('yellow'));
  it('warning → yellow colors', () => expect(gradeColor('warning')).toContain('yellow'));
  it('critical → danger colors', () => expect(gradeColor('critical')).toContain('danger'));
  it('expired → danger colors', () => expect(gradeColor('expired')).toContain('danger'));
  it('unknown grade → neutral fallback', () => {
    expect(gradeColor('unknown_grade')).toContain('surface');
  });
  it('undefined grade → neutral fallback', () => {
    expect(gradeColor(undefined)).toContain('surface');
  });
});

describe('CertificateTab — isCertExpiringSoon', () => {
  it('≤ 30 days → expiring soon', () => {
    expect(isCertExpiringSoon(30)).toBe(true);
    expect(isCertExpiringSoon(1)).toBe(true);
    expect(isCertExpiringSoon(0)).toBe(true);
  });

  it('> 30 days → not expiring soon', () => {
    expect(isCertExpiringSoon(31)).toBe(false);
    expect(isCertExpiringSoon(365)).toBe(false);
  });

  it('undefined → not expiring (no data)', () => {
    expect(isCertExpiringSoon(undefined)).toBe(false);
  });
});

describe('CertificateTab — isCertExpired', () => {
  it('0 days → expired', () => expect(isCertExpired(0)).toBe(true));
  it('negative days → expired', () => expect(isCertExpired(-5)).toBe(true));
  it('1 day → not expired', () => expect(isCertExpired(1)).toBe(false));
  it('undefined → not expired (no data)', () => expect(isCertExpired(undefined)).toBe(false));
});

describe('CertificateTab — certExpiryLabel', () => {
  it('undefined → "Unknown"', () => expect(certExpiryLabel(undefined)).toBe('Unknown'));
  it('0 days → "Expired"', () => expect(certExpiryLabel(0)).toBe('Expired'));
  it('negative days → "Expired"', () => expect(certExpiryLabel(-10)).toBe('Expired'));
  it('1 day → "1 day"', () => expect(certExpiryLabel(1)).toBe('1 day'));
  it('30 days → "30 days"', () => expect(certExpiryLabel(30)).toBe('30 days'));
  it('365 days → "365 days"', () => expect(certExpiryLabel(365)).toBe('365 days'));
});

describe('CertificateTab — isCertAvailable', () => {
  it('null certDetails → not available', () => {
    expect(isCertAvailable(null)).toBe(false);
  });

  it('certDetails with available=false → not available', () => {
    expect(isCertAvailable({ available: false, reason: 'Not SSL monitor' })).toBe(false);
  });

  it('certDetails with available=true → available', () => {
    expect(isCertAvailable({ available: true, status: 'valid' })).toBe(true);
  });

  it('certDetails without available key → available (truthy default)', () => {
    expect(isCertAvailable({ status: 'valid', daysRemaining: 90 })).toBe(true);
  });
});

describe('CertificateTab — combined scenarios', () => {
  it('valid cert with 90 days → success color, no expiry warning', () => {
    expect(statusColor('valid')).toBe('text-success');
    expect(isCertExpiringSoon(90)).toBe(false);
  });

  it('expiring cert with 14 days → yellow color, expiry warning', () => {
    expect(statusColor('expiring')).toBe('text-yellow-400');
    expect(isCertExpiringSoon(14)).toBe(true);
    expect(certExpiryLabel(14)).toBe('14 days');
  });

  it('expired cert with 0 days → danger color, expired label', () => {
    expect(statusColor('expired')).toBe('text-danger');
    expect(isCertExpired(0)).toBe(true);
    expect(certExpiryLabel(0)).toBe('Expired');
  });
});

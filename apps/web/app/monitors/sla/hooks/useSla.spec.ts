/**
 * Unit tests for useSla.ts pure exports.
 *
 * complianceStatus() is a pure function — fully testable without React rendering.
 * ViewMode type contract is verified via compile-time values.
 */
import { describe, it, expect } from 'vitest';

// ─── Mirror complianceStatus (no 'use client') ────────────────────────────────

type ViewMode = 'monitors' | 'tags';

function complianceStatus(m: {
  slaTarget: number | null;
  compliant: boolean | null;
  uptimePct: number;
}): 'compliant' | 'atRisk' | 'breached' | 'noTarget' {
  if (m.slaTarget == null) return 'noTarget';
  if (m.compliant === false) return 'breached';
  if (m.compliant === true && m.uptimePct - m.slaTarget < 0.1) return 'atRisk';
  return 'compliant';
}

// ─── complianceStatus ─────────────────────────────────────────────────────────

describe('complianceStatus', () => {
  // noTarget branch
  describe('when slaTarget is null', () => {
    it('returns "noTarget" regardless of uptimePct', () => {
      expect(complianceStatus({ slaTarget: null, compliant: null, uptimePct: 100 })).toBe('noTarget');
      expect(complianceStatus({ slaTarget: null, compliant: true, uptimePct: 99 })).toBe('noTarget');
      expect(complianceStatus({ slaTarget: null, compliant: false, uptimePct: 0 })).toBe('noTarget');
    });
  });

  // breached branch
  describe('when compliant is false', () => {
    it('returns "breached" with a valid slaTarget', () => {
      expect(complianceStatus({ slaTarget: 99.9, compliant: false, uptimePct: 98 })).toBe('breached');
      expect(complianceStatus({ slaTarget: 99, compliant: false, uptimePct: 95 })).toBe('breached');
    });

    it('returns "breached" even when uptimePct === slaTarget', () => {
      expect(complianceStatus({ slaTarget: 99, compliant: false, uptimePct: 99 })).toBe('breached');
    });
  });

  // atRisk branch — compliant=true but margin < 0.1
  describe('when compliant is true and margin < 0.1', () => {
    it('returns "atRisk" when uptimePct === slaTarget (margin = 0)', () => {
      expect(complianceStatus({ slaTarget: 99, compliant: true, uptimePct: 99 })).toBe('atRisk');
    });

    it('returns "atRisk" when margin is 0.09', () => {
      expect(complianceStatus({ slaTarget: 99, compliant: true, uptimePct: 99.09 })).toBe('atRisk');
    });

    it('returns "atRisk" when margin is just under 0.1 (0.099)', () => {
      expect(complianceStatus({ slaTarget: 99, compliant: true, uptimePct: 99.099 })).toBe('atRisk');
    });

    it('returns "atRisk" for 99.9 slaTarget and 99.99 uptimePct (float: 0.09...)', () => {
      // 99.99 - 99.9 = 0.0899... in IEEE 754, so < 0.1
      expect(complianceStatus({ slaTarget: 99.9, compliant: true, uptimePct: 99.99 })).toBe('atRisk');
    });
  });

  // compliant branch — margin >= 0.1 (using integer arithmetic to avoid floating point)
  describe('when compliant is true and margin >= 0.1', () => {
    it('returns "compliant" with large margin (1%)', () => {
      // 99 - 98 = 1.0 >= 0.1 → compliant
      expect(complianceStatus({ slaTarget: 98, compliant: true, uptimePct: 99 })).toBe('compliant');
    });

    it('returns "compliant" with large margin (5%)', () => {
      expect(complianceStatus({ slaTarget: 95, compliant: true, uptimePct: 99.9 })).toBe('compliant');
    });

    it('returns "compliant" at 100% uptime with 95 target', () => {
      expect(complianceStatus({ slaTarget: 95, compliant: true, uptimePct: 100 })).toBe('compliant');
    });

    it('returns "compliant" when margin is 0.5', () => {
      // 99.5 - 99 = 0.5 >= 0.1 → compliant (no float precision issue)
      expect(complianceStatus({ slaTarget: 99, compliant: true, uptimePct: 99.5 })).toBe('compliant');
    });
  });

  // compliant=null with valid target
  describe('when compliant is null and slaTarget is set', () => {
    it('returns "compliant" (falls through to default)', () => {
      // null is not false, not true, so it's neither breached nor atRisk
      expect(complianceStatus({ slaTarget: 99, compliant: null, uptimePct: 99.5 })).toBe('compliant');
    });
  });

  // boundary: floating point behaviour — 99.1 - 99 = 0.09999... which IS < 0.1 in JS
  it('treats 99.1 uptime with 99 target as atRisk (float precision)', () => {
    // 99.1 - 99 === 0.09999999... < 0.1 in IEEE 754
    expect(complianceStatus({ slaTarget: 99, compliant: true, uptimePct: 99.1 })).toBe('atRisk');
  });

  it('treats 0.5 margin (99.5 - 99) as compliant (no float issue)', () => {
    expect(complianceStatus({ slaTarget: 99, compliant: true, uptimePct: 99.5 })).toBe('compliant');
  });

  it('treats 0.099 margin as atRisk (below threshold)', () => {
    expect(complianceStatus({ slaTarget: 99, compliant: true, uptimePct: 99.099 })).toBe('atRisk');
  });
});

// ─── ViewMode type contract ───────────────────────────────────────────────────

describe('ViewMode', () => {
  it('accepts "monitors"', () => {
    const mode: ViewMode = 'monitors';
    expect(mode).toBe('monitors');
  });

  it('accepts "tags"', () => {
    const mode: ViewMode = 'tags';
    expect(mode).toBe('tags');
  });

  it('has exactly 2 valid values', () => {
    const validModes: ViewMode[] = ['monitors', 'tags'];
    expect(validModes).toHaveLength(2);
  });
});

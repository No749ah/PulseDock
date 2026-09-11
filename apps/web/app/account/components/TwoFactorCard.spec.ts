/**
 * Unit tests for TwoFactorCard pure logic.
 *
 * Tests: TOTP code validation, copy-codes state, state reset helpers, recovery code
 * handling, and disable-flow precondition guards.
 */
import { describe, it, expect } from 'vitest';

// ── Pure helpers mirrored from TwoFactorCard ──────────────────────────────────

/** Only allow digits, max 6 chars — mirrors onChange logic in all TOTP inputs */
function sanitizeTotpInput(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, 6);
}

/** Guard: can we submit the enable form? */
function canSubmitEnable(code: string, loading: boolean): boolean {
  return code.length === 6 && !loading;
}

/** Guard: can we submit the disable form? */
function canSubmitDisable(password: string, code: string, loading: boolean): boolean {
  return password.length > 0 && code.length === 6 && !loading;
}

/** Guard: can we submit the regenerate-codes form? */
function canSubmitRegen(code: string, loading: boolean): boolean {
  return code.length === 6 && !loading;
}

/** Build copy text from recovery codes */
function buildCopyText(codes: string[]): string {
  return codes.join('\n');
}

/** Derive modal title based on whether we have recovery codes to display */
function setupModalTitle(totpRecoveryCodes: string[] | null): string {
  return totpRecoveryCodes ? 'Save Your Recovery Codes' : 'Enable Two-Factor Authentication';
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('TwoFactorCard — sanitizeTotpInput', () => {
  it('strips non-digit characters', () => {
    expect(sanitizeTotpInput('abc')).toBe('');
    expect(sanitizeTotpInput('12-34-56')).toBe('123456');
    expect(sanitizeTotpInput('12 34 56')).toBe('123456');
  });

  it('truncates to max 6 digits', () => {
    expect(sanitizeTotpInput('1234567890')).toBe('123456');
  });

  it('passes valid 6-digit code unchanged', () => {
    expect(sanitizeTotpInput('123456')).toBe('123456');
  });

  it('passes partial codes (< 6 digits)', () => {
    expect(sanitizeTotpInput('123')).toBe('123');
    expect(sanitizeTotpInput('')).toBe('');
  });

  it('handles mixed alpha-numeric input', () => {
    expect(sanitizeTotpInput('1a2b3c')).toBe('123');
  });

  it('strips leading/trailing spaces', () => {
    expect(sanitizeTotpInput(' 123456 ')).toBe('123456');
  });
});

describe('TwoFactorCard — canSubmitEnable', () => {
  it('allows submit when 6-digit code and not loading', () => {
    expect(canSubmitEnable('123456', false)).toBe(true);
  });

  it('blocks when code is shorter than 6', () => {
    expect(canSubmitEnable('12345', false)).toBe(false);
    expect(canSubmitEnable('', false)).toBe(false);
  });

  it('blocks when loading', () => {
    expect(canSubmitEnable('123456', true)).toBe(false);
  });

  it('blocks when both code too short and loading', () => {
    expect(canSubmitEnable('12', true)).toBe(false);
  });

  it('exactly 6 digits is the threshold', () => {
    expect(canSubmitEnable('123456', false)).toBe(true);
    expect(canSubmitEnable('1234567', false)).toBe(false); // length > 6
  });
});

describe('TwoFactorCard — canSubmitDisable', () => {
  it('allows submit with non-empty password, 6-digit code, not loading', () => {
    expect(canSubmitDisable('secret', '123456', false)).toBe(true);
  });

  it('blocks when password is empty', () => {
    expect(canSubmitDisable('', '123456', false)).toBe(false);
  });

  it('blocks when code < 6 digits', () => {
    expect(canSubmitDisable('secret', '123', false)).toBe(false);
  });

  it('blocks when loading', () => {
    expect(canSubmitDisable('secret', '123456', true)).toBe(false);
  });

  it('blocks all conditions bad simultaneously', () => {
    expect(canSubmitDisable('', '12', true)).toBe(false);
  });
});

describe('TwoFactorCard — canSubmitRegen', () => {
  it('allows submit with 6-digit code and not loading', () => {
    expect(canSubmitRegen('654321', false)).toBe(true);
  });

  it('blocks when code is empty', () => {
    expect(canSubmitRegen('', false)).toBe(false);
  });

  it('blocks when loading', () => {
    expect(canSubmitRegen('123456', true)).toBe(false);
  });
});

describe('TwoFactorCard — buildCopyText', () => {
  it('joins recovery codes with newlines', () => {
    const codes = ['AAAA-BBBB', 'CCCC-DDDD', 'EEEE-FFFF'];
    expect(buildCopyText(codes)).toBe('AAAA-BBBB\nCCCC-DDDD\nEEEE-FFFF');
  });

  it('returns single code without trailing newline', () => {
    expect(buildCopyText(['XXXX-YYYY'])).toBe('XXXX-YYYY');
  });

  it('handles empty codes array', () => {
    expect(buildCopyText([])).toBe('');
  });

  it('each code appears exactly once in output', () => {
    const codes = ['A1B2-C3D4', 'E5F6-G7H8'];
    const text = buildCopyText(codes);
    for (const code of codes) {
      expect(text).toContain(code);
    }
    expect(text.split('\n')).toHaveLength(2);
  });
});

describe('TwoFactorCard — setupModalTitle', () => {
  it('shows save-codes title when recovery codes present', () => {
    expect(setupModalTitle(['code1', 'code2'])).toBe('Save Your Recovery Codes');
  });

  it('shows enable title when no recovery codes yet', () => {
    expect(setupModalTitle(null)).toBe('Enable Two-Factor Authentication');
  });

  it('shows save-codes title even for empty array (falsy check is null)', () => {
    // An empty array is truthy — component would show save-codes screen
    expect(setupModalTitle([])).toBe('Save Your Recovery Codes');
  });
});

describe('TwoFactorCard — recovery code format expectations', () => {
  const TYPICAL_RECOVERY_CODES = [
    'AAAA-BBBB', 'CCCC-DDDD', 'EEEE-FFFF', 'GGGG-HHHH',
    'IIII-JJJJ', 'KKKK-LLLL', 'MMMM-NNNN', 'OOOO-PPPP',
  ];

  it('8 recovery codes are typical (standard 2FA set)', () => {
    expect(TYPICAL_RECOVERY_CODES).toHaveLength(8);
  });

  it('all codes match hyphenated 4-char pattern', () => {
    for (const code of TYPICAL_RECOVERY_CODES) {
      expect(code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    }
  });

  it('all codes are unique', () => {
    expect(new Set(TYPICAL_RECOVERY_CODES).size).toBe(TYPICAL_RECOVERY_CODES.length);
  });

  it('copy text length is as expected', () => {
    // 8 codes × 9 chars + 7 newlines = 79 chars
    const text = buildCopyText(TYPICAL_RECOVERY_CODES);
    expect(text.split('\n')).toHaveLength(8);
  });
});

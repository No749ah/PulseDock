/**
 * Unit tests for ChangePasswordCard pure logic.
 * Tests password validation rules used before API call.
 */
import { describe, it, expect } from 'vitest';

// ── Logic mirrored from component ────────────────────────────────────────────

const PASSWORD_MIN_LENGTH = 12;

function validatePasswordChange(newPassword: string, confirmPassword: string): string | null {
  if (newPassword !== confirmPassword) return "Passwords don't match";
  if (newPassword.length < PASSWORD_MIN_LENGTH) return `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;
  return null;
}

function passwordsMatch(a: string, b: string): boolean {
  return a === b;
}

function meetsLengthPolicy(password: string): boolean {
  return password.length >= PASSWORD_MIN_LENGTH;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ChangePasswordCard — validatePasswordChange', () => {
  it('returns mismatch error when passwords differ', () => {
    const error = validatePasswordChange('Password123!', 'Different123!');
    expect(error).toBe("Passwords don't match");
  });

  it('returns length error when password is too short (even if matching)', () => {
    const short = 'abc';
    const error = validatePasswordChange(short, short);
    expect(error).toBe('Password must be at least 12 characters');
  });

  it('returns null when passwords match and meet length requirement', () => {
    const valid = 'StrongPassword123!';
    const error = validatePasswordChange(valid, valid);
    expect(error).toBeNull();
  });

  it('mismatch error takes precedence over length error', () => {
    const error = validatePasswordChange('short', 'different');
    expect(error).toBe("Passwords don't match");
  });

  it('accepts exactly 12-character password', () => {
    const exactly12 = 'Password123!';
    expect(exactly12).toHaveLength(12);
    const error = validatePasswordChange(exactly12, exactly12);
    expect(error).toBeNull();
  });

  it('rejects 11-character password', () => {
    const almost = 'Password12!';
    expect(almost).toHaveLength(11);
    const error = validatePasswordChange(almost, almost);
    expect(error).not.toBeNull();
    expect(error).toContain('12');
  });

  it('accepts long password', () => {
    const long = 'A'.repeat(50) + 'b1!';
    const error = validatePasswordChange(long, long);
    expect(error).toBeNull();
  });
});

describe('ChangePasswordCard — passwordsMatch', () => {
  it('returns true for identical strings', () => {
    expect(passwordsMatch('abc', 'abc')).toBe(true);
  });

  it('returns false for different strings', () => {
    expect(passwordsMatch('abc', 'xyz')).toBe(false);
  });

  it('is case-sensitive', () => {
    expect(passwordsMatch('Password', 'password')).toBe(false);
  });

  it('returns true for empty strings', () => {
    expect(passwordsMatch('', '')).toBe(true);
  });
});

describe('ChangePasswordCard — meetsLengthPolicy', () => {
  it('returns false for password shorter than 12 chars', () => {
    expect(meetsLengthPolicy('short')).toBe(false);
    expect(meetsLengthPolicy('only11char!')).toBe(false); // 11 chars
  });

  it('returns true for exactly 12 characters', () => {
    expect(meetsLengthPolicy('Password123!')).toBe(true);
  });

  it('returns true for longer passwords', () => {
    expect(meetsLengthPolicy('A very long and secure password!')).toBe(true);
  });

  it('returns false for empty string', () => {
    expect(meetsLengthPolicy('')).toBe(false);
  });
});

describe('ChangePasswordCard — PASSWORD_MIN_LENGTH constant', () => {
  it('minimum length is 12', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(12);
  });
});

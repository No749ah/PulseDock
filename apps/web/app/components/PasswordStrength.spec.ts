import { describe, it, expect } from 'vitest';
import { passwordMeetsPolicy } from './PasswordStrength';

describe('passwordMeetsPolicy', () => {
  it('returns false for empty string', () => {
    expect(passwordMeetsPolicy('')).toBe(false);
  });

  it('returns false when password is too short (< 12 chars)', () => {
    expect(passwordMeetsPolicy('Short1!aB')).toBe(false);
  });

  it('returns false when missing uppercase', () => {
    expect(passwordMeetsPolicy('alllowercase123!')).toBe(false);
  });

  it('returns false when missing lowercase', () => {
    expect(passwordMeetsPolicy('ALLUPPERCASE123!')).toBe(false);
  });

  it('returns false when missing digit', () => {
    expect(passwordMeetsPolicy('NoDigitsHere!@#abc')).toBe(false);
  });

  it('returns false when missing special character', () => {
    expect(passwordMeetsPolicy('NoSpecialChar123abc')).toBe(false);
  });

  it('returns true for a strong password meeting all rules', () => {
    expect(passwordMeetsPolicy('MyStr0ng!Pass#2025')).toBe(true);
  });

  it('returns true for minimum 12-char password with all rules', () => {
    expect(passwordMeetsPolicy('Aa1!Aa1!Aa1!')).toBe(true);
  });

  it('returns false for 11-char password otherwise valid', () => {
    expect(passwordMeetsPolicy('Aa1!Aa1!Aa1')).toBe(false);
  });

  it('accepts various special characters', () => {
    expect(passwordMeetsPolicy('ComplexPass1@')).toBe(true);
    expect(passwordMeetsPolicy('ComplexPass1#')).toBe(true);
    expect(passwordMeetsPolicy('ComplexPass1$')).toBe(true);
    expect(passwordMeetsPolicy('ComplexPass1%')).toBe(true);
    expect(passwordMeetsPolicy('ComplexPass1^')).toBe(true);
  });

  it('returns false for all digits (no letters)', () => {
    expect(passwordMeetsPolicy('123456789012!')).toBe(false);
  });

  it('accepts passphrase-style passwords', () => {
    expect(passwordMeetsPolicy('correct-Horse-Battery-Staple1!')).toBe(true);
  });
});

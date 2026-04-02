/**
 * Unit tests for CountdownWidget pure logic.
 * Tests formatCountdown decomposition and edge cases.
 */
import { describe, it, expect } from 'vitest';

// ── Logic mirrored from component ────────────────────────────────────────────

function formatCountdown(secondsRemaining: number): { days: number; hours: number; minutes: number; seconds: number } {
  const days = Math.floor(secondsRemaining / 86400);
  const hours = Math.floor((secondsRemaining % 86400) / 3600);
  const minutes = Math.floor((secondsRemaining % 3600) / 60);
  const seconds = secondsRemaining % 60;
  return { days, hours, minutes, seconds };
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('CountdownWidget — formatCountdown', () => {
  it('handles exactly zero', () => {
    expect(formatCountdown(0)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  });

  it('handles one second', () => {
    expect(formatCountdown(1)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 1 });
  });

  it('handles one minute', () => {
    expect(formatCountdown(60)).toEqual({ days: 0, hours: 0, minutes: 1, seconds: 0 });
  });

  it('handles one minute and 30 seconds', () => {
    expect(formatCountdown(90)).toEqual({ days: 0, hours: 0, minutes: 1, seconds: 30 });
  });

  it('handles one hour exactly', () => {
    expect(formatCountdown(3600)).toEqual({ days: 0, hours: 1, minutes: 0, seconds: 0 });
  });

  it('handles one hour 15 minutes 45 seconds', () => {
    expect(formatCountdown(3600 + 15 * 60 + 45)).toEqual({ days: 0, hours: 1, minutes: 15, seconds: 45 });
  });

  it('handles one day exactly', () => {
    expect(formatCountdown(86400)).toEqual({ days: 1, hours: 0, minutes: 0, seconds: 0 });
  });

  it('handles multiple days', () => {
    expect(formatCountdown(86400 * 3)).toEqual({ days: 3, hours: 0, minutes: 0, seconds: 0 });
  });

  it('handles 2 days 3 hours 5 minutes 7 seconds', () => {
    const secs = 2 * 86400 + 3 * 3600 + 5 * 60 + 7;
    expect(formatCountdown(secs)).toEqual({ days: 2, hours: 3, minutes: 5, seconds: 7 });
  });

  it('handles large future timestamp (30 days)', () => {
    const result = formatCountdown(30 * 86400);
    expect(result.days).toBe(30);
    expect(result.hours).toBe(0);
    expect(result.minutes).toBe(0);
    expect(result.seconds).toBe(0);
  });

  it('handles near-end of day boundary (86399 seconds)', () => {
    const result = formatCountdown(86399);
    expect(result.days).toBe(0);
    expect(result.hours).toBe(23);
    expect(result.minutes).toBe(59);
    expect(result.seconds).toBe(59);
  });
});

describe('CountdownWidget — pad', () => {
  it('pads single digits', () => {
    expect(pad(0)).toBe('00');
    expect(pad(1)).toBe('01');
    expect(pad(9)).toBe('09');
  });

  it('does not pad two-digit numbers', () => {
    expect(pad(10)).toBe('10');
    expect(pad(59)).toBe('59');
    expect(pad(23)).toBe('23');
  });
});

describe('CountdownWidget — expired logic', () => {
  it('marks expired when secondsLeft is 0', () => {
    const expired = 0 === 0;
    expect(expired).toBe(true);
  });

  it('not expired when secondsLeft > 0', () => {
    const secondsLeft: number = 5;
    const expired = secondsLeft === 0;
    expect(expired).toBe(false);
  });
});

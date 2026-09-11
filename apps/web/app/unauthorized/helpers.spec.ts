import { describe, it, expect } from 'vitest';

// ── Inline constants (mirrored from helpers.ts) ────────────────────────────

const GUARD_LINES = [
  "🛡️ HALT! Who goes there?",
  "🔐 Access denied. Obviously.",
  "🚨 Intruder detected. Just kidding. Kinda.",
  "🤖 BEEP BOOP. Not today, friend.",
  "👮 Security guard has entered the chat.",
];

const EXCUSES = [
  '"I was just looking around" — You, probably',
  '"The link made me do it" — Also you',
  '"I thought I had access" — Everyone',
  '"This is clearly a mistake" — It is not',
  '"Can I speak to your manager?" — No',
  '"I clicked the wrong button" — Sure you did',
  '"I\'m a developer, I need this" — Use your own account',
];

const COUNTDOWN_MESSAGES = [
  "Initiating ejection sequence...",
  "Packing your bags...",
  "Escorting you out...",
  "Almost there...",
  "Goodbye!",
];

// ── Tests ──────────────────────────────────────────────────────────────────

describe('GUARD_LINES', () => {
  it('is an array', () => {
    expect(Array.isArray(GUARD_LINES)).toBe(true);
  });

  it('contains at least one entry', () => {
    expect(GUARD_LINES.length).toBeGreaterThanOrEqual(1);
  });

  it('all entries are non-empty strings', () => {
    for (const line of GUARD_LINES) {
      expect(typeof line).toBe('string');
      expect(line.length).toBeGreaterThan(0);
    }
  });

  it('contains exactly 5 entries', () => {
    expect(GUARD_LINES).toHaveLength(5);
  });

  it('contains the expected first entry', () => {
    expect(GUARD_LINES[0]).toBe('🛡️ HALT! Who goes there?');
  });

  it('contains the expected last entry', () => {
    expect(GUARD_LINES[GUARD_LINES.length - 1]).toBe('👮 Security guard has entered the chat.');
  });
});

describe('EXCUSES', () => {
  it('is an array', () => {
    expect(Array.isArray(EXCUSES)).toBe(true);
  });

  it('contains at least one entry', () => {
    expect(EXCUSES.length).toBeGreaterThanOrEqual(1);
  });

  it('all entries are non-empty strings', () => {
    for (const excuse of EXCUSES) {
      expect(typeof excuse).toBe('string');
      expect(excuse.length).toBeGreaterThan(0);
    }
  });

  it('contains exactly 7 entries', () => {
    expect(EXCUSES).toHaveLength(7);
  });

  it('contains the expected first entry', () => {
    expect(EXCUSES[0]).toBe('"I was just looking around" — You, probably');
  });

  it('contains developer excuse', () => {
    expect(EXCUSES.some((e) => e.includes('developer'))).toBe(true);
  });
});

describe('COUNTDOWN_MESSAGES', () => {
  it('is an array', () => {
    expect(Array.isArray(COUNTDOWN_MESSAGES)).toBe(true);
  });

  it('contains at least one entry', () => {
    expect(COUNTDOWN_MESSAGES.length).toBeGreaterThanOrEqual(1);
  });

  it('all entries are non-empty strings', () => {
    for (const msg of COUNTDOWN_MESSAGES) {
      expect(typeof msg).toBe('string');
      expect(msg.length).toBeGreaterThan(0);
    }
  });

  it('contains exactly 5 entries', () => {
    expect(COUNTDOWN_MESSAGES).toHaveLength(5);
  });

  it('starts with ejection sequence message', () => {
    expect(COUNTDOWN_MESSAGES[0]).toBe('Initiating ejection sequence...');
  });

  it('ends with Goodbye', () => {
    expect(COUNTDOWN_MESSAGES[COUNTDOWN_MESSAGES.length - 1]).toBe('Goodbye!');
  });
});

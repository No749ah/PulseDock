import { describe, it, expect } from 'vitest';
import { GUARD_LINES, EXCUSES, COUNTDOWN_MESSAGES } from './helpers';

describe('GUARD_LINES', () => {
  it('has 5 entries', () => {
    expect(GUARD_LINES).toHaveLength(5);
  });

  it('all entries are non-empty strings', () => {
    for (const line of GUARD_LINES) {
      expect(typeof line).toBe('string');
      expect(line.length).toBeGreaterThan(0);
    }
  });
});

describe('EXCUSES', () => {
  it('has 7 entries', () => {
    expect(EXCUSES).toHaveLength(7);
  });

  it('all entries are non-empty strings', () => {
    for (const excuse of EXCUSES) {
      expect(typeof excuse).toBe('string');
      expect(excuse.length).toBeGreaterThan(0);
    }
  });
});

describe('COUNTDOWN_MESSAGES', () => {
  it('has 5 entries', () => {
    expect(COUNTDOWN_MESSAGES).toHaveLength(5);
  });

  it('final message is "Goodbye!"', () => {
    expect(COUNTDOWN_MESSAGES[COUNTDOWN_MESSAGES.length - 1]).toBe('Goodbye!');
  });

  it('all entries are non-empty strings', () => {
    for (const msg of COUNTDOWN_MESSAGES) {
      expect(typeof msg).toBe('string');
      expect(msg.length).toBeGreaterThan(0);
    }
  });
});

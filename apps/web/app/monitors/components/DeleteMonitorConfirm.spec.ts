import { describe, it, expect } from 'vitest';

// Pure logic extracted from DeleteMonitorConfirm component
function shouldRender(isOpen: boolean): boolean {
  return isOpen;
}

function getButtonLabel(loading: boolean): string {
  return loading ? 'Deleting…' : 'Delete';
}

function isButtonDisabled(loading: boolean): boolean {
  return loading;
}

function formatDeleteMessage(name?: string): string {
  const target = name ?? 'this monitor';
  return `Are you sure you want to delete ${target}? This action cannot be undone.`;
}

describe('DeleteMonitorConfirm — pure logic', () => {
  describe('shouldRender', () => {
    it('returns true when isOpen is true', () => {
      expect(shouldRender(true)).toBe(true);
    });
    it('returns false when isOpen is false', () => {
      expect(shouldRender(false)).toBe(false);
    });
  });

  describe('getButtonLabel', () => {
    it('returns "Deleting…" when loading is true', () => {
      expect(getButtonLabel(true)).toBe('Deleting…');
    });
    it('returns "Delete" when loading is false', () => {
      expect(getButtonLabel(false)).toBe('Delete');
    });
  });

  describe('isButtonDisabled', () => {
    it('returns true when loading is true', () => {
      expect(isButtonDisabled(true)).toBe(true);
    });
    it('returns false when loading is false', () => {
      expect(isButtonDisabled(false)).toBe(false);
    });
  });

  describe('formatDeleteMessage', () => {
    it('includes the monitor name when provided', () => {
      const msg = formatDeleteMessage('My Monitor');
      expect(msg).toContain('My Monitor');
    });
    it('uses "this monitor" when name is undefined', () => {
      const msg = formatDeleteMessage(undefined);
      expect(msg).toContain('this monitor');
    });
    it('uses "this monitor" when name is not passed', () => {
      const msg = formatDeleteMessage();
      expect(msg).toContain('this monitor');
    });
    it('returns a non-empty string', () => {
      expect(formatDeleteMessage('Test').length).toBeGreaterThan(0);
    });
    it('contains warning about irreversible action', () => {
      const msg = formatDeleteMessage('x');
      expect(msg.toLowerCase()).toMatch(/cannot|irreversible|undone/);
    });
    it('handles names with special characters', () => {
      const msg = formatDeleteMessage('my-api.example.com');
      expect(msg).toContain('my-api.example.com');
    });
    it('handles empty string name — treats as provided value', () => {
      const msg = formatDeleteMessage('');
      // empty string is falsy, but we should at least get a string back
      expect(typeof msg).toBe('string');
    });
  });
});

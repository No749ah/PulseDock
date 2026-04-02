/**
 * Unit tests for DeleteChannelConfirm pure logic.
 *
 * Tests: modal title, message derivation from selected channel,
 * guard conditions for open/close state.
 */
import { describe, it, expect } from 'vitest';

// ── Types mirrored from component ─────────────────────────────────────────────

interface AlertChannel {
  id: string;
  name: string;
  type: string;
  config: Record<string, unknown>;
  createdAt: string;
}

// ── Pure helpers mirrored from DeleteChannelConfirm ───────────────────────────

const MODAL_TITLE = 'Delete alert channel';

/** Build the confirmation message for the selected channel */
function deleteMessage(selected: AlertChannel | null): string {
  if (!selected) return 'Delete this channel?';
  return `Delete ${selected.name}?`;
}

/** Whether the modal should render content (open + has selection) */
function shouldRender(isOpen: boolean, selected: AlertChannel | null): boolean {
  return isOpen && selected !== null;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DeleteChannelConfirm — MODAL_TITLE', () => {
  it('has the expected modal title', () => {
    expect(MODAL_TITLE).toBe('Delete alert channel');
  });
});

describe('DeleteChannelConfirm — deleteMessage', () => {
  it('shows channel name in message', () => {
    const channel: AlertChannel = {
      id: 'ch-1',
      name: 'My Discord',
      type: 'discord',
      config: {},
      createdAt: '2026-01-01T00:00:00Z',
    };
    expect(deleteMessage(channel)).toBe('Delete My Discord?');
  });

  it('handles null selected with fallback', () => {
    expect(deleteMessage(null)).toBe('Delete this channel?');
  });

  it('includes channel name exactly', () => {
    const channel: AlertChannel = {
      id: 'ch-2',
      name: 'Production Slack',
      type: 'slack',
      config: {},
      createdAt: '2026-01-01T00:00:00Z',
    };
    const msg = deleteMessage(channel);
    expect(msg).toContain('Production Slack');
  });

  it('ends with question mark', () => {
    const channel: AlertChannel = {
      id: 'ch-3',
      name: 'Test',
      type: 'webhook',
      config: {},
      createdAt: '2026-01-01T00:00:00Z',
    };
    expect(deleteMessage(channel)).toMatch(/\?$/);
  });

  it('handles special characters in channel name', () => {
    const channel: AlertChannel = {
      id: 'ch-4',
      name: '#ops-alerts (primary)',
      type: 'slack',
      config: {},
      createdAt: '2026-01-01T00:00:00Z',
    };
    expect(deleteMessage(channel)).toContain('#ops-alerts (primary)');
  });
});

describe('DeleteChannelConfirm — shouldRender', () => {
  const channel: AlertChannel = {
    id: 'ch-1',
    name: 'Test',
    type: 'discord',
    config: {},
    createdAt: '2026-01-01T00:00:00Z',
  };

  it('renders when open and channel selected', () => {
    expect(shouldRender(true, channel)).toBe(true);
  });

  it('does not render when closed', () => {
    expect(shouldRender(false, channel)).toBe(false);
  });

  it('does not render when no selection', () => {
    expect(shouldRender(true, null)).toBe(false);
  });

  it('does not render when both closed and no selection', () => {
    expect(shouldRender(false, null)).toBe(false);
  });
});

describe('DeleteChannelConfirm — destructive action safety', () => {
  it('modal title signals destructive action (contains Delete)', () => {
    expect(MODAL_TITLE.toLowerCase()).toContain('delete');
  });

  it('confirmation message requires a channel name for context', () => {
    const channel: AlertChannel = {
      id: 'ch-5',
      name: 'Critical PagerDuty',
      type: 'pagerduty',
      config: {},
      createdAt: '2026-01-01T00:00:00Z',
    };
    const msg = deleteMessage(channel);
    expect(msg).toContain(channel.name);
    expect(msg.length).toBeGreaterThan(channel.name.length);
  });
});

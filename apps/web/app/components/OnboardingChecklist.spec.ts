/**
 * Unit tests for OnboardingChecklist pure logic.
 * Tests step completion detection, dismiss key logic, and step definitions.
 */
import { describe, it, expect } from 'vitest';

// ── Step completion logic (mirrors component logic) ───────────────────────────
interface OnboardingChecklistProps {
  userId: string;
  hasMonitors: boolean;
  hasAlertChannels: boolean;
}

interface Step {
  id: string;
  label: string;
  description: string;
  done: boolean;
  href: string;
  action: string;
  note?: string;
}

const DISMISSED_KEY_PREFIX = 'pulsedock_onboarding_dismissed_';
const GLOBAL_DISMISSED_KEY = 'onboarding-dismissed';

function buildSteps(props: OnboardingChecklistProps): Step[] {
  return [
    {
      id: 'first-monitor',
      label: 'Add your first monitor',
      description: 'Track an HTTP endpoint, TCP port, or SSL certificate.',
      done: props.hasMonitors,
      href: '/monitors?new=1',
      action: 'Add monitor',
    },
    {
      id: 'alert-channel',
      label: 'Connect an alert channel',
      description: 'Get notified via Slack, Discord, email, or webhook.',
      done: props.hasAlertChannels,
      href: '/alerts',
      action: 'Connect channel',
    },
    {
      id: 'status-page',
      label: 'Create a status page',
      description: 'Share uptime with your users on a branded status page.',
      done: false,
      href: '/status-pages?new=1',
      action: 'Create page',
    },
  ];
}

function allDone(steps: Step[]): boolean {
  return steps.every((s) => s.done);
}

function completedCount(steps: Step[]): number {
  return steps.filter((s) => s.done).length;
}

function dismissedKey(userId: string): string {
  return DISMISSED_KEY_PREFIX + userId;
}

// ── Step construction ─────────────────────────────────────────────────────────
describe('OnboardingChecklist — buildSteps', () => {
  it('produces 3 steps', () => {
    const steps = buildSteps({ userId: 'u1', hasMonitors: false, hasAlertChannels: false });
    expect(steps).toHaveLength(3);
  });

  it('all step ids are unique', () => {
    const steps = buildSteps({ userId: 'u1', hasMonitors: false, hasAlertChannels: false });
    const ids = steps.map((s) => s.id);
    expect(new Set(ids).size).toBe(steps.length);
  });

  it('all steps have non-empty label and description', () => {
    const steps = buildSteps({ userId: 'u1', hasMonitors: true, hasAlertChannels: true });
    for (const step of steps) {
      expect(step.label.length).toBeGreaterThan(0);
      expect(step.description.length).toBeGreaterThan(0);
    }
  });

  it('all steps have valid href paths', () => {
    const steps = buildSteps({ userId: 'u1', hasMonitors: false, hasAlertChannels: false });
    for (const step of steps) {
      expect(step.href).toMatch(/^\//);
    }
  });
});

// ── Step done flags ───────────────────────────────────────────────────────────
describe('OnboardingChecklist — step done flags', () => {
  it('first-monitor done when hasMonitors is true', () => {
    const steps = buildSteps({ userId: 'u1', hasMonitors: true, hasAlertChannels: false });
    expect(steps.find((s) => s.id === 'first-monitor')?.done).toBe(true);
  });

  it('first-monitor not done when hasMonitors is false', () => {
    const steps = buildSteps({ userId: 'u1', hasMonitors: false, hasAlertChannels: false });
    expect(steps.find((s) => s.id === 'first-monitor')?.done).toBe(false);
  });

  it('alert-channel done when hasAlertChannels is true', () => {
    const steps = buildSteps({ userId: 'u1', hasMonitors: false, hasAlertChannels: true });
    expect(steps.find((s) => s.id === 'alert-channel')?.done).toBe(true);
  });

  it('alert-channel not done when hasAlertChannels is false', () => {
    const steps = buildSteps({ userId: 'u1', hasMonitors: false, hasAlertChannels: false });
    expect(steps.find((s) => s.id === 'alert-channel')?.done).toBe(false);
  });

  it('status-page step is never pre-done', () => {
    // status-page always starts as not done (requires user action to detect)
    const steps = buildSteps({ userId: 'u1', hasMonitors: true, hasAlertChannels: true });
    expect(steps.find((s) => s.id === 'status-page')?.done).toBe(false);
  });
});

// ── allDone helper ────────────────────────────────────────────────────────────
describe('OnboardingChecklist — allDone', () => {
  it('true when all steps are done', () => {
    const steps: Step[] = [
      { id: 'a', label: 'A', description: '', done: true, href: '/', action: '' },
      { id: 'b', label: 'B', description: '', done: true, href: '/', action: '' },
    ];
    expect(allDone(steps)).toBe(true);
  });

  it('false when at least one step is not done', () => {
    const steps: Step[] = [
      { id: 'a', label: 'A', description: '', done: true, href: '/', action: '' },
      { id: 'b', label: 'B', description: '', done: false, href: '/', action: '' },
    ];
    expect(allDone(steps)).toBe(false);
  });

  it('true for empty array', () => {
    expect(allDone([])).toBe(true);
  });
});

// ── completedCount helper ─────────────────────────────────────────────────────
describe('OnboardingChecklist — completedCount', () => {
  it('returns 0 when none done', () => {
    const steps = buildSteps({ userId: 'u1', hasMonitors: false, hasAlertChannels: false });
    expect(completedCount(steps)).toBe(0);
  });

  it('returns 1 when only monitors done', () => {
    const steps = buildSteps({ userId: 'u1', hasMonitors: true, hasAlertChannels: false });
    expect(completedCount(steps)).toBe(1);
  });

  it('returns 2 when monitors + alert channel done', () => {
    const steps = buildSteps({ userId: 'u1', hasMonitors: true, hasAlertChannels: true });
    expect(completedCount(steps)).toBe(2);
  });
});

// ── Dismiss key logic ─────────────────────────────────────────────────────────
describe('OnboardingChecklist — dismiss keys', () => {
  it('per-user key includes userId', () => {
    const key = dismissedKey('user-abc');
    expect(key).toContain('user-abc');
    expect(key).toContain(DISMISSED_KEY_PREFIX);
  });

  it('different users get different keys', () => {
    expect(dismissedKey('user1')).not.toBe(dismissedKey('user2'));
  });

  it('global dismissed key is a non-empty string', () => {
    expect(GLOBAL_DISMISSED_KEY.length).toBeGreaterThan(0);
  });

  it('global key and per-user key are distinct', () => {
    expect(dismissedKey('user1')).not.toBe(GLOBAL_DISMISSED_KEY);
  });
});

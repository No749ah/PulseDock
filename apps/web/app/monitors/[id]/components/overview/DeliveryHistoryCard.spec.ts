import { describe, it, expect } from 'vitest';
import { CHANNEL_TYPE_BADGE_COLORS, triggerLabel } from './deliveryHistoryHelpers';

describe('CHANNEL_TYPE_BADGE_COLORS', () => {
  it('has exactly 8 entries', () => {
    expect(Object.keys(CHANNEL_TYPE_BADGE_COLORS)).toHaveLength(8);
  });

  it('slack → green', () => {
    expect(CHANNEL_TYPE_BADGE_COLORS['slack']).toContain('green');
  });

  it('discord → indigo', () => {
    expect(CHANNEL_TYPE_BADGE_COLORS['discord']).toContain('indigo');
  });

  it('email → blue', () => {
    expect(CHANNEL_TYPE_BADGE_COLORS['email']).toContain('blue');
  });

  it('webhook → orange', () => {
    expect(CHANNEL_TYPE_BADGE_COLORS['webhook']).toContain('orange');
  });

  it('telegram → sky', () => {
    expect(CHANNEL_TYPE_BADGE_COLORS['telegram']).toContain('sky');
  });

  it('pagerduty → green-600', () => {
    expect(CHANNEL_TYPE_BADGE_COLORS['pagerduty']).toContain('green-600');
  });

  it('opsgenie → orange-600', () => {
    expect(CHANNEL_TYPE_BADGE_COLORS['opsgenie']).toContain('orange-600');
  });

  it('sms → emerald', () => {
    expect(CHANNEL_TYPE_BADGE_COLORS['sms']).toContain('emerald');
  });
});

describe('triggerLabel', () => {
  it('monitor_failure → "Failure"', () => {
    expect(triggerLabel('monitor_failure')).toBe('Failure');
  });

  it('monitor_recovery → "Recovery"', () => {
    expect(triggerLabel('monitor_recovery')).toBe('Recovery');
  });

  it('test → "Test"', () => {
    expect(triggerLabel('test')).toBe('Test');
  });

  it('custom_event → capitalizes first char', () => {
    expect(triggerLabel('custom_event')).toBe('Custom_event');
  });

  it('null → "—"', () => {
    expect(triggerLabel(null)).toBe('—');
  });

  it('empty string → "—"', () => {
    expect(triggerLabel('')).toBe('—');
  });

  it('alert → "Alert"', () => {
    expect(triggerLabel('alert')).toBe('Alert');
  });
});

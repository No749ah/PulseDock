import { describe, it, expect } from 'vitest';
import { isChannelActive } from './alert-channel-schedule';

const MON_FRI_9_17 = {
  enabled: true,
  timezone: 'UTC',
  days: [1, 2, 3, 4, 5], // Mon–Fri
  startHour: 9,
  endHour: 17,
};

describe('isChannelActive', () => {
  it('returns true when scheduleJson is null (no schedule = always active)', () => {
    expect(isChannelActive(null)).toBe(true);
  });

  it('returns true when schedule.enabled is false', () => {
    const schedule = { ...MON_FRI_9_17, enabled: false };
    // Use Wednesday 14:00 UTC (would be inactive if enabled were true and day not matching)
    expect(isChannelActive(schedule, new Date('2026-03-28T14:00:00Z'))).toBe(true);
  });

  it('returns true when days array is empty (fail open)', () => {
    const schedule = { ...MON_FRI_9_17, days: [] };
    expect(isChannelActive(schedule, new Date('2026-03-28T14:00:00Z'))).toBe(true);
  });

  it('returns true — active: Mon–Fri 9–17, test Wednesday 14:00 UTC', () => {
    // 2026-03-25 is Wednesday
    const wednesday14 = new Date('2026-03-25T14:00:00Z');
    expect(isChannelActive(MON_FRI_9_17, wednesday14)).toBe(true);
  });

  it('returns false — inactive: Mon–Fri 9–17, test Saturday 14:00 UTC', () => {
    // 2026-03-28 is Saturday
    const saturday14 = new Date('2026-03-28T14:00:00Z');
    expect(isChannelActive(MON_FRI_9_17, saturday14)).toBe(false);
  });

  it('returns false — inactive: Mon–Fri 9–17, test Monday 08:00 UTC (before window)', () => {
    // 2026-03-23 is Monday
    const monday08 = new Date('2026-03-23T08:00:00Z');
    expect(isChannelActive(MON_FRI_9_17, monday08)).toBe(false);
  });

  it('returns false — inactive: Mon–Fri 9–17, test Monday 17:00 UTC (endHour is exclusive)', () => {
    // 2026-03-23 is Monday
    const monday17 = new Date('2026-03-23T17:00:00Z');
    expect(isChannelActive(MON_FRI_9_17, monday17)).toBe(false);
  });

  it('timezone test: schedule 9–17 Europe/Berlin', () => {
    // Europe/Berlin is UTC+1 in winter (no DST at end of March 2026 — clocks change Mar 29)
    // Use dates clearly in winter time (before Mar 29)
    const berlinSchedule = {
      enabled: true,
      timezone: 'Europe/Berlin',
      days: [1, 2, 3, 4, 5], // Mon–Fri
      startHour: 9,
      endHour: 17,
    };

    // UTC 07:30 = 08:30 Berlin (CET, UTC+1) → inactive (before 09:00)
    // 2026-03-23 is Monday
    const utc0730 = new Date('2026-03-23T07:30:00Z');
    expect(isChannelActive(berlinSchedule, utc0730)).toBe(false);

    // UTC 08:30 = 09:30 Berlin → active
    const utc0830 = new Date('2026-03-23T08:30:00Z');
    expect(isChannelActive(berlinSchedule, utc0830)).toBe(true);
  });
});

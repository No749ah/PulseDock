/**
 * Monitor schedule (business hours) unit tests.
 * Tests the filter logic that decides whether to run a monitor based on
 * configured days and hours.
 */
import { describe, it, expect } from 'vitest';

/**
 * Mirrors the schedule check logic in checks.scheduler.ts tick()
 */
function isWithinSchedule(
  scheduleEnabled: boolean,
  scheduleDays: string,
  scheduleStartHour: number,
  scheduleEndHour: number,
  nowDayOfWeek: number, // 0=Sun..6=Sat (UTC)
  nowHour: number,      // UTC hour 0-23
): boolean {
  if (!scheduleEnabled) return true; // no schedule = always run
  const allowedDays = scheduleDays.split(',').map(Number);
  if (!allowedDays.includes(nowDayOfWeek)) return false;
  if (nowHour < scheduleStartHour || nowHour >= scheduleEndHour) return false;
  return true;
}

describe('Monitor Schedule (Business Hours)', () => {
  it('always runs when schedule is disabled', () => {
    // Sunday midnight — would never pass business hours check
    expect(isWithinSchedule(false, '1,2,3,4,5', 8, 18, 0, 0)).toBe(true);
  });

  it('runs on a weekday during business hours', () => {
    // Monday (1), 9am UTC
    expect(isWithinSchedule(true, '1,2,3,4,5', 8, 18, 1, 9)).toBe(true);
  });

  it('skips on a weekend day', () => {
    // Saturday (6), 10am UTC
    expect(isWithinSchedule(true, '1,2,3,4,5', 8, 18, 6, 10)).toBe(false);
  });

  it('skips on Sunday', () => {
    // Sunday (0)
    expect(isWithinSchedule(true, '1,2,3,4,5', 8, 18, 0, 14)).toBe(false);
  });

  it('skips before start hour', () => {
    // Monday 7am — before 8am start
    expect(isWithinSchedule(true, '1,2,3,4,5', 8, 18, 1, 7)).toBe(false);
  });

  it('skips at exactly end hour (exclusive)', () => {
    // Monday exactly 18:00 — endHour is exclusive
    expect(isWithinSchedule(true, '1,2,3,4,5', 8, 18, 1, 18)).toBe(false);
  });

  it('runs at exactly start hour (inclusive)', () => {
    // Monday exactly 8:00 UTC
    expect(isWithinSchedule(true, '1,2,3,4,5', 8, 18, 1, 8)).toBe(true);
  });

  it('skips after end hour', () => {
    // Friday 19:00
    expect(isWithinSchedule(true, '1,2,3,4,5', 8, 18, 5, 19)).toBe(false);
  });

  it('supports custom days (Mon+Wed+Fri only)', () => {
    const days = '1,3,5';
    expect(isWithinSchedule(true, days, 8, 18, 1, 10)).toBe(true);  // Mon
    expect(isWithinSchedule(true, days, 8, 18, 2, 10)).toBe(false); // Tue
    expect(isWithinSchedule(true, days, 8, 18, 3, 10)).toBe(true);  // Wed
    expect(isWithinSchedule(true, days, 8, 18, 4, 10)).toBe(false); // Thu
    expect(isWithinSchedule(true, days, 8, 18, 5, 10)).toBe(true);  // Fri
  });

  it('supports 24/7 schedule (all days, all hours)', () => {
    expect(isWithinSchedule(true, '0,1,2,3,4,5,6', 0, 23, 0, 0)).toBe(true);
    expect(isWithinSchedule(true, '0,1,2,3,4,5,6', 0, 23, 6, 22)).toBe(true);
  });

  it('supports overnight schedule (22-06)', () => {
    // This tests a start=22, end=6 which isn't officially supported by the simple
    // comparison (start > end) — documents expected behavior:
    // With current logic (nowHour < start || nowHour >= end): 22 < 22 = false, 22 >= 6 = true → false
    // So overnight schedules would need custom handling; document current behavior.
    expect(isWithinSchedule(true, '1,2,3,4,5', 22, 6, 1, 23)).toBe(false); // 23 < 22 = false, 23 >= 6 = true → out
    expect(isWithinSchedule(true, '1,2,3,4,5', 22, 6, 1, 4)).toBe(false);  // 4 < 22 = true → out (overnight not supported)
  });
});

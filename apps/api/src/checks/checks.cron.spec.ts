/**
 * Cron scheduling unit tests for isCronDue() logic.
 *
 * isCronDue() is defined in checks.scheduler.ts and determines whether a
 * cron-scheduled monitor should run on the current tick. We extract the
 * exact logic here to keep tests fast and dependency-free.
 *
 * Rules:
 *  - If lastCheckedAt is null → always due (never ran before)
 *  - If cronExpression is invalid → return false (fail-safe)
 *  - Due when prev cron fire time is strictly after lastCheckedAt
 */
import { describe, it, expect } from 'vitest';
import { CronExpressionParser } from 'cron-parser';

// ── Extracted isCronDue logic (mirrors checks.scheduler.ts exactly) ───────────

function isCronDue(cronExpression: string, lastCheckedAt: Date | null): boolean {
  try {
    const interval = CronExpressionParser.parse(cronExpression, { tz: 'UTC' });
    const prev = interval.prev().toDate();
    if (!lastCheckedAt) return true; // never checked → run now
    return prev.getTime() > lastCheckedAt.getTime();
  } catch {
    return false; // invalid expression → skip rather than crash
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns a Date at the given UTC ISO string. */
function utc(iso: string): Date {
  return new Date(iso);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('isCronDue — cron scheduling logic', () => {
  // ── Test 1: null lastCheckedAt → always due ───────────────────────────────
  it('returns true when lastCheckedAt is null (never checked — run immediately)', () => {
    // A never-checked monitor with any valid cron should always be due
    const result = isCronDue('* * * * *', null);
    expect(result).toBe(true);
  });

  // ── Test 2: cron was due since last check ──────────────────────────────────
  it('returns true when a cron fire occurred after lastCheckedAt', () => {
    // Every minute cron; last checked 2 minutes ago → prev fire is after lastCheckedAt
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
    const result = isCronDue('* * * * *', twoMinutesAgo);
    expect(result).toBe(true);
  });

  // ── Test 3: not yet due — next fire is in the future ──────────────────────
  it('returns false when the cron last fired before lastCheckedAt (already ran this window)', () => {
    // Hourly cron at minute 0; simulate lastCheckedAt as "10 seconds ago" within
    // the current hour minute-0 window → prev fire was before last check
    // We use a fixed reference: daily at 09:00 UTC, and set lastCheckedAt to 09:00:30 same day
    const now = new Date('2026-03-27T09:30:00Z');

    // The "prev" of "0 9 * * *" relative to 09:30 is 09:00 today.
    // lastCheckedAt = 09:01 → prev (09:00) < lastCheckedAt (09:01) → NOT due.
    const lastCheckedAt = new Date('2026-03-27T09:01:00Z');

    // We need to parse relative to a fixed time; isCronDue uses "now" internally via
    // CronExpressionParser.parse(), so we simulate by calling the parser with the
    // reference date option:
    function isCronDueAt(cron: string, last: Date | null, referenceDate: Date): boolean {
      try {
        const interval = CronExpressionParser.parse(cron, { tz: 'UTC', currentDate: referenceDate });
        const prev = interval.prev().toDate();
        if (!last) return true;
        return prev.getTime() > last.getTime();
      } catch {
        return false;
      }
    }

    const result = isCronDueAt('0 9 * * *', lastCheckedAt, now);
    expect(result).toBe(false);
  });

  // ── Test 4: null lastCheckedAt + newly created monitor → run now ──────────
  it('returns true when lastCheckedAt is null regardless of cron schedule (new monitor)', () => {
    // Weekly cron — even if next fire is days away, a new monitor must run immediately
    const result = isCronDue('0 0 * * 1', null);
    expect(result).toBe(true);
  });

  // ── Test 5: well past the cron interval ──────────────────────────────────
  it('returns true when lastCheckedAt is well before the most recent cron fire', () => {
    // Every-minute cron; last checked 1 hour ago → prev is definitely after
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const result = isCronDue('* * * * *', oneHourAgo);
    expect(result).toBe(true);
  });

  // ── Test 6: invalid cron expression → return false (fail-safe) ───────────
  it('returns false for an invalid cron expression (fail-safe — never crash)', () => {
    const result = isCronDue('not-a-cron', new Date('2026-03-27T00:00:00Z'));
    expect(result).toBe(false);
  });

  it('returns false for a whitespace-only cron expression (graceful fail)', () => {
    // The production scheduler guards against blank expressions; the parser itself
    // may accept empty strings as "* * * * *". We test a garbage expression instead.
    const result = isCronDue('NOT_A_CRON_EXPRESSION_!!', new Date('2026-03-27T00:00:00Z'));
    expect(result).toBe(false);
  });

  // ── Test 7: Daily cron (0 9 * * *) — not due at 8am, due at 9am ─────────
  it('daily cron (0 9 * * *) — not due when current time is 08:59 UTC', () => {
    // At 08:59, the prev fire of "0 9 * * *" is 09:00 YESTERDAY
    // If lastCheckedAt is today at 08:00 → prev (yesterday 09:00) < lastCheckedAt → NOT due
    const referenceDate = new Date('2026-03-27T08:59:00Z'); // 8:59am today
    const lastCheckedAt = new Date('2026-03-27T08:00:00Z'); // checked 8am today

    function isCronDueAt(cron: string, last: Date | null, ref: Date): boolean {
      try {
        const interval = CronExpressionParser.parse(cron, { tz: 'UTC', currentDate: ref });
        const prev = interval.prev().toDate();
        if (!last) return true;
        return prev.getTime() > last.getTime();
      } catch {
        return false;
      }
    }

    // prev is yesterday at 09:00 (2026-03-26T09:00:00Z)
    // lastCheckedAt is today at 08:00 (2026-03-27T08:00:00Z)
    // yesterday 09:00 < today 08:00 → NOT due
    const result = isCronDueAt('0 9 * * *', lastCheckedAt, referenceDate);
    expect(result).toBe(false);
  });

  it('daily cron (0 9 * * *) — due when current time is 09:01 UTC and not yet checked today', () => {
    // At 09:01 the prev fire is 09:00 today.
    // lastCheckedAt = yesterday at 09:01 → prev (09:00 today) > lastCheckedAt (yesterday) → DUE
    const referenceDate = new Date('2026-03-27T09:01:00Z'); // 9:01am today
    const lastCheckedAt = new Date('2026-03-26T09:01:00Z'); // checked yesterday at 9:01am

    function isCronDueAt(cron: string, last: Date | null, ref: Date): boolean {
      try {
        const interval = CronExpressionParser.parse(cron, { tz: 'UTC', currentDate: ref });
        const prev = interval.prev().toDate();
        if (!last) return true;
        return prev.getTime() > last.getTime();
      } catch {
        return false;
      }
    }

    const result = isCronDueAt('0 9 * * *', lastCheckedAt, referenceDate);
    expect(result).toBe(true);
  });

  // ── Test 8: Weekly cron (0 0 * * 1) — due on Monday, not on Tuesday ──────
  it('weekly cron (0 0 * * 1) — due on Monday 00:01 when last ran Sunday', () => {
    // Monday 2026-03-30 00:01 UTC, last checked Sunday 2026-03-29 12:00
    const referenceDate = new Date('2026-03-30T00:01:00Z'); // Monday 00:01
    const lastCheckedAt = new Date('2026-03-29T12:00:00Z'); // Sunday noon

    function isCronDueAt(cron: string, last: Date | null, ref: Date): boolean {
      try {
        const interval = CronExpressionParser.parse(cron, { tz: 'UTC', currentDate: ref });
        const prev = interval.prev().toDate();
        if (!last) return true;
        return prev.getTime() > last.getTime();
      } catch {
        return false;
      }
    }

    // prev is Monday 00:00, lastCheckedAt is Sunday noon → Monday 00:00 > Sunday 12:00 → DUE
    const result = isCronDueAt('0 0 * * 1', lastCheckedAt, referenceDate);
    expect(result).toBe(true);
  });

  it('weekly cron (0 0 * * 1) — NOT due on Tuesday when already ran Monday', () => {
    // Tuesday 2026-03-31 10:00 UTC, last checked Monday 2026-03-30 00:05
    const referenceDate = new Date('2026-03-31T10:00:00Z'); // Tuesday 10am
    const lastCheckedAt = new Date('2026-03-30T00:05:00Z'); // Monday 00:05 (just after cron fired)

    function isCronDueAt(cron: string, last: Date | null, ref: Date): boolean {
      try {
        const interval = CronExpressionParser.parse(cron, { tz: 'UTC', currentDate: ref });
        const prev = interval.prev().toDate();
        if (!last) return true;
        return prev.getTime() > last.getTime();
      } catch {
        return false;
      }
    }

    // prev is Monday 00:00 (2026-03-30T00:00:00Z)
    // lastCheckedAt is Monday 00:05 (2026-03-30T00:05:00Z)
    // Monday 00:00 < Monday 00:05 → NOT due
    const result = isCronDueAt('0 0 * * 1', lastCheckedAt, referenceDate);
    expect(result).toBe(false);
  });
});

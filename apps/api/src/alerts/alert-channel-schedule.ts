/**
 * Schedule configuration for an alert channel.
 * When enabled=true and the current time is NOT within the window, alerts are suppressed.
 */
export interface AlertChannelSchedule {
  enabled: boolean;
  /** IANA timezone string, e.g. "Europe/Berlin", "America/New_York", "UTC" */
  timezone: string;
  /** Day-of-week array. 0=Sunday, 1=Monday, ..., 6=Saturday */
  days: number[];
  /** Start hour in the timezone (0–23, inclusive) */
  startHour: number;
  /** End hour in the timezone (0–23, exclusive — so 17 means up to 16:59) */
  endHour: number;
}

/**
 * Returns true if the channel is currently active (should send alerts).
 * Returns true when:
 * - scheduleJson is null (no schedule = always active)
 * - schedule.enabled is false
 * - current time is within the schedule window
 */
export function isChannelActive(scheduleJson: unknown, now = new Date()): boolean {
  if (!scheduleJson || typeof scheduleJson !== 'object') return true;
  const schedule = scheduleJson as AlertChannelSchedule;
  if (!schedule.enabled) return true;
  if (!schedule.days || schedule.days.length === 0) return true;

  // Parse current time in the configured timezone
  // Use Intl.DateTimeFormat to get local hour and day-of-week
  try {
    const tz = schedule.timezone || 'UTC';
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      weekday: 'short',
      hour: 'numeric',
      hour12: false,
    }).formatToParts(now);

    const weekdayMap: Record<string, number> = {
      Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
    };
    const weekdayPart = parts.find(p => p.type === 'weekday');
    const hourPart = parts.find(p => p.type === 'hour');

    if (!weekdayPart || !hourPart) return true; // fallback: allow

    const currentDay = weekdayMap[weekdayPart.value];
    const currentHour = parseInt(hourPart.value, 10) % 24; // hour12: false may return 24 for midnight

    if (!schedule.days.includes(currentDay)) return false;
    if (currentHour < schedule.startHour) return false;
    if (currentHour >= schedule.endHour) return false;

    return true;
  } catch {
    return true; // on parse error, fail open
  }
}

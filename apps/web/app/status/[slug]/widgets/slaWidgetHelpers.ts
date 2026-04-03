/** Format minutes into human-readable downtime string (e.g. "1h 30m", "45m", "30s"). */
export function formatMinutes(min: number): string {
  if (min < 1) return `${Math.round(min * 60)}s`;
  if (min < 60) return `${Math.round(min)}m`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/** Compute error budget used percentage (0–100), or null if data unavailable. */
export function computeBudgetUsed(
  allowedDownMin: number | null,
  remainingDownMin: number | null,
): number | null {
  if (allowedDownMin === null || remainingDownMin === null || allowedDownMin <= 0) return null;
  return Math.min(100, Math.round(((allowedDownMin - remainingDownMin) / allowedDownMin) * 100));
}

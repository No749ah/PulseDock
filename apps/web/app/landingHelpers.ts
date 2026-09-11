export type LandingStatus = 'up' | 'warning' | 'down';

export const STATUS_DOT_COLORS: Record<LandingStatus, string> = {
  up: 'bg-success',
  warning: 'bg-warning',
  down: 'bg-danger',
};

/** Returns the Tailwind CSS class for a status indicator dot. */
export function statusDotColor(status: LandingStatus): string {
  return STATUS_DOT_COLORS[status];
}

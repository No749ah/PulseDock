export type DotStatus = "up" | "warning" | "down";

export const STATUS_DOT_COLORS: Record<DotStatus, string> = {
  up: "bg-success",
  warning: "bg-warning",
  down: "bg-danger",
};

export function statusDotColor(status: DotStatus): string {
  return STATUS_DOT_COLORS[status];
}

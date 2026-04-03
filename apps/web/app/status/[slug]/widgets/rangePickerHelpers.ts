export const RANGES = [
  { label: "24h", value: "24h" },
  { label: "7d", value: "7d" },
  { label: "30d", value: "30d" },
  { label: "90d", value: "90d" },
] as const;

export type RangeValue = typeof RANGES[number]["value"];

export function isValidRange(value: string): value is RangeValue {
  return (RANGES as readonly { value: string }[]).some((r) => r.value === value);
}

export function getDefaultRange(): RangeValue {
  return "24h";
}

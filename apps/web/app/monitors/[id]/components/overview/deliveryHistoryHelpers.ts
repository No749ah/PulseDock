export const CHANNEL_TYPE_BADGE_COLORS: Record<string, string> = {
  slack: "bg-green-500/15 text-green-400 border-green-500/30",
  discord: "bg-indigo-500/15 text-indigo-400 border-indigo-500/30",
  email: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  webhook: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  telegram: "bg-sky-500/15 text-sky-400 border-sky-500/30",
  pagerduty: "bg-green-600/15 text-green-500 border-green-600/30",
  opsgenie: "bg-orange-600/15 text-orange-500 border-orange-600/30",
  sms: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
};

export function triggerLabel(trigger: string | null): string {
  if (trigger === "monitor_failure") return "Failure";
  if (trigger === "monitor_recovery") return "Recovery";
  if (trigger === "test") return "Test";
  if (trigger) return trigger.charAt(0).toUpperCase() + trigger.slice(1);
  return "—";
}

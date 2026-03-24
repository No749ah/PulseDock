export const inputClass =
  "w-full px-4 py-3 bg-surface-elevated border border-border rounded-lg text-text-primary placeholder-text-secondary focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent";

export const CHANNEL_TYPE_COLORS: Record<string, string> = {
  discord: "text-indigo-400",
  slack: "text-green-400",
  webhook: "text-blue-400",
  telegram: "text-sky-400",
  email: "text-yellow-400",
};

export const NOTIFY_ON_LABELS: Record<string, string> = {
  ON_CHANGE:     "On status change",
  ALWAYS:        "Every failed check",
  FIRST_ONLY:    "First failure only",
  DAILY_DIGEST:  "Daily digest",
  VERSION_ANY:   "Any update",
  VERSION_MAJOR: "Major updates only",
};

export const UPTIME_NOTIFY_OPTIONS = [
  { value: "ON_CHANGE",    label: "On status change" },
  { value: "ALWAYS",       label: "Every failed check" },
  { value: "FIRST_ONLY",   label: "First failure only" },
  { value: "DAILY_DIGEST", label: "Daily digest (max 1/day)" },
];

export const VERSION_NOTIFY_OPTIONS = [
  { value: "VERSION_ANY",   label: "Any update (minor + major)" },
  { value: "VERSION_MAJOR", label: "Major updates only" },
];

export const MONITOR_TYPES = ["HTTP", "TCP", "SSL_CERT", "HEARTBEAT", "DNS", "PING", "SMTP", "GIT_RELEASE", "DOCKER_IMAGE", "BROWSER"] as const;

export const DEFAULT_FORM_DATA = {
  name: "",
  description: "",
  type: "HTTP" as const,
  target: "",
  intervalSec: 60,
  confirmations: 1,
  enabled: true,
  pluginId: "",
  expectedText: "",
  heartbeatTimeoutMin: 5,
  heartbeatToken: "",
  folderId: "",
  slaTarget: "" as number | "",
  slaPeriodDays: 30,
};

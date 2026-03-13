/**
 * Format a date as relative time (e.g. "2m ago") for recent items,
 * falling back to a short date string for older items.
 */
export function relativeTime(date: string | Date | null | undefined): string {
  if (!date) return "—";
  const diff = Date.now() - new Date(date).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 5) return "just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(date).toLocaleDateString();
}

/**
 * Format a monitor type enum to a human-readable label.
 */
export function formatMonitorType(type: string): string {
  const map: Record<string, string> = {
    HTTP: "HTTP Check",
    GIT_RELEASE: "Git Release",
    DOCKER_IMAGE: "Docker Image",
  };
  return map[type] ?? type;
}

/**
 * Parse a raw user-agent string into a readable device/browser label.
 */
export function parseUserAgent(ua: string | null | undefined): string {
  if (!ua) return "Unknown device";
  if (ua.includes("Edg/")) return "Microsoft Edge";
  if (ua.includes("Chrome")) return "Chrome Browser";
  if (ua.includes("Firefox")) return "Firefox Browser";
  if (ua.includes("Safari")) return "Safari Browser";
  if (ua.includes("curl")) return "API Client (curl)";
  if (ua.includes("python")) return "Python Client";
  if (ua.includes("node")) return "Node.js Client";
  return ua.length > 50 ? ua.slice(0, 50) + "…" : ua;
}

/**
 * Get the target input placeholder based on monitor type.
 */
export function targetPlaceholder(type: string): string {
  switch (type) {
    case "GIT_RELEASE": return "owner/repo  (e.g. vercel/next.js)";
    case "DOCKER_IMAGE": return "image:tag  (e.g. nginx:latest)";
    default: return "https://api.example.com/health";
  }
}

/**
 * Get the helper text below the target input based on monitor type.
 */
export function targetHelperText(type: string): string {
  switch (type) {
    case "GIT_RELEASE": return "Monitors the latest GitHub release tag for this repository.";
    case "DOCKER_IMAGE": return "Tracks new tags published to Docker Hub for this image.";
    default: return "PulseDock will send an HTTP request to this URL and check the response.";
  }
}

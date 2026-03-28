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
    TCP: "TCP Port",
    SSL_CERT: "SSL Certificate",
    HEARTBEAT: "Heartbeat",
    DNS: "DNS Lookup",
    PING: "ICMP Ping",
    SMTP: "SMTP Email",
    BROWSER: "Browser Check",
    WHOIS: "WHOIS / Domain",
    CT_LOG: "CT Log Monitor",
    FTP: "FTP Check",
    IMAP: "IMAP Check",
    POP3: "POP3 Check",
    GRAPHQL: "GraphQL API",
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
    case "TCP": return "host:port  (e.g. db.example.com:5432)";
    case "SSL_CERT": return "example.com or https://example.com";
    case "HEARTBEAT": return "heartbeat-worker";
    case "DNS": return "example.com or example.com:A";
    case "PING": return "example.com or 192.168.1.1";
    case "SMTP": return "mail.example.com:25 or smtp.example.com:587";
    case "FTP": return "ftp.example.com:21";
    case "IMAP": return "mail.example.com:143 or mail.example.com:993";
    case "POP3": return "mail.example.com:110 or mail.example.com:995";
    case "BROWSER": return "https://example.com";
    case "WHOIS": return "example.com";
    case "CT_LOG": return "example.com";
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
    case "TCP": return "PulseDock opens a TCP connection to host:port and reports connection failures.";
    case "SSL_CERT": return "Checks TLS certificate expiration and warns before expiry.";
    case "HEARTBEAT": return "Used as a monitor label. Use the generated ping URL to report health from your job.";
    case "DNS": return "Resolves the hostname and optionally checks the record type (A, AAAA, MX, TXT, CNAME).";
    case "PING": return "Sends ICMP echo requests and reports latency and packet loss.";
    case "SMTP": return "Connects to the mail server, reads the 220 banner, and optionally tests STARTTLS.";
    case "BROWSER": return "Fetches the page with a browser-like User-Agent. Optionally assert expected text or CSS selector presence.";
    case "WHOIS": return "Queries the WHOIS registry for the domain expiry date. Alerts when expiry is approaching.";
    case "CT_LOG": return "Monitors Certificate Transparency logs via crt.sh. Detects new certificates issued for your domain.";
    default: return "PulseDock will send an HTTP request to this URL and check the response.";
  }
}

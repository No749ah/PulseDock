export function parseVersionFromMessage(msg: string | null): { current: string | null; latest: string | null } {
  if (!msg) return { current: null, latest: null };
  const m = msg.match(/current\s+([^\s,]+)[,\s]+latest\s+([^\s,]+)/i);
  return m ? { current: m[1], latest: m[2] } : { current: null, latest: null };
}

export function classifyVersionDiff(current: string, latest: string): "up-to-date" | "patch" | "minor" | "major" {
  const c = current.replace(/^v/i, "").split(".");
  const l = latest.replace(/^v/i, "").split(".");
  if (c[0] !== l[0]) return "major";
  if (c[1] !== l[1]) return "minor";
  if (c[2] !== l[2]) return "patch";
  return "up-to-date";
}

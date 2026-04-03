export const METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH"] as const;
export type PlaygroundMethod = typeof METHODS[number];

export function statusColor(code: number): string {
  if (code >= 200 && code < 300) return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
  if (code >= 300 && code < 400) return "bg-amber-500/20 text-amber-400 border-amber-500/30";
  return "bg-red-500/20 text-red-400 border-red-500/30";
}

export function hasBody(method: string): boolean {
  return ["POST", "PUT", "PATCH"].includes(method);
}

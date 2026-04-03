/** Map an Apdex rating string to a Tailwind text color class. */
export function apdexRatingColor(rating: string | null | undefined): string {
  if (rating === "Excellent") return "text-green-400";
  if (rating === "Good") return "text-blue-400";
  if (rating === "Fair") return "text-yellow-400";
  if (rating === "Poor") return "text-orange-400";
  return "text-red-400";
}

/** Compute a percentage share (0–100) given a part and a total. Returns 0 when total is 0. */
export function computeSharePct(part: number, total: number): number {
  if (total === 0) return 0;
  return (part / total) * 100;
}

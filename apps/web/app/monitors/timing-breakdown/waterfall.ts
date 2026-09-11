export type Phase = 'dns' | 'tcp' | 'tls' | 'ttfb' | 'download';

export type WaterfallSegment = {
  phase: Phase;
  ms: number;
  pct: number;
};

export function computeWaterfallSegments(
  phases: Array<[Phase, number | null]>,
  totalMs: number | null,
): WaterfallSegment[] {
  const positive = phases.flatMap(([phase, ms]) => {
    if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) return [];
    return [{ phase, ms }];
  });

  if (positive.length === 0) return [];

  const phaseSum = positive.reduce((sum, phase) => sum + phase.ms, 0);
  const validTotal = typeof totalMs === 'number' && Number.isFinite(totalMs) && totalMs > 0
    ? totalMs
    : 0;
  const safeTotal = Math.max(validTotal, phaseSum, 1);

  const segments: WaterfallSegment[] = positive.map((phase) => ({
    ...phase,
    pct: Math.min(100, Math.max(1, Math.round((phase.ms / safeTotal) * 100))),
  }));

  let overflow = segments.reduce((sum, segment) => sum + segment.pct, 0) - 100;
  while (overflow > 0) {
    let changed = false;
    const byLargestFirst = [...segments].sort((a, b) => b.pct - a.pct);
    for (const segment of byLargestFirst) {
      if (overflow === 0) break;
      if (segment.pct > 1) {
        segment.pct -= 1;
        overflow -= 1;
        changed = true;
      }
    }

    if (!changed) break;
  }

  return segments;
}

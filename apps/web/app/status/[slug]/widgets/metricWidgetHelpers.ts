/** Returns the gauge needle color based on value vs thresholds. */
export function gaugeColor(value: number, thresholds: { green: number; yellow: number }): string {
  if (value >= thresholds.green) return '#4ade80';
  if (value >= thresholds.yellow) return '#facc15';
  return '#f87171';
}

/** Clamp a gauge value to [0, 100]. */
export function clampGaugeValue(value: number): number {
  return Math.min(Math.max(value, 0), 100);
}

/** Convert polar coordinates to {x, y} for SVG gauge arc. */
export function polarToXY(angle: number, r: number, cx: number, cy: number): { x: number; y: number } {
  return {
    x: cx + r * Math.cos(angle),
    y: cy - r * Math.sin(angle),
  };
}

/** Build an SVG arc path string from fromAngle to toAngle at radius r. */
export function arcPath(fromAngle: number, toAngle: number, r: number, cx: number, cy: number): string {
  const start = polarToXY(fromAngle, r, cx, cy);
  const end = polarToXY(toAngle, r, cx, cy);
  const largeArc = fromAngle - toAngle > Math.PI ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

/** Returns the stroke color for a ProgressRing based on color variant. */
export function progressRingStrokeColor(color: 'green' | 'yellow' | 'red'): string {
  if (color === 'green') return '#4ade80';
  if (color === 'yellow') return '#facc15';
  return '#f87171';
}

/** Computes the SVG strokeDashoffset for a progress ring at given percentage. */
export function progressRingDashOffset(pct: number, radius: number): number {
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(100, Math.max(0, pct));
  return circumference * (1 - clamped / 100);
}

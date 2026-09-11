/** Returns the ring/bg/text colors for a dependency map node level. */
export function dependencyMapLevelColor(lvl: string): { ring: string; bg: string; text: string } {
  if (lvl === 'green') return { ring: '#4ade80', bg: '#052e16', text: '#4ade80' };
  if (lvl === 'yellow') return { ring: '#facc15', bg: '#1c1a00', text: '#facc15' };
  return { ring: '#f87171', bg: '#2d0a0a', text: '#f87171' };
}

/** Calculate the number of columns for a grid of N nodes. */
export function computeGridCols(nodeCount: number): number {
  return Math.ceil(Math.sqrt(nodeCount || 1));
}

/** Compute grid position for a node at index i with given cols. */
export function computeNodePosition(
  index: number,
  cols: number,
  nodeW: number,
  nodeH: number,
  colGap: number,
  rowGap: number,
  offsetX = 20,
  offsetY = 20,
): { x: number; y: number } {
  return {
    x: (index % cols) * (nodeW + colGap) + offsetX,
    y: Math.floor(index / cols) * (nodeH + rowGap) + offsetY,
  };
}

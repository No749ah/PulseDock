export type MonitorStatus = 'up' | 'down' | 'degraded' | 'paused' | 'no-data';

interface LayoutNode {
  id: string;
}

interface LayoutEdge {
  source: string;
  target: string;
}

export function computeLayout(nodes: LayoutNode[], edges: LayoutEdge[]): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  if (nodes.length === 0) return positions;

  const NODE_W = 180;
  const NODE_H = 60;
  const H_GAP = 80;
  const V_GAP = 50;

  const layers = new Map<string, number>();
  const nodeIds = new Set(nodes.map((n) => n.id));

  const edgesOut = new Map<string, Set<string>>();
  const edgesIn = new Map<string, Set<string>>();

  for (const node of nodes) {
    edgesOut.set(node.id, new Set());
    edgesIn.set(node.id, new Set());
  }

  for (const edge of edges) {
    if (nodeIds.has(edge.source) && nodeIds.has(edge.target)) {
      edgesOut.get(edge.source)?.add(edge.target);
      edgesIn.get(edge.target)?.add(edge.source);
    }
  }

  const queue: string[] = [];
  for (const node of nodes) {
    const inCount = edgesIn.get(node.id)?.size ?? 0;
    if (inCount === 0) {
      layers.set(node.id, 0);
      queue.push(node.id);
    }
  }

  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    const currentLayer = layers.get(nodeId) ?? 0;
    for (const target of edgesOut.get(nodeId) ?? []) {
      const existingLayer = layers.get(target) ?? 0;
      const newLayer = Math.max(existingLayer, currentLayer + 1);
      layers.set(target, newLayer);
      queue.push(target);
    }
  }

  for (const node of nodes) {
    if (!layers.has(node.id)) {
      layers.set(node.id, 0);
    }
  }

  const byLayer = new Map<number, string[]>();
  const maxLayer = Math.max(...Array.from(layers.values()), 0);
  for (let i = 0; i <= maxLayer; i++) byLayer.set(i, []);
  for (const [id, layer] of layers) {
    byLayer.get(layer)?.push(id);
  }

  for (let layer = 0; layer <= maxLayer; layer++) {
    const layerNodes = byLayer.get(layer) ?? [];
    const totalH = layerNodes.length * NODE_H + (layerNodes.length - 1) * V_GAP;
    let startY = -totalH / 2;
    for (const id of layerNodes) {
      positions.set(id, {
        x: layer * (NODE_W + H_GAP),
        y: startY,
      });
      startY += NODE_H + V_GAP;
    }
  }

  return positions;
}

export function statusColor(status: MonitorStatus): string {
  switch (status) {
    case 'up':
      return '#22c55e';
    case 'degraded':
      return '#eab308';
    case 'down':
      return '#ef4444';
    case 'paused':
      return '#6b7280';
    case 'no-data':
      return '#374151';
    default:
      return '#374151';
  }
}

export function statusBg(status: MonitorStatus): string {
  switch (status) {
    case 'up':
      return '#052e16';
    case 'degraded':
      return '#1c1400';
    case 'down':
      return '#1c0000';
    case 'paused':
      return '#111827';
    case 'no-data':
      return '#111827';
    default:
      return '#111827';
  }
}

export function statusTextClass(status: MonitorStatus): string {
  switch (status) {
    case 'up':
      return 'text-green-400';
    case 'degraded':
      return 'text-yellow-400';
    case 'down':
      return 'text-red-400';
    case 'paused':
      return 'text-gray-400';
    case 'no-data':
      return 'text-gray-500';
  }
}

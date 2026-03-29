'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Activity, AlertTriangle, ArrowRight, CheckCircle2, GitBranch, Info, Layers, Pause, RefreshCw, XCircle, ZapOff } from 'lucide-react';
import { AppFrame } from '../../../components/app-frame';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Badge } from '../../components/Badge';
import { getUser } from '../../../components/auth';
import { api } from '../../../lib/api';
import { useToast } from '../../../components/ui/toast';

// ─── Types ────────────────────────────────────────────────────────────────────

type MonitorStatus = 'up' | 'down' | 'degraded' | 'paused' | 'no-data';

interface GraphNode {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
  folderId: string | null;
  folderName: string | null;
  status: MonitorStatus;
  latencyMs: number | null;
  uptimePct7d: number | null;
  isMuted: boolean;
  inDegree: number;
  outDegree: number;
}

interface GraphEdge {
  source: string;
  target: string;
}

interface DependencyGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  summary: {
    totalMonitors: number;
    totalEdges: number;
    isolatedNodes: number;
    monitorsByStatus: { up: number; down: number; degraded: number; paused: number; noData: number };
  };
  generatedAt: string;
}

// ─── Layout Algorithm ─────────────────────────────────────────────────────────

function computeLayout(nodes: GraphNode[], edges: GraphEdge[]): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  if (nodes.length === 0) return positions;

  const NODE_W = 180;
  const NODE_H = 60;
  const H_GAP = 80;
  const V_GAP = 50;

  // Compute layers: nodes with no dependencies (nothing they depend on) are at layer 0
  const layers = new Map<string, number>();
  const nodeIds = new Set(nodes.map(n => n.id));

  // outDegree > 0 means this node depends on others (target)
  // Find root nodes: those that are not depended upon by anyone (inDegree == 0) but have outDegree
  // Actually layer by: roots = no dependencies (outDegree === 0 or no outgoing edges)
  // leaf = depends on others (has outgoing edges)

  // Simple topological layering
  const edgesOut = new Map<string, Set<string>>(); // source → targets
  const edgesIn = new Map<string, Set<string>>();  // target → sources

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

  // BFS layering from nodes with no incoming edges
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

  // Assign remaining unvisited nodes to layer 0
  for (const node of nodes) {
    if (!layers.has(node.id)) {
      layers.set(node.id, 0);
    }
  }

  // Group by layer
  const byLayer = new Map<number, string[]>();
  const maxLayer = Math.max(...Array.from(layers.values()), 0);
  for (let i = 0; i <= maxLayer; i++) byLayer.set(i, []);
  for (const [id, layer] of layers) {
    byLayer.get(layer)?.push(id);
  }

  // Position nodes
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

// ─── Colors ───────────────────────────────────────────────────────────────────

function statusColor(status: MonitorStatus): string {
  switch (status) {
    case 'up': return '#22c55e';
    case 'degraded': return '#eab308';
    case 'down': return '#ef4444';
    case 'paused': return '#6b7280';
    case 'no-data': return '#374151';
    default: return '#374151';
  }
}

function statusBg(status: MonitorStatus): string {
  switch (status) {
    case 'up': return '#052e16';
    case 'degraded': return '#1c1400';
    case 'down': return '#1c0000';
    case 'paused': return '#111827';
    case 'no-data': return '#111827';
    default: return '#111827';
  }
}

function statusTextClass(status: MonitorStatus): string {
  switch (status) {
    case 'up': return 'text-green-400';
    case 'degraded': return 'text-yellow-400';
    case 'down': return 'text-red-400';
    case 'paused': return 'text-gray-400';
    case 'no-data': return 'text-gray-500';
  }
}

const statusIcon: Record<MonitorStatus, React.FC<{ className?: string }>> = {
  up: CheckCircle2,
  degraded: AlertTriangle,
  down: XCircle,
  paused: Pause,
  'no-data': Activity,
};

// ─── SVG Graph ────────────────────────────────────────────────────────────────

const NODE_W = 180;
const NODE_H = 60;

function DependencyGraphSVG({
  nodes,
  edges,
  positions,
  hoveredId,
  onHover,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  positions: Map<string, { x: number; y: number }>;
  hoveredId: string | null;
  onHover: (id: string | null) => void;
}) {
  if (nodes.length === 0) return null;

  // Compute SVG bounds
  const allPos = Array.from(positions.values());
  const minX = Math.min(...allPos.map(p => p.x)) - 40;
  const minY = Math.min(...allPos.map(p => p.y)) - 40;
  const maxX = Math.max(...allPos.map(p => p.x + NODE_W)) + 40;
  const maxY = Math.max(...allPos.map(p => p.y + NODE_H)) + 40;
  const width = maxX - minX;
  const height = maxY - minY;

  // Determine highlight set for hovered node
  const highlightSources = new Set<string>(); // nodes that depend on hovered
  const highlightTargets = new Set<string>(); // nodes that hovered depends on
  if (hoveredId) {
    for (const edge of edges) {
      if (edge.source === hoveredId) highlightTargets.add(edge.target);
      if (edge.target === hoveredId) highlightSources.add(edge.source);
    }
  }

  const isHighlighted = (nodeId: string) =>
    hoveredId === null ||
    nodeId === hoveredId ||
    highlightSources.has(nodeId) ||
    highlightTargets.has(nodeId);

  return (
    <svg
      viewBox={`${minX} ${minY} ${width} ${height}`}
      style={{ width: '100%', height: Math.max(height, 300) }}
      className="overflow-visible"
    >
      <defs>
        <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
          <polygon points="0 0, 8 3, 0 6" fill="#4b5563" />
        </marker>
        <marker id="arrowhead-active" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
          <polygon points="0 0, 8 3, 0 6" fill="#6366f1" />
        </marker>
        <marker id="arrowhead-down" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
          <polygon points="0 0, 8 3, 0 6" fill="#ef4444" />
        </marker>
      </defs>

      {/* Edges */}
      {edges.map((edge, i) => {
        const srcPos = positions.get(edge.source);
        const tgtPos = positions.get(edge.target);
        if (!srcPos || !tgtPos) return null;

        const x1 = srcPos.x + NODE_W;
        const y1 = srcPos.y + NODE_H / 2;
        const x2 = tgtPos.x;
        const y2 = tgtPos.y + NODE_H / 2;
        const cx = (x1 + x2) / 2;

        const isEdgeActive = hoveredId && (edge.source === hoveredId || edge.target === hoveredId);
        const srcNode = nodes.find(n => n.id === edge.source);
        const tgtNode = nodes.find(n => n.id === edge.target);
        const isDownEdge = tgtNode?.status === 'down' || tgtNode?.status === 'degraded';

        const opacity = hoveredId && !isEdgeActive ? 0.15 : 1;
        const strokeColor = isEdgeActive
          ? (isDownEdge ? '#ef4444' : '#6366f1')
          : '#374151';
        const markerId = isEdgeActive
          ? (isDownEdge ? 'arrowhead-down' : 'arrowhead-active')
          : 'arrowhead';

        return (
          <path
            key={i}
            d={`M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`}
            fill="none"
            stroke={strokeColor}
            strokeWidth={isEdgeActive ? 2 : 1.5}
            strokeDasharray={isDownEdge && isEdgeActive ? '5,3' : undefined}
            markerEnd={`url(#${markerId})`}
            opacity={opacity}
            style={{ transition: 'opacity 0.15s, stroke 0.15s' }}
          />
        );
        void srcNode;
      })}

      {/* Nodes */}
      {nodes.map(node => {
        const pos = positions.get(node.id);
        if (!pos) return null;

        const color = statusColor(node.status);
        const bg = statusBg(node.status);
        const opacity = isHighlighted(node.id) ? 1 : 0.3;
        const isHovered = hoveredId === node.id;
        const isSource = highlightSources.has(node.id);
        const isTarget = highlightTargets.has(node.id);

        return (
          <g
            key={node.id}
            transform={`translate(${pos.x}, ${pos.y})`}
            style={{ cursor: 'pointer', opacity, transition: 'opacity 0.15s' }}
            onMouseEnter={() => onHover(node.id)}
            onMouseLeave={() => onHover(null)}
          >
            {/* Node background */}
            <rect
              x={0}
              y={0}
              width={NODE_W}
              height={NODE_H}
              rx={8}
              fill={bg}
              stroke={isHovered ? color : (isSource ? '#ef4444' : isTarget ? '#6366f1' : color)}
              strokeWidth={isHovered ? 2.5 : (isSource || isTarget ? 2 : 1.5)}
            />
            {/* Status indicator bar */}
            <rect x={0} y={0} width={4} height={NODE_H} rx={4} fill={color} />

            {/* Monitor name */}
            <text
              x={14}
              y={22}
              fill="#f9fafb"
              fontSize={11}
              fontWeight="600"
              fontFamily="Inter, system-ui, sans-serif"
              style={{ userSelect: 'none' }}
            >
              {node.name.length > 20 ? node.name.slice(0, 19) + '…' : node.name}
            </text>

            {/* Type + status */}
            <text
              x={14}
              y={38}
              fill="#9ca3af"
              fontSize={9}
              fontFamily="Inter, system-ui, sans-serif"
              style={{ userSelect: 'none' }}
            >
              {node.type.replace('_', ' ')}
            </text>

            {/* Latency / uptime */}
            {node.uptimePct7d !== null && (
              <text
                x={14}
                y={52}
                fill={node.uptimePct7d >= 99 ? '#22c55e' : node.uptimePct7d >= 95 ? '#eab308' : '#ef4444'}
                fontSize={9}
                fontFamily="Inter, system-ui, sans-serif"
                style={{ userSelect: 'none' }}
              >
                {node.uptimePct7d.toFixed(1)}% 7d
              </text>
            )}

            {/* Blast radius badge (inDegree) */}
            {node.inDegree > 0 && (
              <g transform={`translate(${NODE_W - 22}, 4)`}>
                <circle cx={9} cy={9} r={9} fill="#dc2626" />
                <text x={9} y={13} textAnchor="middle" fill="white" fontSize={8} fontWeight="bold" fontFamily="Inter" style={{ userSelect: 'none' }}>
                  {node.inDegree}
                </text>
              </g>
            )}

            {/* Muted indicator */}
            {node.isMuted && (
              <text x={NODE_W - 16} y={NODE_H - 5} fill="#6b7280" fontSize={10} style={{ userSelect: 'none' }}>🔇</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ─── Isolated Nodes Grid ─────────────────────────────────────────────────────

function IsolatedNodeCard({ node }: { node: GraphNode }) {
  const StatusIcon = statusIcon[node.status];
  return (
    <Link href={`/monitors/${node.id}`}>
      <div className={`rounded-lg border p-3 cursor-pointer hover:brightness-110 transition-all`}
        style={{ borderColor: statusColor(node.status) + '40', background: statusBg(node.status) }}>
        <div className="flex items-center gap-2">
          <StatusIcon className={`w-3.5 h-3.5 flex-shrink-0 ${statusTextClass(node.status)}`} />
          <span className="text-xs font-medium text-text-primary truncate max-w-[120px]">{node.name}</span>
        </div>
        <p className="text-[10px] text-text-muted mt-1 ml-5">{node.type.replace('_', ' ')}</p>
        {node.uptimePct7d !== null && (
          <p className={`text-[10px] mt-0.5 ml-5 ${node.uptimePct7d >= 99 ? 'text-green-400' : node.uptimePct7d >= 95 ? 'text-yellow-400' : 'text-red-400'}`}>
            {node.uptimePct7d.toFixed(1)}%
          </p>
        )}
      </div>
    </Link>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DependencyGraphPage() {
  const router = useRouter();
  const { error: toastError } = useToast();
  const [graph, setGraph] = useState<DependencyGraph | null>(null);
  const [loading, setLoading] = useState(true);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const loadGraph = async () => {
    const user = getUser();
    if (!user) { router.push('/login'); return; }
    setLoading(true);
    try {
      const data = await api<DependencyGraph>('/v1/monitors/dependency-graph', user.id);
      setGraph(data);
    } catch {
      toastError('Failed to load dependency graph');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadGraph(); }, []);

  const connectedNodes = graph?.nodes.filter(n => n.inDegree > 0 || n.outDegree > 0) ?? [];
  const isolatedNodes = graph?.nodes.filter(n => n.inDegree === 0 && n.outDegree === 0) ?? [];
  const positions = graph ? computeLayout(connectedNodes, graph.edges) : new Map();

  const hoveredNode = graph?.nodes.find(n => n.id === hoveredId) ?? null;

  return (
    <AppFrame
      title="Infrastructure Topology"
      subtitle="Monitor dependency graph — alert suppression & blast radius"
      breadcrumbs={[
        { label: 'Monitors', href: '/monitors' },
        { label: 'Topology' },
      ]}
    >
      {/* Header actions */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2 text-xs text-text-secondary">
          <Info className="w-3.5 h-3.5" />
          <span>Arrows show alert suppression: A → B means A's alerts are suppressed when B is down.</span>
        </div>
        <Button variant="ghost" size="sm" onClick={loadGraph} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24 text-text-secondary text-sm">
          <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Loading topology…
        </div>
      ) : !graph || graph.nodes.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface-1 p-16 text-center">
          <GitBranch className="w-12 h-12 mx-auto text-text-secondary/40 mb-4" />
          <h3 className="text-lg font-semibold text-text-primary mb-2">No monitors yet</h3>
          <p className="text-sm text-text-secondary">Add monitors to see your infrastructure topology.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Summary stats */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              { label: 'Total Monitors', value: graph.summary.totalMonitors, color: '' },
              { label: 'Dependency Edges', value: graph.summary.totalEdges, color: '' },
              { label: 'Up', value: graph.summary.monitorsByStatus.up, color: 'text-green-400' },
              { label: 'Down', value: graph.summary.monitorsByStatus.down, color: 'text-red-400' },
              { label: 'Degraded', value: graph.summary.monitorsByStatus.degraded, color: 'text-yellow-400' },
            ].map(stat => (
              <div key={stat.label} className="rounded-xl border border-border bg-surface-1 p-4">
                <p className="text-xs text-text-secondary mb-1">{stat.label}</p>
                <p className={`text-2xl font-bold tabular-nums ${stat.color || 'text-text-primary'}`}>{stat.value}</p>
              </div>
            ))}
          </div>

          {/* Dependency graph */}
          {connectedNodes.length > 0 ? (
            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-sm font-semibold text-text-primary">Dependency Graph</h2>
                  <p className="text-xs text-text-muted mt-0.5">{connectedNodes.length} monitors, {graph.edges.length} dependencies. Hover a node to highlight connections.</p>
                </div>
                <div className="flex items-center gap-4 text-xs text-text-secondary">
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-green-500 inline-block" /> Up</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-yellow-500 inline-block" /> Degraded</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-red-500 inline-block" /> Down</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-gray-500 inline-block" /> Paused</span>
                </div>
              </div>

              <div className="relative overflow-x-auto rounded-lg bg-[#070c10] p-4 border border-border">
                <DependencyGraphSVG
                  nodes={connectedNodes}
                  edges={graph.edges}
                  positions={positions}
                  hoveredId={hoveredId}
                  onHover={setHoveredId}
                />
              </div>

              {/* Hover tooltip */}
              {hoveredNode && (
                <div className="mt-4 rounded-lg border border-border bg-surface-elevated p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <span className={`w-2.5 h-2.5 rounded-full`} style={{ background: statusColor(hoveredNode.status) }} />
                    <h3 className="font-semibold text-text-primary">{hoveredNode.name}</h3>
                    <Badge variant="default" className="text-xs">{hoveredNode.type}</Badge>
                    {hoveredNode.folderName && <Badge variant="default" className="text-xs opacity-60">{hoveredNode.folderName}</Badge>}
                    <Link href={`/monitors/${hoveredNode.id}`} className="ml-auto text-xs text-accent hover:underline flex items-center gap-1">
                      View Monitor <ArrowRight className="w-3 h-3" />
                    </Link>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-text-secondary">Status</p>
                      <p className={`font-medium capitalize ${statusTextClass(hoveredNode.status)}`}>{hoveredNode.status}</p>
                    </div>
                    <div>
                      <p className="text-xs text-text-secondary">7d Uptime</p>
                      <p className="font-medium text-text-primary">{hoveredNode.uptimePct7d != null ? `${hoveredNode.uptimePct7d.toFixed(2)}%` : '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-text-secondary">Latency</p>
                      <p className="font-medium text-text-primary">{hoveredNode.latencyMs != null ? `${hoveredNode.latencyMs}ms` : '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-text-secondary">Blast Radius</p>
                      <p className="font-medium text-text-primary">
                        {hoveredNode.inDegree > 0
                          ? <span className="text-red-400 font-bold">{hoveredNode.inDegree} monitor{hoveredNode.inDegree !== 1 ? 's' : ''} suppressed</span>
                          : <span className="text-green-400">None</span>
                        }
                      </p>
                    </div>
                  </div>
                  {hoveredNode.inDegree > 0 && (
                    <p className="mt-2 text-xs text-yellow-300/80">
                      ⚠️ If this monitor goes down, {hoveredNode.inDegree} dependent monitor alert{hoveredNode.inDegree !== 1 ? 's' : ''} will be suppressed.
                    </p>
                  )}
                  {hoveredNode.outDegree > 0 && (
                    <p className="mt-1 text-xs text-indigo-300/80">
                      ℹ️ This monitor depends on {hoveredNode.outDegree} other monitor{hoveredNode.outDegree !== 1 ? 's' : ''}. Its alerts are suppressed while {hoveredNode.outDegree > 1 ? 'any are' : 'it is'} down.
                    </p>
                  )}
                </div>
              )}

              {/* Legend */}
              <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-text-secondary border-t border-border pt-4">
                <span className="flex items-center gap-1.5">
                  <span className="w-4 h-[1.5px] bg-gray-600 inline-block" /><span className="w-2 h-2 border border-gray-600 rotate-45 inline-block" />
                  Dependency edge
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-sm bg-red-900/50 border border-red-400/50 flex items-center justify-center text-red-400 text-[9px] font-bold">N</span>
                  Blast radius (N dependents suppressed)
                </span>
                <span>
                  Hover a node to see its connections
                </span>
              </div>
            </Card>
          ) : (
            <Card className="p-6 text-center">
              <Layers className="w-8 h-8 mx-auto text-text-secondary/40 mb-3" />
              <p className="text-sm font-medium text-text-primary mb-1">No dependencies configured</p>
              <p className="text-xs text-text-secondary">Open a monitor detail page → Dependencies tab to add dependencies between monitors.</p>
            </Card>
          )}

          {/* Isolated monitors */}
          {isolatedNodes.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-sm font-semibold text-text-primary">Independent Monitors</h2>
                <Badge variant="default" className="text-xs">{isolatedNodes.length}</Badge>
                <span className="text-xs text-text-muted">— no dependencies configured</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                {isolatedNodes.map(node => (
                  <IsolatedNodeCard key={node.id} node={node} />
                ))}
              </div>
            </div>
          )}

          <p className="text-xs text-text-muted text-right">
            Last updated {new Date(graph.generatedAt).toLocaleTimeString()} ·{' '}
            <button onClick={loadGraph} className="text-accent hover:underline">Refresh</button>
          </p>
        </div>
      )}
    </AppFrame>
  );
}

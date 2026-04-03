export type OverallStatus = 'operational' | 'degraded' | 'outage' | 'empty';

export interface FolderNode {
  id: string;
  name: string;
  children: FolderNode[];
  [key: string]: unknown;
}

export function flattenTree(nodes: FolderNode[]): FolderNode[] {
  const result: FolderNode[] = [];
  const walk = (items: FolderNode[]) => {
    for (const n of items) {
      result.push(n);
      walk(n.children);
    }
  };
  walk(nodes);
  return result;
}

export function uptimeBarColor(pct: number): string {
  if (pct >= 99) return 'bg-success';
  if (pct >= 95) return 'bg-warning';
  return 'bg-danger';
}

export const STATUS_LABELS: Record<OverallStatus, string> = {
  operational: 'Operational',
  degraded: 'Degraded',
  outage: 'Outage',
  empty: 'No monitors',
};

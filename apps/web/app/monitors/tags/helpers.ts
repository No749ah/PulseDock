export const PRESET_COLORS = [
  '#6366f1', '#3b82f6', '#14b8a6', '#22c55e', '#f59e0b',
  '#ef4444', '#ec4899', '#8b5cf6', '#06b6d4', '#84cc16',
];

interface MonitorTag {
  id: string;
}

interface MonitorWithTags {
  tags?: MonitorTag[];
}

export function getTagMonitorCount(tagId: string, monitors: MonitorWithTags[]): number {
  return monitors.filter((m) => m.tags?.some((t) => t.id === tagId)).length;
}

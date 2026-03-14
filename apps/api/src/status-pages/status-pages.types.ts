export type WidgetType =
  | 'uptime-bar'
  | 'uptime-timeline'
  | 'response-time-chart'
  | 'response-time-heatmap'
  | 'current-status-badge'
  | 'multi-monitor-status-grid'
  | 'incident-history'
  | 'active-incident-banner'
  | 'monitor-group-status'
  | 'overall-system-status'
  | 'sla-summary'
  | 'check-history-feed'
  | 'text-block'
  | 'scheduled-maintenance'
  | 'last-updated-footer'
  | 'metric-counter'
  | 'divider';

export interface Widget {
  id: string;
  type: WidgetType;
  x: number;
  y: number;
  w: number;
  h: number;
  config: Record<string, unknown>;
}

export interface PageLayout {
  widgets: Widget[];
}

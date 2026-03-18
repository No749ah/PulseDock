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
  | 'monitor-group'
  | 'overall-system-status'
  | 'sla-summary'
  | 'check-history-feed'
  | 'text-block'
  | 'scheduled-maintenance'
  | 'last-updated-footer'
  | 'metric-counter'
  | 'divider'
  | 'version-status-grid'
  | 'version-check-badge'
  | 'update-summary'
  | 'multi-status-badges'
  | 'component-status-list'
  | 'rolling-uptime-cards'
  | 'status-history-ribbon'
  | 'uptime-percentage-card'
  | 'service-health-matrix'
  | 'aggregate-health-score'
  | 'latency-percentiles-card'
  | 'downtime-log'
  | 'active-incident-count'
  | 'mttr-mttf-cards'
  | 'sla-compliance-table'
  | 'uptime-heatmap'
  | 'incident-timeline'
  | 'ssl-certificate-status'
  | 'incident-severity-distribution';

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

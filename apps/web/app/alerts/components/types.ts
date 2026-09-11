export type AlertType =
  | 'discord'
  | 'webhook'
  | 'slack'
  | 'telegram'
  | 'email'
  | 'pagerduty'
  | 'opsgenie'
  | 'sms'
  | 'teams'
  | 'ntfy'
  | 'gotify'
  | 'matrix'
  | 'rocketchat'
  | 'apprise'
  | 'mattermost'
  | 'zulip';

export type ChannelSchedule = {
  enabled: boolean;
  timezone: string;
  days: number[];
  startHour: number;
  endHour: number;
};

export type AlertChannel = {
  id: string;
  name: string;
  type: AlertType;
  config: Record<string, unknown>;
  createdAt: string;
  lastTriggeredAt?: string | null;
  alertGrouping?: boolean;
  groupWindowSec?: number;
  groupByFolder?: boolean;
  groupByTag?: boolean;
  messageTemplate?: string | null;
  scheduleJson?: ChannelSchedule | null;
  batchWindowSec?: number | null;
  deliveryCount?: number;
};

export type DeliveryStats = {
  totalDeliveries: number;
  successCount: number;
  failureCount: number;
  successRate: number;
  lastDeliveryAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  last24hSuccess: number;
  last24hFailure: number;
  recentLogs: Array<{
    id: string;
    triggeredAt: string;
    success: boolean;
    statusCode: number | null;
    errorMessage: string | null;
    monitorName: string | null;
  }>;
};

export type DeliveryLog = {
  id: string;
  status: 'success' | 'failed';
  trigger: string | null;
  monitorId: string | null;
  monitorName: string | null;
  errorMessage: string | null;
  durationMs: number | null;
  createdAt: string;
  isGrouped?: boolean;
  groupedCount?: number;
};

export type DeliveryHistory = {
  channelId: string;
  channelName: string;
  successCount: number;
  failedCount: number;
  deliveries: DeliveryLog[];
};

export type CreateFormState = {
  name: string;
  type: AlertType;
  a: string;
  b: string;
  secret: string;
  username: string;
  avatarUrl: string;
  mentionRoleId: string;
  mentionUserId: string;
  messageTemplate: string;
  parseMode: string;
  payloadTemplate: string;
  customHeaders: Array<{ key: string; value: string }>;
};

export type PayloadPreviewResult = {
  rendered: string;
  valid: boolean;
  error?: string;
};

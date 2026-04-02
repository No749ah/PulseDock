'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getUser } from '../../../components/auth';
import { api } from '../../../lib/api';
import { useToast } from '../../../components/ui/toast';
import { useTableSort, exportCSV, exportJSON } from '../../../lib/useTableSort';
import type {
  AlertChannel,
  AlertType,
  ChannelSchedule,
  DeliveryHistory,
  DeliveryStats,
  CreateFormState,
  PayloadPreviewResult,
} from '../components/types';

export function buildConfig(
  type: AlertType,
  a: string,
  b: string,
  secret?: string,
  extras?: {
    username?: string;
    avatarUrl?: string;
    mentionRoleId?: string;
    mentionUserId?: string;
    messageTemplate?: string;
    parseMode?: string;
    payloadTemplate?: string;
    customHeaders?: Array<{ key: string; value: string }>;
  },
): Record<string, unknown> {
  if (type === 'discord') {
    const cfg: Record<string, unknown> = { webhookUrl: a };
    if (extras?.username?.trim()) cfg.username = extras.username.trim();
    if (extras?.avatarUrl?.trim()) cfg.avatarUrl = extras.avatarUrl.trim();
    if (extras?.mentionRoleId?.trim()) cfg.mentionRoleId = extras.mentionRoleId.trim();
    if (extras?.mentionUserId?.trim()) cfg.mentionUserId = extras.mentionUserId.trim();
    if (extras?.messageTemplate?.trim()) cfg.messageTemplate = extras.messageTemplate.trim();
    return cfg;
  }
  if (type === 'slack') return { webhookUrl: a };
  if (type === 'webhook') {
    const cfg: Record<string, unknown> = { url: a };
    if (secret?.trim()) cfg.secret = secret.trim();
    if (extras?.payloadTemplate?.trim()) cfg.payloadTemplate = extras.payloadTemplate.trim();
    if (extras?.customHeaders?.length) {
      const headers: Record<string, string> = {};
      for (const h of extras.customHeaders) {
        if (h.key.trim()) headers[h.key.trim()] = h.value;
      }
      if (Object.keys(headers).length > 0) cfg.customHeaders = headers;
    }
    return cfg;
  }
  if (type === 'telegram') {
    const cfg: Record<string, unknown> = { botToken: a, chatId: b };
    if (extras?.parseMode) cfg.parseMode = extras.parseMode;
    return cfg;
  }
  if (type === 'pagerduty') return { integrationKey: a };
  if (type === 'opsgenie') return { apiKey: a, region: b || 'us' };
  if (type === 'sms')
    return {
      accountSid: a,
      authToken: secret ?? '',
      from: b,
      to: extras?.username ?? '',
    };
  if (type === 'teams') return { webhookUrl: a };
  if (type === 'ntfy') {
    const cfg: Record<string, unknown> = { topicUrl: a };
    if (b?.trim()) cfg.token = b.trim();
    return cfg;
  }
  if (type === 'gotify') {
    const cfg: Record<string, unknown> = { serverUrl: a, appToken: b };
    if (secret?.trim()) cfg.priority = parseInt(secret.trim(), 10) || 5;
    return cfg;
  }
  if (type === 'matrix') {
    return { homeserverUrl: a, accessToken: b, roomId: secret ?? '' };
  }
  if (type === 'rocketchat') return { webhookUrl: a };
  if (type === 'apprise') {
    const cfg: Record<string, unknown> = { serverUrl: a };
    if (b?.trim()) cfg.tag = b.trim();
    return cfg;
  }
  if (type === 'mattermost') {
    const cfg: Record<string, unknown> = { webhookUrl: a };
    if (b?.trim()) cfg.channel = b.trim();
    if (secret?.trim()) cfg.username = secret.trim();
    return cfg;
  }
  if (type === 'zulip') {
    const cfg: Record<string, unknown> = {
      serverUrl: a,
      botEmail: b ?? '',
      botApiKey: secret ?? '',
    };
    const msgType = extras?.mentionRoleId?.trim() || 'stream';
    cfg.messageType = msgType;
    if (msgType === 'stream') {
      if (extras?.username?.trim()) cfg.stream = extras.username.trim();
      if (extras?.avatarUrl?.trim()) cfg.topic = extras.avatarUrl.trim();
    } else {
      if (extras?.username?.trim()) cfg.dmTo = extras.username.trim();
    }
    return cfg;
  }
  return { to: a };
}

const DEFAULT_CREATE_FORM: CreateFormState = {
  name: '',
  type: 'discord',
  a: '',
  b: '',
  secret: '',
  username: '',
  avatarUrl: '',
  mentionRoleId: '',
  mentionUserId: '',
  messageTemplate: '',
  parseMode: 'HTML',
  payloadTemplate: '',
  customHeaders: [],
};

export function useAlerts() {
  const router = useRouter();
  const { success, error: toastError } = useToast();
  const { sort, toggle, sorted } = useTableSort<
    'name' | 'type' | 'lastTriggeredAt' | 'createdAt'
  >('name');

  // ── channels ─────────────────────────────────────────────────────────────
  const [channels, setChannels] = useState<AlertChannel[]>([]);
  const [loading, setLoading] = useState(true);

  // ── pagination ────────────────────────────────────────────────────────────
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState('10');

  // ── column visibility ────────────────────────────────────────────────────
  const [visibleCols, setVisibleCols] = useState<Record<string, boolean>>(() => {
    try {
      const stored = localStorage.getItem('alerts-col-visibility');
      return stored
        ? (JSON.parse(stored) as Record<string, boolean>)
        : { name: true, type: true, lastTriggered: true, created: true, actions: true };
    } catch {
      return { name: true, type: true, lastTriggered: true, created: true, actions: true };
    }
  });
  const [showColPicker, setShowColPicker] = useState(false);

  // ── create wizard ─────────────────────────────────────────────────────────
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);
  const [form, setForm] = useState<CreateFormState>(DEFAULT_CREATE_FORM);
  const [createAlertGrouping, setCreateAlertGrouping] = useState(false);
  const [createGroupWindowMin, setCreateGroupWindowMin] = useState(5);
  const [createGroupByFolder, setCreateGroupByFolder] = useState(true);
  const [createGroupByTag, setCreateGroupByTag] = useState(false);
  const [createBatchWindowSec, setCreateBatchWindowSec] = useState(0);
  const [createChannelMsgTemplate, setCreateChannelMsgTemplate] = useState('');
  const [createScheduleEnabled, setCreateScheduleEnabled] = useState(false);
  const [createScheduleTz, setCreateScheduleTz] = useState('UTC');
  const [createScheduleDays, setCreateScheduleDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [createScheduleStart, setCreateScheduleStart] = useState(9);
  const [createScheduleEnd, setCreateScheduleEnd] = useState(18);
  const [createPreviewVisible, setCreatePreviewVisible] = useState(false);
  const [createPreviewResult, setCreatePreviewResult] = useState<PayloadPreviewResult | null>(null);

  // ── edit modal ────────────────────────────────────────────────────────────
  const [editOpen, setEditOpen] = useState(false);
  const [selected, setSelected] = useState<AlertChannel | null>(null);
  const [editName, setEditName] = useState('');
  const [editA, setEditA] = useState('');
  const [editB, setEditB] = useState('');
  const [editSecret, setEditSecret] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editAvatarUrl, setEditAvatarUrl] = useState('');
  const [editMentionRoleId, setEditMentionRoleId] = useState('');
  const [editMentionUserId, setEditMentionUserId] = useState('');
  const [editMessageTemplate, setEditMessageTemplate] = useState('');
  const [editParseMode, setEditParseMode] = useState('HTML');
  const [editPayloadTemplate, setEditPayloadTemplate] = useState('');
  const [editCustomHeaders, setEditCustomHeaders] = useState<Array<{ key: string; value: string }>>([]);
  const [editAlertGrouping, setEditAlertGrouping] = useState(false);
  const [editGroupWindowMin, setEditGroupWindowMin] = useState(5);
  const [editGroupByFolder, setEditGroupByFolder] = useState(true);
  const [editGroupByTag, setEditGroupByTag] = useState(false);
  const [editBatchWindowSec, setEditBatchWindowSec] = useState(0);
  const [editChannelMsgTemplate, setEditChannelMsgTemplate] = useState('');
  const [editScheduleEnabled, setEditScheduleEnabled] = useState(false);
  const [editScheduleTz, setEditScheduleTz] = useState('UTC');
  const [editScheduleDays, setEditScheduleDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [editScheduleStart, setEditScheduleStart] = useState(9);
  const [editScheduleEnd, setEditScheduleEnd] = useState(18);
  const [editPreviewVisible, setEditPreviewVisible] = useState(false);
  const [editPreviewLoading, setEditPreviewLoading] = useState(false);
  const [editPreviewResult, setEditPreviewResult] = useState<PayloadPreviewResult | null>(null);

  // ── delete modal ──────────────────────────────────────────────────────────
  const [deleteOpen, setDeleteOpen] = useState(false);

  // ── delivery history modal ────────────────────────────────────────────────
  const [deliveryOpen, setDeliveryOpen] = useState(false);
  const [deliveryHistory, setDeliveryHistory] = useState<DeliveryHistory | null>(null);
  const [deliveryLoading, setDeliveryLoading] = useState(false);

  // ── retry ─────────────────────────────────────────────────────────────────
  const [retryingDeliveryId, setRetryingDeliveryId] = useState<string | null>(null);
  const [retryingAll, setRetryingAll] = useState(false);

  // ── stats panel ───────────────────────────────────────────────────────────
  const [expandedStatsId, setExpandedStatsId] = useState<string | null>(null);
  const [statsCache, setStatsCache] = useState<Record<string, DeliveryStats>>({});
  const [statsLoading, setStatsLoading] = useState<string | null>(null);

  // ── test all ──────────────────────────────────────────────────────────────
  const [testingAll, setTestingAll] = useState(false);

  // ── auth guard ────────────────────────────────────────────────────────────
  useEffect(() => {
    const user = getUser();
    if (!user) router.push('/login');
  }, [router]);

  // ── data ──────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      setChannels(await api<AlertChannel[]>('/v1/alert-channels'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load().catch(() => router.push('/login'));
  }, [load, router]);

  // ── pagination computed ───────────────────────────────────────────────────
  const size = Number(pageSize);
  const sortedChannels = sorted(channels, (c) => {
    if (sort.key === 'name') return c.name;
    if (sort.key === 'type') return c.type;
    if (sort.key === 'lastTriggeredAt') return c.lastTriggeredAt ?? '';
    if (sort.key === 'createdAt') return c.createdAt;
    return c.name;
  });
  const pages = Math.max(1, Math.ceil(sortedChannels.length / size));
  const safePage = Math.min(page, pages);
  const pageRows = sortedChannels.slice((safePage - 1) * size, safePage * size);

  // ── column visibility ─────────────────────────────────────────────────────
  const toggleCol = (col: string) => {
    setVisibleCols((prev) => {
      const next = { ...prev, [col]: !prev[col] };
      try {
        localStorage.setItem('alerts-col-visibility', JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  // ── create wizard ─────────────────────────────────────────────────────────
  const resetCreateForm = () => {
    setWizardStep(0);
    setForm(DEFAULT_CREATE_FORM);
    setCreatePreviewVisible(false);
    setCreatePreviewResult(null);
    setCreateAlertGrouping(false);
    setCreateGroupWindowMin(5);
    setCreateGroupByFolder(true);
    setCreateGroupByTag(false);
    setCreateChannelMsgTemplate('');
    setCreateScheduleEnabled(false);
    setCreateScheduleTz('UTC');
    setCreateScheduleDays([1, 2, 3, 4, 5]);
    setCreateScheduleStart(9);
    setCreateScheduleEnd(18);
  };

  const wizardNext = () => setWizardStep((s) => Math.min(2, s + 1));
  const wizardBack = () => setWizardStep((s) => Math.max(0, s - 1));

  const previewCreateTemplate = (template: string) => {
    const sampleVars: Record<string, string> = {
      '{{text}}': '🚨 Monitor "My API" is DOWN',
      '{{monitor.name}}': 'My API',
      '{{monitor.target}}': 'https://api.example.com',
      '{{monitor.type}}': 'HTTP',
      '{{monitor.id}}': 'mon_123',
      '{{monitor.runbookUrl}}': '',
      '{{run.level}}': 'red',
      '{{run.message}}': 'Connection refused',
      '{{run.latencyMs}}': 'null',
      '{{run.statusCode}}': '503',
      '{{run.checkedAt}}': new Date().toISOString(),
      '{{run.ok}}': 'false',
      '{{timestamp}}': new Date().toISOString(),
      '{{channelName}}': form.name || 'My Webhook',
    };
    let rendered = template;
    for (const [key, val] of Object.entries(sampleVars)) {
      rendered = rendered.replaceAll(key, val);
    }
    let valid = false;
    let error: string | undefined;
    try {
      JSON.parse(rendered);
      valid = true;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
    setCreatePreviewResult({ rendered, valid, error });
    setCreatePreviewVisible(true);
  };

  const createChannel = async () => {
    try {
      const config = buildConfig(form.type, form.a, form.b, form.secret, {
        username: form.username,
        avatarUrl: form.avatarUrl,
        mentionRoleId: form.mentionRoleId,
        mentionUserId: form.mentionUserId,
        messageTemplate: form.messageTemplate,
        parseMode: form.parseMode,
        payloadTemplate: form.payloadTemplate,
        customHeaders: form.customHeaders,
      });
      await api('/v1/alert-channels', undefined, {
        method: 'POST',
        body: JSON.stringify({
          name: form.name,
          type: form.type,
          config,
          alertGrouping: createAlertGrouping,
          groupWindowSec: createGroupWindowMin * 60,
          groupByFolder: createGroupByFolder,
          groupByTag: createGroupByTag,
          ...(createBatchWindowSec > 0 && { batchWindowSec: createBatchWindowSec }),
          ...(createChannelMsgTemplate.trim() && {
            messageTemplate: createChannelMsgTemplate.trim(),
          }),
          scheduleJson: createScheduleEnabled
            ? {
                enabled: true,
                timezone: createScheduleTz,
                days: createScheduleDays,
                startHour: createScheduleStart,
                endHour: createScheduleEnd,
              }
            : null,
        }),
      });
      setWizardOpen(false);
      resetCreateForm();
      await load();
      success('Alert channel created');
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Failed to create channel');
    }
  };

  // ── edit ──────────────────────────────────────────────────────────────────
  const openEdit = (channel: AlertChannel) => {
    setSelected(channel);
    setEditName(channel.name);
    setEditUsername(String(channel.config.username ?? ''));
    setEditAvatarUrl(String(channel.config.avatarUrl ?? ''));
    setEditMentionRoleId(String(channel.config.mentionRoleId ?? ''));
    setEditMentionUserId(String(channel.config.mentionUserId ?? ''));
    setEditMessageTemplate(String(channel.config.messageTemplate ?? ''));
    setEditParseMode(String(channel.config.parseMode ?? 'HTML'));

    if (channel.type === 'discord' || channel.type === 'slack') {
      setEditA(String(channel.config.webhookUrl ?? ''));
      setEditB('');
    } else if (channel.type === 'webhook') {
      setEditA(String(channel.config.url ?? ''));
      setEditB('');
      setEditSecret(String(channel.config.secret ?? ''));
      setEditPayloadTemplate(String(channel.config.payloadTemplate ?? ''));
      if (channel.config.customHeaders && typeof channel.config.customHeaders === 'object') {
        setEditCustomHeaders(
          Object.entries(channel.config.customHeaders as Record<string, string>).map(
            ([key, value]) => ({ key, value }),
          ),
        );
      } else {
        setEditCustomHeaders([]);
      }
    } else if (channel.type === 'telegram') {
      setEditA(String(channel.config.botToken ?? ''));
      setEditB(String(channel.config.chatId ?? ''));
    } else if (channel.type === 'pagerduty') {
      setEditA(String(channel.config.integrationKey ?? ''));
      setEditB('');
      setEditSecret('');
    } else if (channel.type === 'opsgenie') {
      setEditA(String(channel.config.apiKey ?? ''));
      setEditB(String(channel.config.region ?? 'us'));
      setEditSecret('');
    } else if (channel.type === 'sms') {
      setEditA(String(channel.config.accountSid ?? ''));
      setEditB(String(channel.config.from ?? ''));
      setEditSecret(String(channel.config.authToken ?? ''));
      setEditUsername(String(channel.config.to ?? ''));
    } else if (channel.type === 'teams') {
      setEditA(String(channel.config.webhookUrl ?? ''));
      setEditB('');
      setEditSecret('');
    } else if (channel.type === 'ntfy') {
      setEditA(String(channel.config.topicUrl ?? ''));
      setEditB(String(channel.config.token ?? ''));
      setEditSecret('');
    } else if (channel.type === 'gotify') {
      setEditA(String(channel.config.serverUrl ?? ''));
      setEditB(String(channel.config.appToken ?? ''));
      setEditSecret(String(channel.config.priority ?? '5'));
    } else if (channel.type === 'matrix') {
      setEditA(String(channel.config.homeserverUrl ?? ''));
      setEditB(String(channel.config.accessToken ?? ''));
      setEditSecret(String(channel.config.roomId ?? ''));
    } else if (channel.type === 'rocketchat') {
      setEditA(String(channel.config.webhookUrl ?? ''));
      setEditB('');
      setEditSecret('');
    } else if (channel.type === 'apprise') {
      setEditA(String(channel.config.serverUrl ?? ''));
      setEditB(String(channel.config.tag ?? ''));
      setEditSecret('');
    } else if (channel.type === 'mattermost') {
      setEditA(String(channel.config.webhookUrl ?? ''));
      setEditB(String(channel.config.channel ?? ''));
      setEditSecret(String(channel.config.username ?? ''));
    } else if (channel.type === 'zulip') {
      setEditA(String(channel.config.serverUrl ?? ''));
      setEditB(String(channel.config.botEmail ?? ''));
      setEditSecret(String(channel.config.botApiKey ?? ''));
      setEditUsername(String(channel.config.stream ?? channel.config.dmTo ?? ''));
      setEditAvatarUrl(String(channel.config.topic ?? ''));
      setEditMentionRoleId(String(channel.config.messageType ?? 'stream'));
    } else {
      setEditA(String(channel.config.to ?? ''));
      setEditB('');
      setEditSecret('');
    }

    setEditPreviewVisible(false);
    setEditPreviewResult(null);
    setEditAlertGrouping(channel.alertGrouping ?? false);
    setEditGroupWindowMin(Math.round((channel.groupWindowSec ?? 300) / 60));
    setEditGroupByFolder(channel.groupByFolder ?? true);
    setEditGroupByTag(channel.groupByTag ?? false);
    setEditBatchWindowSec(channel.batchWindowSec ?? 0);
    setEditChannelMsgTemplate(channel.messageTemplate ?? '');
    const sched = channel.scheduleJson as ChannelSchedule | null | undefined;
    setEditScheduleEnabled(sched?.enabled ?? false);
    setEditScheduleTz(sched?.timezone ?? 'UTC');
    setEditScheduleDays(sched?.days ?? [1, 2, 3, 4, 5]);
    setEditScheduleStart(sched?.startHour ?? 9);
    setEditScheduleEnd(sched?.endHour ?? 18);
    setEditOpen(true);
  };

  const previewEditTemplate = async () => {
    if (!selected) return;
    setEditPreviewLoading(true);
    setEditPreviewVisible(true);
    try {
      const result = await api<PayloadPreviewResult>(
        `/v1/alert-channels/${selected.id}/preview-payload`,
        undefined,
        { method: 'POST', body: JSON.stringify({ template: editPayloadTemplate }) },
      );
      setEditPreviewResult(result);
    } catch (e) {
      setEditPreviewResult({
        rendered: '',
        valid: false,
        error: e instanceof Error ? e.message : 'Preview failed',
      });
    } finally {
      setEditPreviewLoading(false);
    }
  };

  const saveEdit = async () => {
    if (!selected) return;
    try {
      const config = buildConfig(selected.type, editA, editB, editSecret, {
        username: editUsername,
        avatarUrl: editAvatarUrl,
        mentionRoleId: editMentionRoleId,
        mentionUserId: editMentionUserId,
        messageTemplate: editMessageTemplate,
        parseMode: editParseMode,
        payloadTemplate: editPayloadTemplate,
        customHeaders: editCustomHeaders,
      });
      await api(`/v1/alert-channels/${selected.id}`, '', {
        method: 'PATCH',
        body: JSON.stringify({
          name: editName,
          config,
          alertGrouping: editAlertGrouping,
          groupWindowSec: editGroupWindowMin * 60,
          groupByFolder: editGroupByFolder,
          groupByTag: editGroupByTag,
          batchWindowSec: editBatchWindowSec > 0 ? editBatchWindowSec : null,
          messageTemplate: editChannelMsgTemplate.trim() || null,
          scheduleJson: editScheduleEnabled
            ? {
                enabled: true,
                timezone: editScheduleTz,
                days: editScheduleDays,
                startHour: editScheduleStart,
                endHour: editScheduleEnd,
              }
            : null,
        }),
      });
      setEditOpen(false);
      await load();
      success('Channel updated');
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Failed to update channel');
    }
  };

  // ── delete ────────────────────────────────────────────────────────────────
  const openDelete = (channel: AlertChannel) => {
    setSelected(channel);
    setDeleteOpen(true);
  };

  const confirmDelete = async () => {
    if (!selected) return;
    try {
      await api(`/v1/alert-channels/${selected.id}`, '', { method: 'DELETE' });
      setDeleteOpen(false);
      await load();
      success('Channel deleted');
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Failed to delete channel');
    }
  };

  // ── test ──────────────────────────────────────────────────────────────────
  const testChannel = async (channel: AlertChannel) => {
    try {
      await api('/v1/alert-channels/test', undefined, {
        method: 'POST',
        body: JSON.stringify({ channelId: channel.id }),
      });
      success(`Test notification sent to ${channel.name}`);
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Test failed');
    }
  };

  const testAllChannels = async () => {
    if (channels.length === 0) return;
    setTestingAll(true);
    try {
      const result = await api<{
        tested: number;
        results: Array<{ channelId: string; name: string; type: string; ok: boolean; error: string | null }>;
      }>('/v1/alert-channels/test-all', undefined, { method: 'POST' });
      const passed = result.results.filter((r) => r.ok).length;
      const failed = result.results.filter((r) => !r.ok).length;
      if (failed === 0) {
        success(`All ${passed} channel${passed !== 1 ? 's' : ''} responded successfully`);
      } else {
        const failedNames = result.results
          .filter((r) => !r.ok)
          .map((r) => r.name)
          .join(', ');
        toastError(`${failed} channel${failed !== 1 ? 's' : ''} failed: ${failedNames}`);
      }
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Bulk test failed');
    } finally {
      setTestingAll(false);
    }
  };

  // ── delivery history ──────────────────────────────────────────────────────
  const openDeliveries = async (channel: AlertChannel) => {
    setSelected(channel);
    setDeliveryOpen(true);
    setDeliveryLoading(true);
    setDeliveryHistory(null);
    try {
      const data = await api<DeliveryHistory>(`/v1/alert-channels/${channel.id}/deliveries`);
      setDeliveryHistory(data);
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Failed to load delivery history');
    } finally {
      setDeliveryLoading(false);
    }
  };

  const retryDelivery = async (deliveryId: string) => {
    if (!selected) return;
    setRetryingDeliveryId(deliveryId);
    try {
      const result = await api<{ success: boolean; error?: string }>(
        `/v1/alert-channels/${selected.id}/retry-delivery/${deliveryId}`,
        undefined,
        { method: 'POST' },
      );
      if (result.success) {
        success('Delivery retried successfully');
        const data = await api<DeliveryHistory>(`/v1/alert-channels/${selected.id}/deliveries`);
        setDeliveryHistory(data);
      } else {
        toastError(result.error ?? 'Retry failed');
      }
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Retry failed');
    } finally {
      setRetryingDeliveryId(null);
    }
  };

  const retryAllFailed = async () => {
    if (!selected) return;
    setRetryingAll(true);
    try {
      const result = await api<{
        results: Array<{ deliveryId: string; success: boolean; error?: string }>;
      }>(`/v1/alert-channels/${selected.id}/retry-all-failed`, undefined, { method: 'POST' });
      const succeeded = result.results.filter((r) => r.success).length;
      const failed = result.results.filter((r) => !r.success).length;
      if (failed === 0) {
        success(`Retried ${succeeded} delivery${succeeded !== 1 ? 's' : ''} successfully`);
      } else {
        toastError(`${succeeded} succeeded, ${failed} failed`);
      }
      const data = await api<DeliveryHistory>(`/v1/alert-channels/${selected.id}/deliveries`);
      setDeliveryHistory(data);
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Retry all failed');
    } finally {
      setRetryingAll(false);
    }
  };

  // ── stats ─────────────────────────────────────────────────────────────────
  const toggleStats = async (channelId: string) => {
    if (expandedStatsId === channelId) {
      setExpandedStatsId(null);
      return;
    }
    setExpandedStatsId(channelId);
    if (statsCache[channelId]) return;
    setStatsLoading(channelId);
    try {
      const data = await api<DeliveryStats>(`/v1/alert-channels/${channelId}/delivery-stats`);
      setStatsCache((prev) => ({ ...prev, [channelId]: data }));
    } catch {
      // silently fail — panel shows empty state
    } finally {
      setStatsLoading(null);
    }
  };

  // ── exports ───────────────────────────────────────────────────────────────
  const handleExportCSV = () => {
    exportCSV(
      'alert-channels.csv',
      channels.map((c) => ({
        id: c.id,
        name: c.name,
        type: c.type,
        lastTriggeredAt: c.lastTriggeredAt ?? '',
        createdAt: c.createdAt,
      })),
    );
  };

  const handleExportJSON = () => {
    exportJSON(
      'alert-channels.json',
      channels.map((c) => ({
        id: c.id,
        name: c.name,
        type: c.type,
        lastTriggeredAt: c.lastTriggeredAt,
        createdAt: c.createdAt,
      })),
    );
  };

  return {
    // data
    channels,
    loading,
    pageRows,
    sortedChannels,
    safePage,
    pages,
    sort,
    toggle,

    // pagination
    page,
    setPage,
    pageSize,
    setPageSize,

    // column visibility
    visibleCols,
    showColPicker,
    setShowColPicker,
    toggleCol,

    // create wizard
    wizardOpen,
    setWizardOpen,
    wizardStep,
    wizardNext,
    wizardBack,
    form,
    setForm,
    createAlertGrouping,
    setCreateAlertGrouping,
    createGroupWindowMin,
    setCreateGroupWindowMin,
    createGroupByFolder,
    setCreateGroupByFolder,
    createGroupByTag,
    setCreateGroupByTag,
    createBatchWindowSec,
    setCreateBatchWindowSec,
    createChannelMsgTemplate,
    setCreateChannelMsgTemplate,
    createScheduleEnabled,
    setCreateScheduleEnabled,
    createScheduleTz,
    setCreateScheduleTz,
    createScheduleDays,
    setCreateScheduleDays,
    createScheduleStart,
    setCreateScheduleStart,
    createScheduleEnd,
    setCreateScheduleEnd,
    createPreviewVisible,
    setCreatePreviewVisible,
    createPreviewResult,
    setCreatePreviewResult,
    previewCreateTemplate,
    createChannel,
    resetCreateForm,

    // edit
    editOpen,
    setEditOpen,
    selected,
    editName,
    setEditName,
    editA,
    setEditA,
    editB,
    setEditB,
    editSecret,
    setEditSecret,
    editUsername,
    setEditUsername,
    editAvatarUrl,
    setEditAvatarUrl,
    editMentionRoleId,
    setEditMentionRoleId,
    editMentionUserId,
    setEditMentionUserId,
    editMessageTemplate,
    setEditMessageTemplate,
    editParseMode,
    setEditParseMode,
    editPayloadTemplate,
    setEditPayloadTemplate,
    editCustomHeaders,
    setEditCustomHeaders,
    editAlertGrouping,
    setEditAlertGrouping,
    editGroupWindowMin,
    setEditGroupWindowMin,
    editGroupByFolder,
    setEditGroupByFolder,
    editGroupByTag,
    setEditGroupByTag,
    editBatchWindowSec,
    setEditBatchWindowSec,
    editChannelMsgTemplate,
    setEditChannelMsgTemplate,
    editScheduleEnabled,
    setEditScheduleEnabled,
    editScheduleTz,
    setEditScheduleTz,
    editScheduleDays,
    setEditScheduleDays,
    editScheduleStart,
    setEditScheduleStart,
    editScheduleEnd,
    setEditScheduleEnd,
    editPreviewVisible,
    setEditPreviewVisible,
    editPreviewLoading,
    editPreviewResult,
    previewEditTemplate,
    openEdit,
    saveEdit,

    // delete
    deleteOpen,
    setDeleteOpen,
    openDelete,
    confirmDelete,

    // test
    testChannel,
    testAllChannels,
    testingAll,

    // delivery history
    deliveryOpen,
    setDeliveryOpen,
    deliveryHistory,
    deliveryLoading,
    openDeliveries,
    retryDelivery,
    retryAllFailed,
    retryingDeliveryId,
    retryingAll,

    // stats
    expandedStatsId,
    statsCache,
    statsLoading,
    toggleStats,

    // exports
    handleExportCSV,
    handleExportJSON,
  };
}

export type UseAlertsReturn = ReturnType<typeof useAlerts>;

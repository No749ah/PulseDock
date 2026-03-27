'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Plus, Edit, Trash2, Activity, CheckCircle2, XCircle, Clock, Bell, Mail, MessageSquare, Hash, Globe, Send, Eye, Smartphone, X, RefreshCw } from 'lucide-react';
import { AppFrame } from '../../components/app-frame';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Badge } from '../components/Badge';
import { Modal } from '../components/Modal';
import { Table, TableHead, TableBody, TableRow, TableCell } from '../components/Table';
import { Select } from '../components/Select';
import { SortableHeader, TablePagination } from '../components/SortableTable';
import { getUser } from '../../components/auth';
import { api } from '../../lib/api';
import { useToast } from '../../components/ui/toast';
import { useTableSort, exportCSV, exportJSON } from '../../lib/useTableSort';
import { brand } from '../../lib/brand';

type AlertType = 'discord' | 'webhook' | 'slack' | 'telegram' | 'email' | 'pagerduty' | 'opsgenie' | 'sms';

type AlertChannel = {
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
};

function ChannelTypeIcon({ type }: { type: AlertType }) {
  const iconClass = 'w-4 h-4 shrink-0';
  switch (type) {
    case 'email':
      return <Mail className={`${iconClass} text-blue-400`} />;
    case 'slack':
      return <MessageSquare className={`${iconClass} text-green-400`} />;
    case 'discord':
      return <Hash className={`${iconClass} text-indigo-400`} />;
    case 'webhook':
      return <Globe className={`${iconClass} text-orange-400`} />;
    case 'telegram':
      return <Send className={`${iconClass} text-sky-400`} />;
    case 'pagerduty':
      return <Bell className={`${iconClass} text-green-500`} />;
    case 'opsgenie':
      return <Bell className={`${iconClass} text-orange-500`} />;
    case 'sms':
      return <Smartphone className={`${iconClass} text-green-400`} />;
    default:
      return <Bell className={`${iconClass} text-text-secondary`} />;
  }
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

type DeliveryLog = {
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

type DeliveryHistory = {
  channelId: string;
  channelName: string;
  successCount: number;
  failedCount: number;
  deliveries: DeliveryLog[];
};

const inputClass = "w-full px-4 py-3 bg-surface border border-border rounded-lg text-text-primary placeholder-text-secondary focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent";

export default function AlertsPage() {
  const router = useRouter();
  const { success, error: toastError } = useToast();
  const [channels, setChannels] = useState<AlertChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState('10');
  const { sort, toggle, sorted } = useTableSort<'name' | 'type' | 'lastTriggeredAt' | 'createdAt'>('name');

  // Column visibility (persisted to localStorage)
  const [visibleCols, setVisibleCols] = useState<Record<string, boolean>>(() => {
    try {
      const stored = localStorage.getItem('alerts-col-visibility');
      return stored ? JSON.parse(stored) : { name: true, type: true, lastTriggered: true, created: true, actions: true };
    } catch {
      return { name: true, type: true, lastTriggered: true, created: true, actions: true };
    }
  });
  const [showColPicker, setShowColPicker] = useState(false);
  const toggleCol = (col: string) => {
    setVisibleCols((prev) => {
      const next = { ...prev, [col]: !prev[col] };
      try { localStorage.setItem('alerts-col-visibility', JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);
  const [form, setForm] = useState({
    name: '', type: 'discord' as AlertType,
    a: '', b: '', secret: '',
    // Discord extras
    username: '', avatarUrl: '', mentionRoleId: '', mentionUserId: '', messageTemplate: '',
    // Telegram extras
    parseMode: 'HTML',
    // Webhook extras
    payloadTemplate: '',
    customHeaders: [] as Array<{key: string; value: string}>,
  });

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selected, setSelected] = useState<AlertChannel | null>(null);
  const [editName, setEditName] = useState('');
  const [editA, setEditA] = useState('');
  const [editB, setEditB] = useState('');
  const [editSecret, setEditSecret] = useState('');
  // Edit extras
  const [editUsername, setEditUsername] = useState('');
  const [editAvatarUrl, setEditAvatarUrl] = useState('');
  const [editMentionRoleId, setEditMentionRoleId] = useState('');
  const [editMentionUserId, setEditMentionUserId] = useState('');
  const [editMessageTemplate, setEditMessageTemplate] = useState('');
  const [editParseMode, setEditParseMode] = useState('HTML');
  const [editPayloadTemplate, setEditPayloadTemplate] = useState('');
  const [editCustomHeaders, setEditCustomHeaders] = useState<Array<{key: string; value: string}>>([]);
  // Alert grouping state (create form)
  const [createAlertGrouping, setCreateAlertGrouping] = useState(false);
  const [createGroupWindowMin, setCreateGroupWindowMin] = useState(5);
  const [createGroupByFolder, setCreateGroupByFolder] = useState(true);
  const [createGroupByTag, setCreateGroupByTag] = useState(false);
  // Alert grouping state (edit form)
  const [editAlertGrouping, setEditAlertGrouping] = useState(false);
  const [editGroupWindowMin, setEditGroupWindowMin] = useState(5);
  const [editGroupByFolder, setEditGroupByFolder] = useState(true);
  const [editGroupByTag, setEditGroupByTag] = useState(false);
  const [deliveryOpen, setDeliveryOpen] = useState(false);
  const [deliveryHistory, setDeliveryHistory] = useState<DeliveryHistory | null>(null);
  const [deliveryLoading, setDeliveryLoading] = useState(false);
  const [testingAll, setTestingAll] = useState(false);

  // Payload preview state (create form)
  const [createPreviewVisible, setCreatePreviewVisible] = useState(false);
  const [createPreviewResult, setCreatePreviewResult] = useState<{ rendered: string; valid: boolean; error?: string } | null>(null);

  // Payload preview state (edit form)
  const [editPreviewVisible, setEditPreviewVisible] = useState(false);
  const [editPreviewLoading, setEditPreviewLoading] = useState(false);
  const [editPreviewResult, setEditPreviewResult] = useState<{ rendered: string; valid: boolean; error?: string } | null>(null);

  // Retry state
  const [retryingDeliveryId, setRetryingDeliveryId] = useState<string | null>(null);
  const [retryingAll, setRetryingAll] = useState(false);

  useEffect(() => {
    const user = getUser();
    if (!user) router.push('/login');
  }, [router]);

  async function load() {
    setLoading(true);
    try {
      setChannels(await api<AlertChannel[]>('/v1/alert-channels'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load().catch(() => router.push('/login')); }, []);

  function resetCreateForm() {
    setWizardStep(0);
    setForm({ name: '', type: 'discord', a: '', b: '', secret: '', username: '', avatarUrl: '', mentionRoleId: '', mentionUserId: '', messageTemplate: '', parseMode: 'HTML', payloadTemplate: '', customHeaders: [] });
    setCreatePreviewVisible(false);
    setCreatePreviewResult(null);
    setCreateAlertGrouping(false);
    setCreateGroupWindowMin(5);
    setCreateGroupByFolder(true);
    setCreateGroupByTag(false);
  }

  function previewCreateTemplate(template: string) {
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
  }

  async function previewEditTemplate() {
    if (!selected) return;
    setEditPreviewLoading(true);
    setEditPreviewVisible(true);
    try {
      const result = await api<{ rendered: string; valid: boolean; error?: string }>(
        `/v1/alert-channels/${selected.id}/preview-payload`,
        undefined,
        { method: 'POST', body: JSON.stringify({ template: editPayloadTemplate }) },
      );
      setEditPreviewResult(result);
    } catch (e) {
      setEditPreviewResult({ rendered: '', valid: false, error: e instanceof Error ? e.message : 'Preview failed' });
    } finally {
      setEditPreviewLoading(false);
    }
  }

  async function retryDelivery(deliveryId: string) {
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
        // Refresh delivery history
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
  }

  async function retryAllFailed() {
    if (!selected) return;
    setRetryingAll(true);
    try {
      const result = await api<{ results: Array<{ deliveryId: string; success: boolean; error?: string }> }>(
        `/v1/alert-channels/${selected.id}/retry-all-failed`,
        undefined,
        { method: 'POST' },
      );
      const succeeded = result.results.filter((r) => r.success).length;
      const failed = result.results.filter((r) => !r.success).length;
      if (failed === 0) {
        success(`Retried ${succeeded} delivery${succeeded !== 1 ? 's' : ''} successfully`);
      } else {
        toastError(`${succeeded} succeeded, ${failed} failed`);
      }
      // Refresh delivery history
      const data = await api<DeliveryHistory>(`/v1/alert-channels/${selected.id}/deliveries`);
      setDeliveryHistory(data);
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Retry all failed');
    } finally {
      setRetryingAll(false);
    }
  }

  function next() {
    setWizardStep((s) => Math.min(2, s + 1));
  }

  function back() {
    setWizardStep((s) => Math.max(0, s - 1));
  }

  function buildConfig(type: AlertType, a: string, b: string, secret?: string, extras?: {
    username?: string; avatarUrl?: string; mentionRoleId?: string; mentionUserId?: string; messageTemplate?: string; parseMode?: string; payloadTemplate?: string; customHeaders?: Array<{key: string; value: string}>;
  }): Record<string, unknown> {
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
    if (type === 'sms') return { accountSid: a, authToken: secret ?? '', from: b, to: extras?.username ?? '' };
    return { to: a };
  }

  async function createChannel() {
    try {
      const config = buildConfig(form.type, form.a, form.b, form.secret, { username: form.username, avatarUrl: form.avatarUrl, mentionRoleId: form.mentionRoleId, mentionUserId: form.mentionUserId, messageTemplate: form.messageTemplate, parseMode: form.parseMode, payloadTemplate: form.payloadTemplate, customHeaders: form.customHeaders });
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
        }),
      });
      setWizardOpen(false);
      resetCreateForm();
      await load();
      success('Alert channel created');
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Failed to create channel');
    }
  }

  async function testChannel(channel: AlertChannel) {
    try {
      await api('/v1/alert-channels/test', undefined, { method: 'POST', body: JSON.stringify({ channelId: channel.id }) });
      success(`Test notification sent to ${channel.name}`);
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Test failed');
    }
  }

  async function testAllChannels() {
    if (channels.length === 0) return;
    setTestingAll(true);
    try {
      const result = await api<{ tested: number; results: Array<{ channelId: string; name: string; type: string; ok: boolean; error: string | null }> }>(
        '/v1/alert-channels/test-all',
        undefined,
        { method: 'POST' },
      );
      const passed = result.results.filter((r) => r.ok).length;
      const failed = result.results.filter((r) => !r.ok).length;
      if (failed === 0) {
        success(`All ${passed} channel${passed !== 1 ? 's' : ''} responded successfully`);
      } else {
        const failedNames = result.results.filter((r) => !r.ok).map((r) => r.name).join(', ');
        toastError(`${failed} channel${failed !== 1 ? 's' : ''} failed: ${failedNames}`);
      }
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Bulk test failed');
    } finally {
      setTestingAll(false);
    }
  }

  async function openDeliveries(channel: AlertChannel) {
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
  }

  function openEdit(channel: AlertChannel) {
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
        setEditCustomHeaders(Object.entries(channel.config.customHeaders as Record<string, string>).map(([key, value]) => ({ key, value })));
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
    setEditOpen(true);
  }

  async function saveEdit() {
    if (!selected) return;
    try {
      const config = buildConfig(selected.type, editA, editB, editSecret, { username: editUsername, avatarUrl: editAvatarUrl, mentionRoleId: editMentionRoleId, mentionUserId: editMentionUserId, messageTemplate: editMessageTemplate, parseMode: editParseMode, payloadTemplate: editPayloadTemplate, customHeaders: editCustomHeaders });
      await api(`/v1/alert-channels/${selected.id}`, '', {
        method: 'PATCH',
        body: JSON.stringify({
          name: editName,
          config,
          alertGrouping: editAlertGrouping,
          groupWindowSec: editGroupWindowMin * 60,
          groupByFolder: editGroupByFolder,
          groupByTag: editGroupByTag,
        }),
      });
      setEditOpen(false);
      await load();
      success('Channel updated');
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Failed to update channel');
    }
  }

  function openDelete(channel: AlertChannel) {
    setSelected(channel);
    setDeleteOpen(true);
  }

  async function confirmDelete() {
    if (!selected) return;
    try {
      await api(`/v1/alert-channels/${selected.id}`, '', { method: 'DELETE' });
      setDeleteOpen(false);
      await load();
      success('Channel deleted');
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Failed to delete channel');
    }
  }

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

  function handleExportCSV() {
    exportCSV('alert-channels.csv', channels.map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type,
      lastTriggeredAt: c.lastTriggeredAt ?? '',
      createdAt: c.createdAt,
    })));
  }

  function handleExportJSON() {
    exportJSON('alert-channels.json', channels.map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type,
      lastTriggeredAt: c.lastTriggeredAt,
      createdAt: c.createdAt,
    })));
  }

  return (
    <AppFrame title="Alerts" subtitle="Configure alert channels and verify delivery." breadcrumbs={[{ label: "Alerts" }]}>
      {loading ? (
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-12 w-12 border-2 border-accent border-t-transparent" />
        </div>
      ) : (
        <>
          {/* Create Modal */}
          <Modal
            isOpen={wizardOpen}
            onClose={() => { setWizardOpen(false); resetCreateForm(); }}
            title="Create alert channel"
            actions={
              <div className="flex items-center justify-between w-full">
                <Button variant="secondary" onClick={back} disabled={wizardStep === 0}>Back</Button>
                {wizardStep < 2
                  ? <Button onClick={next}>Next</Button>
                  : <Button onClick={createChannel}>Create channel</Button>
                }
              </div>
            }
          >
            {wizardStep === 0 && (
              <div className="space-y-4">
                <p className="font-semibold text-text-primary">Step 1/3 · Basics</p>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1.5">Channel name</label>
                  <input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <Select
                  label="Platform"
                  value={form.type}
                  onChange={(v) => setForm({ ...form, type: (v as AlertType) || 'discord' })}
                  options={[
                    { value: 'discord', label: 'Discord' },
                    { value: 'webhook', label: 'Webhook' },
                    { value: 'slack', label: 'Slack' },
                    { value: 'telegram', label: 'Telegram' },
                    { value: 'email', label: 'Email' },
                    { value: 'pagerduty', label: 'PagerDuty' },
                    { value: 'opsgenie', label: 'OpsGenie' },
                    { value: 'sms', label: 'SMS (Twilio)' },
                  ]}
                />
              </div>
            )}

            {wizardStep === 1 && (
              <div className="space-y-4">
                <p className="font-semibold text-text-primary">Step 2/3 · Credentials</p>
                <p className="text-sm text-text-secondary">
                  {form.type === 'discord' ? 'Paste Discord webhook URL.' : form.type === 'slack' ? 'Paste Slack incoming webhook URL.' : form.type === 'webhook' ? 'Paste your endpoint URL.' : form.type === 'telegram' ? 'Bot token and chat ID are required.' : form.type === 'pagerduty' ? <span>Paste your PagerDuty <strong>Integration Key</strong> (Events API v2).</span> : form.type === 'opsgenie' ? <span>Paste your OpsGenie <strong>API Key</strong>.</span> : form.type === 'sms' ? <span>Enter your <strong>Twilio Account SID</strong>, Auth Token, and phone numbers. Alerts are sent as SMS.</span> : 'Enter destination email.'}
                </p>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1.5">
                    {form.type === 'telegram' ? 'Bot token' : form.type === 'email' ? 'Email address' : form.type === 'pagerduty' ? 'Integration Key' : form.type === 'opsgenie' ? 'API Key' : form.type === 'sms' ? 'Account SID' : 'URL'}
                  </label>
                  <input className={inputClass} value={form.a} onChange={(e) => setForm({ ...form, a: e.target.value })} />
                </div>
                {form.type === 'telegram' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-text-secondary mb-1.5">Chat ID</label>
                      <input className={inputClass} value={form.b} onChange={(e) => setForm({ ...form, b: e.target.value })} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-text-secondary mb-1.5">Parse mode</label>
                      <select className={inputClass} value={form.parseMode} onChange={(e) => setForm({ ...form, parseMode: e.target.value })}>
                        <option value="HTML">HTML (default — bold, code formatting)</option>
                        <option value="Markdown">Markdown</option>
                        <option value="">Plain text</option>
                      </select>
                    </div>
                  </>
                )}
                {form.type === 'opsgenie' && (
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1.5">Region</label>
                    <select className={inputClass} value={form.b || 'us'} onChange={(e) => setForm({ ...form, b: e.target.value })}>
                      <option value="us">US (api.opsgenie.com)</option>
                      <option value="eu">EU (api.eu.opsgenie.com)</option>
                    </select>
                  </div>
                )}
                {form.type === 'sms' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-text-secondary mb-1.5">Auth Token</label>
                      <input className={inputClass} type="password" placeholder="Twilio Auth Token" value={form.secret} onChange={(e) => setForm({ ...form, secret: e.target.value })} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-text-secondary mb-1.5">From number <span className="font-normal text-text-secondary">(E.164 format)</span></label>
                      <input className={inputClass} placeholder="+15551234567" value={form.b} onChange={(e) => setForm({ ...form, b: e.target.value })} />
                      <p className="mt-1 text-xs text-text-secondary">Your Twilio phone number.</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-text-secondary mb-1.5">To number <span className="font-normal text-text-secondary">(E.164 format)</span></label>
                      <input className={inputClass} placeholder="+15559876543" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
                      <p className="mt-1 text-xs text-text-secondary">The recipient phone number.</p>
                    </div>
                  </>
                )}
                {form.type === 'webhook' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-text-secondary mb-1.5">
                        Signing secret <span className="text-text-secondary font-normal">(optional)</span>
                      </label>
                      <input className={inputClass} type="password" placeholder="e.g. whsec_abc123…" value={form.secret} onChange={(e) => setForm({ ...form, secret: e.target.value })} />
                      <p className="mt-1.5 text-xs text-text-secondary">
                        {brand.name} adds <code className="text-accent text-xs">X-PulseDock-Signature: sha256=…</code> so your endpoint can verify delivery.
                      </p>
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="block text-sm font-medium text-text-secondary">
                          Custom payload template <span className="text-text-secondary font-normal">(optional)</span>
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            if (form.payloadTemplate.trim()) {
                              previewCreateTemplate(form.payloadTemplate);
                            } else {
                              setCreatePreviewResult({ rendered: JSON.stringify({ text: '🚨 Monitor "My API" is DOWN', extra: { monitor: { id: 'mon_123', name: 'My API', target: 'https://api.example.com', type: 'HTTP' }, run: { level: 'red', message: 'Connection refused', latencyMs: null, statusCode: 503 }, test: false } }, null, 2), valid: true });
                              setCreatePreviewVisible(true);
                            }
                          }}
                          className="flex items-center gap-1 text-xs text-accent hover:text-accent/80 transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          {createPreviewVisible ? 'Hide preview' : 'Preview'}
                        </button>
                      </div>
                      <textarea
                        className={`${inputClass} font-mono text-xs resize-y min-h-[120px]`}
                        placeholder={`{\n  "text": "{{text}}",\n  "monitor": "{{monitor.name}}",\n  "status": "{{run.level}}",\n  "latency": {{run.latencyMs}}\n}`}
                        value={form.payloadTemplate}
                        onChange={(e) => setForm({ ...form, payloadTemplate: e.target.value })}
                        spellCheck={false}
                      />
                      <p className="mt-1.5 text-xs text-text-secondary">
                        Leave blank for default payload. Variables: <code className="text-accent">{"{{text}}"}</code> <code className="text-accent">{"{{monitor.name}}"}</code> <code className="text-accent">{"{{monitor.target}}"}</code> <code className="text-accent">{"{{run.level}}"}</code> <code className="text-accent">{"{{run.message}}"}</code> <code className="text-accent">{"{{run.latencyMs}}"}</code> <code className="text-accent">{"{{run.statusCode}}"}</code> <code className="text-accent">{"{{timestamp}}"}</code>
                      </p>
                      {createPreviewVisible && createPreviewResult && (
                        <div className="mt-2 rounded-lg border border-border bg-surface-elevated p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Sample preview — not saved yet</span>
                            {createPreviewResult.valid
                              ? <span className="text-xs text-success flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Valid JSON</span>
                              : <span className="text-xs text-warning flex items-center gap-1"><XCircle className="w-3.5 h-3.5" /> Invalid JSON</span>
                            }
                          </div>
                          <pre className="text-xs font-mono text-text-primary whitespace-pre-wrap break-all overflow-x-auto max-h-48 overflow-y-auto">
                            {createPreviewResult.rendered || '(empty)'}
                          </pre>
                          {createPreviewResult.error && !createPreviewResult.valid && (
                            <p className="text-xs text-warning font-mono">{createPreviewResult.error}</p>
                          )}
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-text-secondary mb-1.5">
                        Custom headers <span className="text-text-secondary font-normal">(optional)</span>
                      </label>
                      <div className="space-y-2">
                        {form.customHeaders.map((h, i) => (
                          <div key={i} className="flex gap-2 items-center">
                            <input
                              className={`${inputClass} flex-1`}
                              placeholder="Header name"
                              value={h.key}
                              onChange={(e) => {
                                const updated = [...form.customHeaders];
                                updated[i] = { ...updated[i], key: e.target.value };
                                setForm({ ...form, customHeaders: updated });
                              }}
                            />
                            <input
                              className={`${inputClass} flex-1`}
                              type="password"
                              placeholder="Value"
                              value={h.value}
                              onChange={(e) => {
                                const updated = [...form.customHeaders];
                                updated[i] = { ...updated[i], value: e.target.value };
                                setForm({ ...form, customHeaders: updated });
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => setForm({ ...form, customHeaders: form.customHeaders.filter((_, j) => j !== i) })}
                              className="p-2 text-text-secondary hover:text-danger transition-colors shrink-0"
                              aria-label="Remove header"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, customHeaders: [...form.customHeaders, { key: '', value: '' }] })}
                        className="mt-2 text-xs text-accent hover:text-accent/80 transition-colors"
                      >
                        + Add header
                      </button>
                      <p className="mt-1.5 text-xs text-text-secondary">
                        These headers are sent with every webhook delivery. Useful for <code className="text-accent">Authorization: Bearer &lt;token&gt;</code> or <code className="text-accent">X-API-Key</code>.
                      </p>
                    </div>
                  </>
                )}
                {form.type === 'discord' && (
                  <>
                    <div className="border-t border-border pt-3">
                      <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-3">Discord Options</p>
                      <div className="space-y-3">
                        <div>
                          <label className="block text-sm font-medium text-text-secondary mb-1.5">Bot name <span className="font-normal text-text-secondary">(optional)</span></label>
                          <input className={inputClass} placeholder={brand.name} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-text-secondary mb-1.5">Avatar URL <span className="font-normal text-text-secondary">(optional)</span></label>
                          <input className={inputClass} placeholder="https://…/avatar.png" value={form.avatarUrl} onChange={(e) => setForm({ ...form, avatarUrl: e.target.value })} />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-text-secondary mb-1.5">Ping role ID <span className="font-normal text-text-secondary">(optional)</span></label>
                          <input className={inputClass} placeholder="123456789012345678" value={form.mentionRoleId} onChange={(e) => setForm({ ...form, mentionRoleId: e.target.value })} />
                          <p className="mt-1 text-xs text-text-secondary">Role will be pinged on every alert. Right-click the role → Copy ID.</p>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-text-secondary mb-1.5">Ping user ID <span className="font-normal text-text-secondary">(optional)</span></label>
                          <input className={inputClass} placeholder="123456789012345678" value={form.mentionUserId} onChange={(e) => setForm({ ...form, mentionUserId: e.target.value })} />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-text-secondary mb-1.5">Custom message <span className="font-normal text-text-secondary">(optional)</span></label>
                          <input className={inputClass} placeholder="{monitor} is {status}: {message}" value={form.messageTemplate} onChange={(e) => setForm({ ...form, messageTemplate: e.target.value })} />
                          <p className="mt-1 text-xs text-text-secondary">Variables: <code className="text-accent">{"{monitor}"}</code> <code className="text-accent">{"{status}"}</code> <code className="text-accent">{"{message}"}</code> <code className="text-accent">{"{latency}"}</code></p>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {wizardStep === 1 && (
              <div className="mt-4 border-t border-border pt-4 space-y-3">
                <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Alert Grouping</p>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-text-primary">Enable alert grouping</p>
                    <p className="text-xs text-text-secondary">Suppress alert storms by batching failures into one notification</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCreateAlertGrouping(!createAlertGrouping)}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${createAlertGrouping ? 'bg-accent' : 'bg-border'}`}
                    role="switch"
                    aria-checked={createAlertGrouping}
                  >
                    <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${createAlertGrouping ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                </div>
                {createAlertGrouping && (
                  <div className="space-y-3 pl-2 border-l border-border">
                    <div>
                      <label className="block text-sm font-medium text-text-secondary mb-1.5">Window (minutes)</label>
                      <input
                        type="number"
                        min={1}
                        max={1440}
                        className={inputClass}
                        value={createGroupWindowMin}
                        onChange={(e) => setCreateGroupWindowMin(Math.max(1, Math.min(1440, Number(e.target.value))))}
                      />
                      <p className="mt-1 text-xs text-text-secondary">Alerts within this window are candidates for grouping. Default: 5 minutes.</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-text-secondary mb-2">Group by</p>
                      <div className="space-y-2">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={createGroupByFolder} onChange={(e) => setCreateGroupByFolder(e.target.checked)} className="rounded border-border" />
                          <span className="text-sm text-text-primary">Folder <span className="text-text-secondary">(group monitors in the same folder)</span></span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={createGroupByTag} onChange={(e) => setCreateGroupByTag(e.target.checked)} className="rounded border-border" />
                          <span className="text-sm text-text-primary">Tag <span className="text-text-secondary">(group monitors with the same tag)</span></span>
                        </label>
                      </div>
                    </div>
                    <p className="text-xs text-text-secondary bg-surface-elevated rounded-lg px-3 py-2">
                      <strong>How it works:</strong> When 3+ monitors fail within the window, one grouped alert is sent instead of individual ones. After the window expires, pending groups with 2+ monitors are also flushed.
                    </p>
                  </div>
                )}
              </div>
            )}

            {wizardStep === 2 && (
              <div className="space-y-2">
                <p className="font-semibold text-text-primary">Step 3/3 · Review</p>
                <p className="text-sm text-text-primary">Name: <strong>{form.name}</strong></p>
                <p className="text-sm text-text-primary">Platform: <strong>{form.type}</strong></p>
                <p className="text-sm text-text-secondary">
                  {form.type === 'telegram' ? 'Bot token' : form.type === 'email' ? 'Email' : form.type === 'pagerduty' ? 'Integration Key' : form.type === 'opsgenie' ? 'API Key' : form.type === 'sms' ? 'Account SID' : 'URL'}: {form.a ? 'configured' : 'missing'}
                </p>
                {form.type === 'telegram' && (
                  <p className="text-sm text-text-secondary">Chat ID: {form.b ? 'configured' : 'missing'}</p>
                )}
                {form.type === 'opsgenie' && (
                  <p className="text-sm text-text-secondary">Region: {form.b === 'eu' ? 'EU (api.eu.opsgenie.com)' : 'US (api.opsgenie.com)'}</p>
                )}
                {form.type === 'webhook' && (
                  <p className="text-sm text-text-secondary">Signing secret: {form.secret ? '✓ set' : 'not set (optional)'}</p>
                )}
                {form.type === 'sms' && (
                  <>
                    <p className="text-sm text-text-secondary">Auth Token: {form.secret ? '✓ set' : 'missing'}</p>
                    <p className="text-sm text-text-secondary">From: {form.b || 'missing'}</p>
                    <p className="text-sm text-text-secondary">To: {form.username || 'missing'}</p>
                  </>
                )}
              </div>
            )}
          </Modal>

          {/* Edit Modal */}
          <Modal
            isOpen={editOpen}
            onClose={() => setEditOpen(false)}
            title="Edit alert channel"
            actions={
              <>
                <Button variant="secondary" onClick={() => setEditOpen(false)}>Cancel</Button>
                <Button onClick={saveEdit}>Save</Button>
              </>
            }
          >
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1.5">Name</label>
                <input className={inputClass} value={editName} onChange={(e) => setEditName(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1.5">
                  {selected?.type === 'telegram' ? 'Bot token' : selected?.type === 'email' ? 'Email address' : selected?.type === 'pagerduty' ? 'Integration Key' : selected?.type === 'opsgenie' ? 'API Key' : 'URL'}
                </label>
                <input className={inputClass} value={editA} onChange={(e) => setEditA(e.target.value)} />
              </div>
              {selected?.type === 'opsgenie' && (
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1.5">Region</label>
                  <select className={inputClass} value={editB || 'us'} onChange={(e) => setEditB(e.target.value)}>
                    <option value="us">US (api.opsgenie.com)</option>
                    <option value="eu">EU (api.eu.opsgenie.com)</option>
                  </select>
                </div>
              )}
              {selected?.type === 'telegram' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1.5">Chat ID</label>
                    <input className={inputClass} value={editB} onChange={(e) => setEditB(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1.5">Parse mode</label>
                    <select className={inputClass} value={editParseMode} onChange={(e) => setEditParseMode(e.target.value)}>
                      <option value="HTML">HTML (bold, code formatting)</option>
                      <option value="Markdown">Markdown</option>
                      <option value="">Plain text</option>
                    </select>
                  </div>
                </>
              )}
              {selected?.type === 'webhook' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1.5">
                      Signing secret <span className="text-text-secondary font-normal">(optional)</span>
                    </label>
                    <input className={inputClass} type="password" placeholder="Leave blank to keep existing" value={editSecret} onChange={(e) => setEditSecret(e.target.value)} />
                    <p className="mt-1.5 text-xs text-text-secondary">{brand.name} adds <code className="text-accent text-xs">X-PulseDock-Signature: sha256=…</code> to every payload.</p>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-sm font-medium text-text-secondary">
                        Custom payload template <span className="text-text-secondary font-normal">(optional)</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          if (editPreviewVisible) {
                            setEditPreviewVisible(false);
                          } else {
                            previewEditTemplate().catch(() => undefined);
                          }
                        }}
                        className="flex items-center gap-1 text-xs text-accent hover:text-accent/80 transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        {editPreviewVisible ? 'Hide preview' : 'Preview'}
                      </button>
                    </div>
                    <textarea
                      className={`${inputClass} font-mono text-xs resize-y min-h-[120px]`}
                      placeholder={`{\n  "text": "{{text}}",\n  "monitor": "{{monitor.name}}",\n  "status": "{{run.level}}",\n  "latency": {{run.latencyMs}}\n}`}
                      value={editPayloadTemplate}
                      onChange={(e) => setEditPayloadTemplate(e.target.value)}
                      spellCheck={false}
                    />
                    <p className="mt-1.5 text-xs text-text-secondary">
                      Leave blank for default payload. Variables: <code className="text-accent">{"{{text}}"}</code> <code className="text-accent">{"{{monitor.name}}"}</code> <code className="text-accent">{"{{monitor.target}}"}</code> <code className="text-accent">{"{{run.level}}"}</code> <code className="text-accent">{"{{run.message}}"}</code> <code className="text-accent">{"{{run.latencyMs}}"}</code> <code className="text-accent">{"{{run.statusCode}}"}</code> <code className="text-accent">{"{{timestamp}}"}</code>
                    </p>
                    {editPreviewVisible && (
                      <div className="mt-2 rounded-lg border border-border bg-surface-elevated p-3 space-y-2">
                        {editPreviewLoading ? (
                          <div className="flex items-center gap-2 py-2">
                            <div className="animate-spin w-3.5 h-3.5 border border-accent border-t-transparent rounded-full" />
                            <span className="text-xs text-text-secondary">Rendering…</span>
                          </div>
                        ) : editPreviewResult ? (
                          <>
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Preview</span>
                              {editPreviewResult.valid
                                ? <span className="text-xs text-success flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Valid JSON</span>
                                : <span className="text-xs text-warning flex items-center gap-1"><XCircle className="w-3.5 h-3.5" /> Invalid JSON</span>
                              }
                            </div>
                            <pre className="text-xs font-mono text-text-primary whitespace-pre-wrap break-all overflow-x-auto max-h-48 overflow-y-auto">
                              {editPreviewResult.rendered || '(empty)'}
                            </pre>
                            {editPreviewResult.error && !editPreviewResult.valid && (
                              <p className="text-xs text-warning font-mono">{editPreviewResult.error}</p>
                            )}
                          </>
                        ) : null}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1.5">
                      Custom headers <span className="text-text-secondary font-normal">(optional)</span>
                    </label>
                    <div className="space-y-2">
                      {editCustomHeaders.map((h, i) => (
                        <div key={i} className="flex gap-2 items-center">
                          <input
                            className={`${inputClass} flex-1`}
                            placeholder="Header name"
                            value={h.key}
                            onChange={(e) => {
                              const updated = [...editCustomHeaders];
                              updated[i] = { ...updated[i], key: e.target.value };
                              setEditCustomHeaders(updated);
                            }}
                          />
                          <input
                            className={`${inputClass} flex-1`}
                            type="password"
                            placeholder="Value"
                            value={h.value}
                            onChange={(e) => {
                              const updated = [...editCustomHeaders];
                              updated[i] = { ...updated[i], value: e.target.value };
                              setEditCustomHeaders(updated);
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => setEditCustomHeaders(editCustomHeaders.filter((_, j) => j !== i))}
                            className="p-2 text-text-secondary hover:text-danger transition-colors shrink-0"
                            aria-label="Remove header"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditCustomHeaders([...editCustomHeaders, { key: '', value: '' }])}
                      className="mt-2 text-xs text-accent hover:text-accent/80 transition-colors"
                    >
                      + Add header
                    </button>
                    <p className="mt-1.5 text-xs text-text-secondary">
                      These headers are sent with every webhook delivery. Useful for <code className="text-accent">Authorization: Bearer &lt;token&gt;</code> or <code className="text-accent">X-API-Key</code>.
                    </p>
                  </div>
                </>
              )}
              {selected?.type === 'discord' && (
                <div className="border-t border-border pt-3">
                  <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-3">Discord Options</p>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-text-secondary mb-1.5">Bot name <span className="font-normal">(optional)</span></label>
                      <input className={inputClass} placeholder={brand.name} value={editUsername} onChange={(e) => setEditUsername(e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-text-secondary mb-1.5">Avatar URL <span className="font-normal">(optional)</span></label>
                      <input className={inputClass} placeholder="https://…/avatar.png" value={editAvatarUrl} onChange={(e) => setEditAvatarUrl(e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-text-secondary mb-1.5">Ping role ID <span className="font-normal">(optional)</span></label>
                      <input className={inputClass} placeholder="123456789012345678" value={editMentionRoleId} onChange={(e) => setEditMentionRoleId(e.target.value)} />
                      <p className="mt-1 text-xs text-text-secondary">Right-click the role in Discord → Copy ID.</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-text-secondary mb-1.5">Ping user ID <span className="font-normal">(optional)</span></label>
                      <input className={inputClass} placeholder="123456789012345678" value={editMentionUserId} onChange={(e) => setEditMentionUserId(e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-text-secondary mb-1.5">Custom message <span className="font-normal">(optional)</span></label>
                      <input className={inputClass} placeholder="{monitor} is {status}: {message}" value={editMessageTemplate} onChange={(e) => setEditMessageTemplate(e.target.value)} />
                      <p className="mt-1 text-xs text-text-secondary">Variables: <code className="text-accent">{"{monitor}"}</code> <code className="text-accent">{"{status}"}</code> <code className="text-accent">{"{message}"}</code> <code className="text-accent">{"{latency}"}</code></p>
                    </div>
                  </div>
                </div>
              )}

              {/* Alert Grouping Section — shown for all channel types */}
              <div className="border-t border-border pt-4 space-y-3">
                <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Alert Grouping</p>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-text-primary">Enable alert grouping</p>
                    <p className="text-xs text-text-secondary">Suppress alert storms by batching failures into one notification</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditAlertGrouping(!editAlertGrouping)}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${editAlertGrouping ? 'bg-accent' : 'bg-border'}`}
                    role="switch"
                    aria-checked={editAlertGrouping}
                  >
                    <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${editAlertGrouping ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                </div>
                {editAlertGrouping && (
                  <div className="space-y-3 pl-2 border-l border-border">
                    <div>
                      <label className="block text-sm font-medium text-text-secondary mb-1.5">Window (minutes)</label>
                      <input
                        type="number"
                        min={1}
                        max={1440}
                        className={inputClass}
                        value={editGroupWindowMin}
                        onChange={(e) => setEditGroupWindowMin(Math.max(1, Math.min(1440, Number(e.target.value))))}
                      />
                      <p className="mt-1 text-xs text-text-secondary">Alerts within this window are candidates for grouping. Default: 5 minutes.</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-text-secondary mb-2">Group by</p>
                      <div className="space-y-2">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={editGroupByFolder} onChange={(e) => setEditGroupByFolder(e.target.checked)} className="rounded border-border" />
                          <span className="text-sm text-text-primary">Folder <span className="text-text-secondary">(group monitors in the same folder)</span></span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={editGroupByTag} onChange={(e) => setEditGroupByTag(e.target.checked)} className="rounded border-border" />
                          <span className="text-sm text-text-primary">Tag <span className="text-text-secondary">(group monitors with the same tag)</span></span>
                        </label>
                      </div>
                    </div>
                    <p className="text-xs text-text-secondary bg-surface-elevated rounded-lg px-3 py-2">
                      <strong>How it works:</strong> When 3+ monitors fail within the window, one grouped alert is sent instead of individual ones. After the window expires, pending groups with 2+ monitors are also flushed.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </Modal>

          {/* Delivery History Modal */}
          <Modal
            isOpen={deliveryOpen}
            onClose={() => setDeliveryOpen(false)}
            title={`Delivery History — ${selected?.name ?? ''}`}
            actions={<Button variant="secondary" onClick={() => setDeliveryOpen(false)}>Close</Button>}
          >
            {deliveryLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin w-6 h-6 border-2 border-accent border-t-transparent rounded-full" />
              </div>
            ) : deliveryHistory ? (
              <div className="space-y-4">
                {/* Stats row */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-surface-elevated rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-text-primary">{deliveryHistory.successCount + deliveryHistory.failedCount}</p>
                    <p className="text-xs text-text-secondary mt-0.5">Total</p>
                  </div>
                  <div className="bg-success/10 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-success">{deliveryHistory.successCount}</p>
                    <p className="text-xs text-text-secondary mt-0.5">Delivered</p>
                  </div>
                  <div className="bg-danger/10 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-danger">{deliveryHistory.failedCount}</p>
                    <p className="text-xs text-text-secondary mt-0.5">Failed</p>
                  </div>
                </div>
                {/* Log entries */}
                {deliveryHistory.deliveries.length === 0 ? (
                  <div className="text-center py-8">
                    <Activity className="w-10 h-10 text-text-secondary opacity-40 mx-auto mb-3" />
                    <p className="text-text-secondary">No deliveries yet</p>
                    <p className="text-xs text-text-secondary mt-1">Delivery logs appear here once alerts are sent</p>
                  </div>
                ) : (
                  <>
                    {deliveryHistory.deliveries.some((d) => d.status === 'failed') && (
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => retryAllFailed().catch(() => undefined)}
                          disabled={retryingAll}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-danger border border-danger/30 bg-danger/5 hover:bg-danger/10 rounded-lg transition-colors disabled:opacity-50"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${retryingAll ? 'animate-spin' : ''}`} />
                          {retryingAll ? 'Retrying…' : 'Retry all failed'}
                        </button>
                      </div>
                    )}
                    <div className="max-h-96 overflow-y-auto space-y-1.5 -mx-1 px-1">
                      {deliveryHistory.deliveries.map((d) => (
                        <div key={d.id} className={`flex items-start gap-3 p-3 rounded-lg border ${d.isGrouped ? 'bg-warning/5 border-warning/20' : d.status === 'success' ? 'bg-success/5 border-success/20' : 'bg-danger/5 border-danger/20'}`}>
                          <div className="mt-0.5 shrink-0">
                            {d.isGrouped
                              ? <span className="text-base leading-none">⚡</span>
                              : d.status === 'success'
                              ? <CheckCircle2 className="w-4 h-4 text-success" />
                              : <XCircle className="w-4 h-4 text-danger" />
                            }
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              {d.isGrouped ? (
                                <span className="text-xs font-semibold text-warning bg-warning/10 px-2 py-0.5 rounded-full">
                                  ⚡ Grouped ({d.groupedCount} monitors)
                                </span>
                              ) : (
                                <span className={`text-xs font-semibold uppercase ${d.status === 'success' ? 'text-success' : 'text-danger'}`}>
                                  {d.status}
                                </span>
                              )}
                              {d.trigger && !d.isGrouped && (
                                <span className="text-xs text-text-secondary bg-surface px-1.5 py-0.5 rounded">
                                  {d.trigger.replace('_', ' ')}
                                </span>
                              )}
                              {d.monitorName && !d.isGrouped && (
                                <span className="text-xs text-text-secondary truncate">· {d.monitorName}</span>
                              )}
                            </div>
                            {d.errorMessage && (
                              <p className="text-xs text-danger mt-1 font-mono break-all">{d.errorMessage}</p>
                            )}
                            <div className="flex items-center gap-3 mt-1">
                              <span className="text-xs text-text-secondary">{new Date(d.createdAt).toLocaleString()}</span>
                              {d.durationMs != null && (
                                <span className="flex items-center gap-1 text-xs text-text-secondary">
                                  <Clock className="w-3 h-3" />{d.durationMs}ms
                                </span>
                              )}
                            </div>
                          </div>
                          {d.status === 'failed' && (
                            <button
                              type="button"
                              onClick={() => retryDelivery(d.id).catch(() => undefined)}
                              disabled={retryingDeliveryId === d.id || retryingAll}
                              title="Retry this delivery"
                              className="shrink-0 p-1.5 rounded-lg text-text-secondary hover:text-accent hover:bg-accent/10 transition-colors disabled:opacity-50"
                            >
                              <RefreshCw className={`w-3.5 h-3.5 ${retryingDeliveryId === d.id ? 'animate-spin' : ''}`} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            ) : null}
          </Modal>

          {/* Delete Confirm Modal */}
          <Modal
            isOpen={deleteOpen}
            onClose={() => setDeleteOpen(false)}
            title="Delete alert channel"
            actions={
              <>
                <Button variant="secondary" onClick={() => setDeleteOpen(false)}>Cancel</Button>
                <Button variant="primary" className="!bg-danger hover:!bg-danger/80" onClick={confirmDelete}>Delete</Button>
              </>
            }
          >
            <p className="text-text-primary">Delete <strong>{selected?.name}</strong>?</p>
          </Modal>

          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-text-primary">Alert Channels</h2>
              <p className="text-text-secondary text-sm mt-1">
                {channels.length} {channels.length === 1 ? 'channel' : 'channels'} configured
              </p>
            </div>
            <div className="flex items-center gap-2">
              {/* Column visibility toggle */}
              {channels.length > 0 && (
                <div className="relative">
                  <button
                    onClick={() => setShowColPicker((v) => !v)}
                    title="Toggle column visibility"
                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors ${showColPicker ? 'border-accent/50 bg-accent/10 text-accent' : 'border-border text-text-secondary hover:text-text-primary hover:bg-surface-elevated'}`}
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Columns</span>
                  </button>
                  {showColPicker && (
                    <div className="absolute right-0 top-full mt-1 z-30 w-48 rounded-xl border border-border bg-surface shadow-xl shadow-black/30 p-2 space-y-1">
                      <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider px-2 py-1">Visible Columns</p>
                      {([['name', 'Name'], ['type', 'Type'], ['lastTriggered', 'Last Triggered'], ['created', 'Created'], ['actions', 'Actions']] as [string, string][]).map(([col, label]) => (
                        <button
                          key={col}
                          onClick={() => toggleCol(col)}
                          className="flex items-center justify-between w-full rounded-lg px-2 py-1.5 text-xs hover:bg-surface-elevated transition-colors"
                        >
                          <span className={visibleCols[col] ? 'text-text-primary' : 'text-text-muted'}>{label}</span>
                          <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center text-[10px] ${visibleCols[col] ? 'bg-accent border-accent text-white' : 'border-border'}`}>
                            {visibleCols[col] ? '✓' : ''}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {channels.length > 0 && (
                <Button variant="secondary" size="lg" onClick={testAllChannels} disabled={testingAll}>
                  <span className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" />
                    {testingAll ? 'Testing…' : 'Test All'}
                  </span>
                </Button>
              )}
              <Link href="/alerts/history">
                <Button variant="secondary" size="lg">
                  <span className="flex items-center gap-2"><Activity className="w-4 h-4" /> View History</span>
                </Button>
              </Link>
              <Button size="lg" onClick={() => { resetCreateForm(); setWizardOpen(true); }}>
                <span className="flex items-center gap-2"><Plus className="w-4 h-4" /> Create channel</span>
              </Button>
            </div>
          </div>

          {channels.length === 0 ? (
            <Card className="text-center py-16">
              <div className="p-4 rounded-2xl bg-surface-elevated inline-block mb-4">
                <Bell className="w-12 h-12 text-text-secondary opacity-50" />
              </div>
              <p className="text-text-primary text-lg font-medium mb-2">No alert channels configured</p>
              <p className="text-text-secondary text-sm mb-6">
                Set up Discord, Slack, Telegram, Email, or webhook alerts to get notified when monitors fail
              </p>
              <Button size="lg" onClick={() => { resetCreateForm(); setWizardOpen(true); }}>
                <span className="flex items-center gap-2"><Plus className="w-4 h-4" /> Add Alert Channel</span>
              </Button>
            </Card>
          ) : (
          <>
          {/* Table Card */}
          <Card className="p-0">
            <div className="overflow-x-auto">
            <Table>
              <TableHead className="sticky top-0 z-10 bg-surface-elevated/95 backdrop-blur-sm">
                <tr className="bg-surface-elevated border-b border-border">
                  <SortableHeader sortKey="name" sort={sort} onSort={toggle} className={visibleCols.name ? '' : 'hidden'}>Name</SortableHeader>
                  <SortableHeader sortKey="type" sort={sort} onSort={toggle} className={visibleCols.type ? '' : 'hidden'}>Type</SortableHeader>
                  <SortableHeader sortKey="lastTriggeredAt" sort={sort} onSort={toggle} className={visibleCols.lastTriggered ? '' : 'hidden'}>Last Triggered</SortableHeader>
                  <SortableHeader sortKey="createdAt" sort={sort} onSort={toggle} className={visibleCols.created ? '' : 'hidden'}>Created</SortableHeader>
                  <th className={`px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider${visibleCols.actions ? '' : ' hidden'}`}>Actions</th>
                </tr>
              </TableHead>
              <TableBody>
                {pageRows.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className={visibleCols.name ? '' : 'hidden'}>
                      <div className="flex items-center gap-2">
                        <ChannelTypeIcon type={c.type} />
                        <span className="font-medium text-text-primary">{c.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className={visibleCols.type ? '' : 'hidden'}>
                      <Badge className="capitalize">{c.type}</Badge>
                    </TableCell>
                    <TableCell className={visibleCols.lastTriggered ? '' : 'hidden'}>
                      <span className="text-sm text-text-secondary">
                        {c.lastTriggeredAt ? relativeTime(c.lastTriggeredAt) : 'Never'}
                      </span>
                    </TableCell>
                    <TableCell className={visibleCols.created ? '' : 'hidden'}>{new Date(c.createdAt).toLocaleString()}</TableCell>
                    <TableCell className={visibleCols.actions ? '' : 'hidden'}>
                      <div className="flex items-center gap-2">
                        <Button variant="secondary" size="sm" onClick={() => testChannel(c)}>Test</Button>
                        <Button variant="ghost" size="sm" onClick={() => openDeliveries(c)} aria-label={`Delivery history for ${c.name}`} title="History">
                          <span className="flex items-center gap-1.5">
                            <Activity className="w-4 h-4" />
                            <span className="hidden sm:inline text-xs">History</span>
                          </span>
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => openEdit(c)} aria-label={`Edit ${c.name}`} title="Edit channel">
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => openDelete(c)} className="text-danger hover:text-danger" aria-label={`Delete ${c.name}`} title="Delete channel">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <TablePagination
              page={safePage}
              pageCount={pages}
              pageSize={pageSize}
              totalItems={sortedChannels.length}
              onPage={setPage}
              onPageSize={(s) => { setPageSize(s); setPage(1); }}
              pageSizeOptions={[10, 25, 50, 100]}
              onExportCSV={handleExportCSV}
              onExportJSON={handleExportJSON}
            />
            </div>
          </Card>
          </>
          )}
        </>
      )}
    </AppFrame>
  );
}

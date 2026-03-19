'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Edit, Trash2, ChevronLeft, ChevronRight, Activity, CheckCircle2, XCircle, Clock, Bell, Mail, MessageSquare, Hash, Globe, Send } from 'lucide-react';
import { AppFrame } from '../../components/app-frame';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Badge } from '../components/Badge';
import { Modal } from '../components/Modal';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '../components/Table';
import { Select } from '../components/Select';
import { getUser } from '../../components/auth';
import { api } from '../../lib/api';
import { useToast } from '../../components/ui/toast';

type AlertType = 'discord' | 'webhook' | 'slack' | 'telegram' | 'email';

type AlertChannel = {
  id: string;
  name: string;
  type: AlertType;
  config: Record<string, unknown>;
  createdAt: string;
  lastTriggeredAt?: string | null;
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

  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);
  const [form, setForm] = useState({
    name: '', type: 'discord' as AlertType,
    a: '', b: '', secret: '',
    // Discord extras
    username: '', avatarUrl: '', mentionRoleId: '', mentionUserId: '', messageTemplate: '',
    // Telegram extras
    parseMode: 'HTML',
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
  const [deliveryOpen, setDeliveryOpen] = useState(false);
  const [deliveryHistory, setDeliveryHistory] = useState<DeliveryHistory | null>(null);
  const [deliveryLoading, setDeliveryLoading] = useState(false);

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
    setForm({ name: '', type: 'discord', a: '', b: '', secret: '', username: '', avatarUrl: '', mentionRoleId: '', mentionUserId: '', messageTemplate: '', parseMode: 'HTML' });
  }

  function next() {
    setWizardStep((s) => Math.min(2, s + 1));
  }

  function back() {
    setWizardStep((s) => Math.max(0, s - 1));
  }

  function buildConfig(type: AlertType, a: string, b: string, secret?: string, extras?: {
    username?: string; avatarUrl?: string; mentionRoleId?: string; mentionUserId?: string; messageTemplate?: string; parseMode?: string;
  }) {
    if (type === 'discord') {
      const cfg: Record<string, string> = { webhookUrl: a };
      if (extras?.username?.trim()) cfg.username = extras.username.trim();
      if (extras?.avatarUrl?.trim()) cfg.avatarUrl = extras.avatarUrl.trim();
      if (extras?.mentionRoleId?.trim()) cfg.mentionRoleId = extras.mentionRoleId.trim();
      if (extras?.mentionUserId?.trim()) cfg.mentionUserId = extras.mentionUserId.trim();
      if (extras?.messageTemplate?.trim()) cfg.messageTemplate = extras.messageTemplate.trim();
      return cfg;
    }
    if (type === 'slack') return { webhookUrl: a };
    if (type === 'webhook') {
      const cfg: Record<string, string> = { url: a };
      if (secret?.trim()) cfg.secret = secret.trim();
      return cfg;
    }
    if (type === 'telegram') {
      const cfg: Record<string, string> = { botToken: a, chatId: b };
      if (extras?.parseMode) cfg.parseMode = extras.parseMode;
      return cfg;
    }
    return { to: a };
  }

  async function createChannel() {
    try {
      const config = buildConfig(form.type, form.a, form.b, form.secret, { username: form.username, avatarUrl: form.avatarUrl, mentionRoleId: form.mentionRoleId, mentionUserId: form.mentionUserId, messageTemplate: form.messageTemplate, parseMode: form.parseMode });
      await api('/v1/alert-channels', undefined, { method: 'POST', body: JSON.stringify({ name: form.name, type: form.type, config }) });
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
    } else if (channel.type === 'telegram') {
      setEditA(String(channel.config.botToken ?? ''));
      setEditB(String(channel.config.chatId ?? ''));
    } else {
      setEditA(String(channel.config.to ?? ''));
      setEditB('');
      setEditSecret('');
    }
    setEditOpen(true);
  }

  async function saveEdit() {
    if (!selected) return;
    try {
      const config = buildConfig(selected.type, editA, editB, editSecret, { username: editUsername, avatarUrl: editAvatarUrl, mentionRoleId: editMentionRoleId, mentionUserId: editMentionUserId, messageTemplate: editMessageTemplate, parseMode: editParseMode });
      await api(`/v1/alert-channels/${selected.id}`, '', {
        method: 'PATCH',
        body: JSON.stringify({ name: editName, config }),
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
  const pages = Math.max(1, Math.ceil(channels.length / size));
  const safePage = Math.min(page, pages);
  const pageRows = channels.slice((safePage - 1) * size, safePage * size);

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
                  ]}
                />
              </div>
            )}

            {wizardStep === 1 && (
              <div className="space-y-4">
                <p className="font-semibold text-text-primary">Step 2/3 · Credentials</p>
                <p className="text-sm text-text-secondary">
                  {form.type === 'discord' ? 'Paste Discord webhook URL.' : form.type === 'slack' ? 'Paste Slack incoming webhook URL.' : form.type === 'webhook' ? 'Paste your endpoint URL.' : form.type === 'telegram' ? 'Bot token and chat ID are required.' : 'Enter destination email.'}
                </p>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1.5">
                    {form.type === 'telegram' ? 'Bot token' : form.type === 'email' ? 'Email address' : 'URL'}
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
                {form.type === 'webhook' && (
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1.5">
                      Signing secret <span className="text-text-secondary font-normal">(optional)</span>
                    </label>
                    <input className={inputClass} type="password" placeholder="e.g. whsec_abc123…" value={form.secret} onChange={(e) => setForm({ ...form, secret: e.target.value })} />
                    <p className="mt-1.5 text-xs text-text-secondary">
                      PulseDock adds <code className="text-accent text-xs">X-PulseDock-Signature: sha256=…</code> so your endpoint can verify delivery.
                    </p>
                  </div>
                )}
                {form.type === 'discord' && (
                  <>
                    <div className="border-t border-border pt-3">
                      <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-3">Discord Options</p>
                      <div className="space-y-3">
                        <div>
                          <label className="block text-sm font-medium text-text-secondary mb-1.5">Bot name <span className="font-normal text-text-secondary">(optional)</span></label>
                          <input className={inputClass} placeholder="PulseDock" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
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

            {wizardStep === 2 && (
              <div className="space-y-2">
                <p className="font-semibold text-text-primary">Step 3/3 · Review</p>
                <p className="text-sm text-text-primary">Name: <strong>{form.name}</strong></p>
                <p className="text-sm text-text-primary">Platform: <strong>{form.type}</strong></p>
                <p className="text-sm text-text-secondary">
                  {form.type === 'telegram' ? 'Bot token' : form.type === 'email' ? 'Email' : 'URL'}: {form.a ? 'configured' : 'missing'}
                </p>
                {form.type === 'telegram' && (
                  <p className="text-sm text-text-secondary">Chat ID: {form.b ? 'configured' : 'missing'}</p>
                )}
                {form.type === 'webhook' && (
                  <p className="text-sm text-text-secondary">Signing secret: {form.secret ? '✓ set' : 'not set (optional)'}</p>
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
                  {selected?.type === 'telegram' ? 'Bot token' : selected?.type === 'email' ? 'Email address' : 'URL'}
                </label>
                <input className={inputClass} value={editA} onChange={(e) => setEditA(e.target.value)} />
              </div>
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
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1.5">
                    Signing secret <span className="text-text-secondary font-normal">(optional)</span>
                  </label>
                  <input className={inputClass} type="password" placeholder="Leave blank to keep existing" value={editSecret} onChange={(e) => setEditSecret(e.target.value)} />
                  <p className="mt-1.5 text-xs text-text-secondary">PulseDock adds <code className="text-accent text-xs">X-PulseDock-Signature: sha256=…</code> to every payload.</p>
                </div>
              )}
              {selected?.type === 'discord' && (
                <div className="border-t border-border pt-3">
                  <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-3">Discord Options</p>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-text-secondary mb-1.5">Bot name <span className="font-normal">(optional)</span></label>
                      <input className={inputClass} placeholder="PulseDock" value={editUsername} onChange={(e) => setEditUsername(e.target.value)} />
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
                  <div className="max-h-96 overflow-y-auto space-y-1.5 -mx-1 px-1">
                    {deliveryHistory.deliveries.map((d) => (
                      <div key={d.id} className={`flex items-start gap-3 p-3 rounded-lg border ${d.status === 'success' ? 'bg-success/5 border-success/20' : 'bg-danger/5 border-danger/20'}`}>
                        <div className="mt-0.5 shrink-0">
                          {d.status === 'success'
                            ? <CheckCircle2 className="w-4 h-4 text-success" />
                            : <XCircle className="w-4 h-4 text-danger" />
                          }
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-xs font-semibold uppercase ${d.status === 'success' ? 'text-success' : 'text-danger'}`}>
                              {d.status}
                            </span>
                            {d.trigger && (
                              <span className="text-xs text-text-secondary bg-surface px-1.5 py-0.5 rounded">
                                {d.trigger.replace('_', ' ')}
                              </span>
                            )}
                            {d.monitorName && (
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
                      </div>
                    ))}
                  </div>
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
            <Button size="lg" onClick={() => { resetCreateForm(); setWizardOpen(true); }}>
              <span className="flex items-center gap-2"><Plus className="w-4 h-4" /> Create channel</span>
            </Button>
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
              <TableHead>
                <TableRow hover={false}>
                  <TableHeader>Name</TableHeader>
                  <TableHeader>Type</TableHeader>
                  <TableHeader>Last Triggered</TableHeader>
                  <TableHeader>Created</TableHeader>
                  <TableHeader>Actions</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {pageRows.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <ChannelTypeIcon type={c.type} />
                        <span className="font-medium text-text-primary">{c.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className="capitalize">{c.type}</Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-text-secondary">
                        {c.lastTriggeredAt ? relativeTime(c.lastTriggeredAt) : 'Never'}
                      </span>
                    </TableCell>
                    <TableCell>{new Date(c.createdAt).toLocaleString()}</TableCell>
                    <TableCell>
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

            {/* Pagination */}
            <div className="flex flex-col gap-3 p-4 border-t border-border sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage <= 1} aria-label="Previous page">
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-sm text-text-secondary" aria-live="polite">Page {safePage} of {pages}</span>
                <Button variant="ghost" size="sm" onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={safePage >= pages} aria-label="Next page">
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
              <div className="flex items-center gap-2 sm:justify-end">
                <span className="text-sm text-text-secondary">Rows per page</span>
                <Select
                  value={pageSize}
                  onChange={(v) => { setPageSize(v || '10'); setPage(1); }}
                  options={[{ value: '10', label: '10' }, { value: '25', label: '25' }, { value: '50', label: '50' }]}
                  className="w-20"
                />
              </div>
            </div>
            </div>
          </Card>
          </>
          )}
        </>
      )}
    </AppFrame>
  );
}

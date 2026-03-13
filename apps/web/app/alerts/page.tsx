'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Edit, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import { AppFrame } from '../../components/app-frame';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Badge } from '../components/Badge';
import { Modal } from '../components/Modal';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '../components/Table';
import { Select } from '../components/Select';
import { getUser } from '../../components/auth';
import { api } from '../../lib/api';

type AlertType = 'discord' | 'webhook' | 'slack' | 'telegram' | 'email';

type AlertChannel = {
  id: string;
  name: string;
  type: AlertType;
  config: Record<string, unknown>;
  createdAt: string;
};

const inputClass = "w-full px-4 py-3 bg-surface border border-border rounded-lg text-text-primary placeholder-text-secondary focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent";

export default function AlertsPage() {
  const router = useRouter();
  const [channels, setChannels] = useState<AlertChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState('10');

  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);
  const [form, setForm] = useState({ name: '', type: 'discord' as AlertType, a: '', b: '' });

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selected, setSelected] = useState<AlertChannel | null>(null);
  const [editName, setEditName] = useState('');
  const [editA, setEditA] = useState('');
  const [editB, setEditB] = useState('');

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
    setForm({ name: '', type: 'discord', a: '', b: '' });
  }

  function next() {
    setWizardStep((s) => Math.min(2, s + 1));
  }

  function back() {
    setWizardStep((s) => Math.max(0, s - 1));
  }

  function buildConfig(type: AlertType, a: string, b: string) {
    if (type === 'discord' || type === 'slack') return { webhookUrl: a };
    if (type === 'webhook') return { url: a };
    if (type === 'telegram') return { botToken: a, chatId: b };
    return { to: a };
  }

  async function createChannel() {
    const config = buildConfig(form.type, form.a, form.b);
    await api('/v1/alert-channels', undefined, { method: 'POST', body: JSON.stringify({ name: form.name, type: form.type, config }) });
    setWizardOpen(false);
    resetCreateForm();
    await load();
  }

  async function testChannel(channelId: string) {
    await api('/v1/alert-channels/test', undefined, { method: 'POST', body: JSON.stringify({ channelId }) });
  }

  function openEdit(channel: AlertChannel) {
    setSelected(channel);
    setEditName(channel.name);
    if (channel.type === 'discord' || channel.type === 'slack') {
      setEditA(String(channel.config.webhookUrl ?? ''));
      setEditB('');
    } else if (channel.type === 'webhook') {
      setEditA(String(channel.config.url ?? ''));
      setEditB('');
    } else if (channel.type === 'telegram') {
      setEditA(String(channel.config.botToken ?? ''));
      setEditB(String(channel.config.chatId ?? ''));
    } else {
      setEditA(String(channel.config.to ?? ''));
      setEditB('');
    }
    setEditOpen(true);
  }

  async function saveEdit() {
    if (!selected) return;
    const config = buildConfig(selected.type, editA, editB);
    await api(`/v1/alert-channels/${selected.id}`, '', {
      method: 'PATCH',
      body: JSON.stringify({ name: editName, config }),
    });
    setEditOpen(false);
    await load();
  }

  function openDelete(channel: AlertChannel) {
    setSelected(channel);
    setDeleteOpen(true);
  }

  async function confirmDelete() {
    if (!selected) return;
    await api(`/v1/alert-channels/${selected.id}`, '', { method: 'DELETE' });
    setDeleteOpen(false);
    await load();
  }

  const size = Number(pageSize);
  const pages = Math.max(1, Math.ceil(channels.length / size));
  const safePage = Math.min(page, pages);
  const pageRows = channels.slice((safePage - 1) * size, safePage * size);

  return (
    <AppFrame title="Alerts" subtitle="Configure alert channels and verify delivery.">
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
                  <label className="block text-sm font-medium text-text-secondary mb-1.5">Primary</label>
                  <input className={inputClass} value={form.a} onChange={(e) => setForm({ ...form, a: e.target.value })} />
                </div>
                {form.type === 'telegram' && (
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1.5">Secondary (chat ID)</label>
                    <input className={inputClass} value={form.b} onChange={(e) => setForm({ ...form, b: e.target.value })} />
                  </div>
                )}
              </div>
            )}

            {wizardStep === 2 && (
              <div className="space-y-2">
                <p className="font-semibold text-text-primary">Step 3/3 · Review</p>
                <p className="text-sm text-text-primary">Name: <strong>{form.name}</strong></p>
                <p className="text-sm text-text-primary">Platform: <strong>{form.type}</strong></p>
                <p className="text-sm text-text-secondary">Primary: {form.a ? 'configured' : 'missing'}</p>
                {form.type === 'telegram' && (
                  <p className="text-sm text-text-secondary">Secondary: {form.b ? 'configured' : 'missing'}</p>
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
                <label className="block text-sm font-medium text-text-secondary mb-1.5">Primary</label>
                <input className={inputClass} value={editA} onChange={(e) => setEditA(e.target.value)} />
              </div>
              {selected?.type === 'telegram' && (
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1.5">Secondary (chat ID)</label>
                  <input className={inputClass} value={editB} onChange={(e) => setEditB(e.target.value)} />
                </div>
              )}
            </div>
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
                <Plus className="w-12 h-12 text-text-secondary opacity-50" />
              </div>
              <p className="text-text-primary text-lg font-medium mb-2">No alert channels yet</p>
              <p className="text-text-secondary text-sm mb-6">
                Set up Discord, Slack, Telegram, or webhook alerts to get notified when monitors fail
              </p>
              <Button size="lg" onClick={() => { resetCreateForm(); setWizardOpen(true); }}>Create your first channel</Button>
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
                  <TableHeader>Created</TableHeader>
                  <TableHeader>Config</TableHeader>
                  <TableHeader>Actions</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {pageRows.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>{c.name}</TableCell>
                    <TableCell>{c.type}</TableCell>
                    <TableCell>{new Date(c.createdAt).toLocaleString()}</TableCell>
                    <TableCell>
                      <Badge>{Object.keys(c.config ?? {}).join(', ') || '—'}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button variant="secondary" size="sm" onClick={() => testChannel(c.id)}>Test</Button>
                        <Button variant="ghost" size="sm" onClick={() => openEdit(c)}>
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => openDelete(c)} className="text-danger hover:text-danger">
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
                <Button variant="ghost" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage <= 1}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-sm text-text-secondary">Page {safePage} of {pages}</span>
                <Button variant="ghost" size="sm" onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={safePage >= pages}>
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

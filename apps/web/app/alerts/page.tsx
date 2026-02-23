'use client';

import { Badge, Button, Card, Group, Pagination, Select, Table, Text, TextInput } from '@mantine/core';
import { ResponsiveTable } from '../../components/ui/responsive-table';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppFrame } from '../../components/app-frame';
import { LoadingState } from '../../components/ui/loading-state';
import { AppModal, ConfirmModal } from '../../components/ui/modal-framework';
import { getToken, getUser } from '../../components/auth';
import { api } from '../../lib/api';

type AlertType = 'discord' | 'webhook' | 'slack' | 'telegram' | 'email';

type AlertChannel = {
  id: string;
  name: string;
  type: AlertType;
  config: Record<string, unknown>;
  createdAt: string;
};

export default function AlertsPage() {
  const router = useRouter();
  const token = useMemo(() => (typeof window !== 'undefined' ? getToken() : ''), []);
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
    if (!user || !token) router.push('/login');
  }, [router, token]);

  async function load() {
    setLoading(true);
    try {
      setChannels(await api<AlertChannel[]>('/v1/alert-channels', token));
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
    await api('/v1/alert-channels', token, { method: 'POST', body: JSON.stringify({ name: form.name, type: form.type, config }) });
    setWizardOpen(false);
    resetCreateForm();
    await load();
  }

  async function testChannel(channelId: string) {
    await api('/v1/alert-channels/test', token, { method: 'POST', body: JSON.stringify({ channelId }) });
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
    await api(`/v1/alert-channels/${selected.id}`, token, {
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
    await api(`/v1/alert-channels/${selected.id}`, token, { method: 'DELETE' });
    setDeleteOpen(false);
    await load();
  }

  const size = Number(pageSize);
  const pages = Math.max(1, Math.ceil(channels.length / size));
  const safePage = Math.min(page, pages);
  const pageRows = channels.slice((safePage - 1) * size, safePage * size);

  return (
    <AppFrame title="Alerts" subtitle="Configure alert channels and verify delivery.">
      {loading ? <LoadingState label="Loading alert channels..." /> : <>
      <AppModal opened={wizardOpen} onClose={() => { setWizardOpen(false); resetCreateForm(); }} title="Create alert channel">
        {wizardStep === 0 ? (
          <>
            <Text fw={600} mb="sm">Step 1/3 · Basics</Text>
            <TextInput label="Channel name" value={form.name} onChange={(e) => setForm({ ...form, name: e.currentTarget.value })} />
            <Select mt="sm" label="Platform" value={form.type} onChange={(v) => setForm({ ...form, type: (v as AlertType) || 'discord' })} data={['discord', 'webhook', 'slack', 'telegram', 'email']} />
          </>
        ) : null}

        {wizardStep === 1 ? (
          <>
            <Text fw={600} mb="sm">Step 2/3 · Credentials</Text>
            <Text size="sm" c="dimmed" mb="xs">
              {form.type === 'discord' ? 'Paste Discord webhook URL.' : form.type === 'slack' ? 'Paste Slack incoming webhook URL.' : form.type === 'webhook' ? 'Paste your endpoint URL.' : form.type === 'telegram' ? 'Bot token and chat ID are required.' : 'Enter destination email.'}
            </Text>
            <TextInput label="Primary" value={form.a} onChange={(e) => setForm({ ...form, a: e.currentTarget.value })} />
            {form.type === 'telegram' ? <TextInput mt="sm" label="Secondary (chat ID)" value={form.b} onChange={(e) => setForm({ ...form, b: e.currentTarget.value })} /> : null}
          </>
        ) : null}

        {wizardStep === 2 ? (
          <>
            <Text fw={600} mb="sm">Step 3/3 · Review</Text>
            <Text size="sm">Name: <b>{form.name}</b></Text>
            <Text size="sm">Platform: <b>{form.type}</b></Text>
            <Text size="sm" c="dimmed">Primary: {form.a ? 'configured' : 'missing'}</Text>
            {form.type === 'telegram' ? <Text size="sm" c="dimmed">Secondary: {form.b ? 'configured' : 'missing'}</Text> : null}
          </>
        ) : null}

        <Group justify="space-between" mt="md">
          <Button variant="default" onClick={back} disabled={wizardStep === 0}>Back</Button>
          {wizardStep < 2 ? <Button onClick={next}>Next</Button> : <Button color="teal" onClick={createChannel}>Create channel</Button>}
        </Group>
      </AppModal>

      <AppModal opened={editOpen} onClose={() => setEditOpen(false)} title="Edit alert channel">
        <TextInput label="Name" value={editName} onChange={(e) => setEditName(e.currentTarget.value)} />
        <TextInput mt="sm" label="Primary" value={editA} onChange={(e) => setEditA(e.currentTarget.value)} />
        {selected?.type === 'telegram' ? <TextInput mt="sm" label="Secondary (chat ID)" value={editB} onChange={(e) => setEditB(e.currentTarget.value)} /> : null}
        <Group mt="md" justify="flex-end">
          <Button variant="default" onClick={() => setEditOpen(false)}>Cancel</Button>
          <Button onClick={saveEdit}>Save</Button>
        </Group>
      </AppModal>

      <ConfirmModal
        opened={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete alert channel"
        message={<>Delete <b>{selected?.name}</b>?</>}
        onConfirm={confirmDelete}
        confirmLabel="Delete"
      />

      <Card withBorder radius="md" mb="md">
        <Group justify="space-between">
          <Text fw={700}>Channels</Text>
          <Button onClick={() => { resetCreateForm(); setWizardOpen(true); }}>Create channel</Button>
        </Group>
      </Card>

      <Card withBorder radius="md">
        <ResponsiveTable minWidth={820}>
          <Table.Thead><Table.Tr><Table.Th>Name</Table.Th><Table.Th>Type</Table.Th><Table.Th>Created</Table.Th><Table.Th>Config</Table.Th><Table.Th>Actions</Table.Th></Table.Tr></Table.Thead>
          <Table.Tbody>
            {pageRows.map((c) => (
              <Table.Tr key={c.id}>
                <Table.Td>{c.name}</Table.Td>
                <Table.Td>{c.type}</Table.Td>
                <Table.Td>{new Date(c.createdAt).toLocaleString()}</Table.Td>
                <Table.Td><Badge variant="light">{Object.keys(c.config ?? {}).join(', ') || '—'}</Badge></Table.Td>
                <Table.Td>
                  <Group gap="xs" wrap="nowrap">
                    <Button size="xs" variant="light" onClick={() => testChannel(c.id)}>Test</Button>
                    <Button size="xs" variant="light" onClick={() => openEdit(c)}>Edit</Button>
                    <Button size="xs" variant="light" color="red" onClick={() => openDelete(c)}>Delete</Button>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </ResponsiveTable>
        <Group justify="space-between" mt="md">
          <Pagination value={safePage} onChange={setPage} total={pages} />
          <Group gap="xs">
            <Text size="sm" c="dimmed">Rows per page</Text>
            <Select w={90} value={pageSize} onChange={(v) => { setPageSize(v || '10'); setPage(1); }} data={['10', '25', '50']} />
          </Group>
        </Group>
      </Card>
      </>}
    </AppFrame>
  );
}

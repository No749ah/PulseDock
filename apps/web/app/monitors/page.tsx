'use client';

import { Badge, Button, Card, Collapse, Group, NumberInput, Pagination, Select, Switch, Table, Text, TextInput } from '@mantine/core';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppFrame } from '../../components/app-frame';
import { LoadingState } from '../../components/ui/loading-state';
import { AppModal, ConfirmModal } from '../../components/ui/modal-framework';
import { getToken, getUser } from '../../components/auth';
import { api } from '../../lib/api';

type Monitor = { id: string; name: string; type: 'HTTP' | 'GIT_RELEASE' | 'DOCKER_IMAGE'; target: string; intervalSec: number };
type Run = { id: string; monitorId: string; level: 'green' | 'yellow' | 'red'; checkedAt: string };
type RunDetail = { id: string; monitorId: string; checkedAt: string; ok: boolean; statusCode: number; latencyMs: number | null; message: string; level: 'green'|'yellow'|'red' };
type Overview = { latestRuns: Run[] };

export default function MonitorsPage() {
  const router = useRouter();
  const token = useMemo(() => (typeof window !== 'undefined' ? getToken() : ''), []);
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [filter, setFilter] = useState<'ALL' | Monitor['type']>('ALL');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState('10');

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createStep, setCreateStep] = useState(0);
  const [createName, setCreateName] = useState('');
  const [createTarget, setCreateTarget] = useState('');
  const [createInterval, setCreateInterval] = useState(60);
  const [createTimeoutMs, setCreateTimeoutMs] = useState(5000);
  const [createAdvanced, setCreateAdvanced] = useState(false);
  const [createEnabled, setCreateEnabled] = useState(true);
  const [selected, setSelected] = useState<Monitor | null>(null);
  const [historyRows, setHistoryRows] = useState<RunDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [editName, setEditName] = useState('');
  const [editTarget, setEditTarget] = useState('');
  const [editInterval, setEditInterval] = useState(60);

  useEffect(() => {
    const user = getUser();
    if (!user || !token) router.push('/login');
  }, [router, token]);

  async function load() {
    setLoading(true);
    try {
      const [m, o] = await Promise.all([
        api<Monitor[]>('/v1/monitors', token),
        api<Overview>('/v1/dashboard/overview', token),
      ]);
      setMonitors(m);
      setRuns(o.latestRuns);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load().catch(() => router.push('/login')); }, []);

  async function runNow(monitorId: string) {
    await api('/v1/monitors/run', token, { method: 'POST', body: JSON.stringify({ monitorId }) });
    await load();
  }

  function resetCreateForm() {
    setCreateStep(0);
    setCreateName('');
    setCreateTarget('');
    setCreateInterval(60);
    setCreateTimeoutMs(5000);
    setCreateAdvanced(false);
    setCreateEnabled(true);
  }

  async function createMonitor() {
    await api('/v1/monitors', token, {
      method: 'POST',
      body: JSON.stringify({
        name: createName,
        target: createTarget,
        type: 'HTTP',
        intervalSec: createInterval,
        timeoutMs: createTimeoutMs,
      }),
    });
    setCreateOpen(false);
    resetCreateForm();
    await load();
  }

  function openEdit(m: Monitor) {
    setSelected(m);
    setEditName(m.name);
    setEditTarget(m.target);
    setEditInterval(m.intervalSec);
    setEditOpen(true);
  }

  async function saveEdit() {
    if (!selected) return;
    await api(`/v1/monitors/${selected.id}`, token, {
      method: 'PATCH',
      body: JSON.stringify({ name: editName, target: editTarget, intervalSec: editInterval }),
    });
    setEditOpen(false);
    await load();
  }

  function openDelete(m: Monitor) {
    setSelected(m);
    setDeleteOpen(true);
  }

  async function confirmDelete() {
    if (!selected) return;
    await api(`/v1/monitors/${selected.id}`, token, { method: 'DELETE' });
    setDeleteOpen(false);
    await load();
  }

  async function openHistory(m: Monitor) {
    setSelected(m);
    const rows = await api<RunDetail[]>(`/v1/monitors/${m.id}/runs`, token);
    setHistoryRows(rows);
    setHistoryOpen(true);
  }

  const visible = filter === 'ALL' ? monitors : monitors.filter((m) => m.type === filter);
  const size = Number(pageSize);
  const pages = Math.max(1, Math.ceil(visible.length / size));
  const safePage = Math.min(page, pages);
  const pageRows = visible.slice((safePage - 1) * size, safePage * size);

  return (
    <AppFrame title="Monitors" subtitle="Filter by check type and manually trigger run checks.">
      {loading ? <LoadingState label="Loading monitors..." /> : <>
      <AppModal opened={createOpen} onClose={() => { setCreateOpen(false); resetCreateForm(); }} title="Create website ping" size="lg">
        {createStep === 0 ? (
          <>
            <Text fw={600} mb="sm">Step 1/3 · Basics</Text>
            <TextInput label="Name" value={createName} onChange={(e) => setCreateName(e.currentTarget.value)} />
            <TextInput mt="sm" label="URL" value={createTarget} onChange={(e) => setCreateTarget(e.currentTarget.value)} />
          </>
        ) : null}

        {createStep === 1 ? (
          <>
            <Text fw={600} mb="sm">Step 2/3 · Timing</Text>
            <NumberInput label="Interval (sec)" min={10} value={createInterval} onChange={(v) => setCreateInterval(Number(v || 60))} />
            <Button mt="sm" variant="subtle" onClick={() => setCreateAdvanced((v) => !v)}>{createAdvanced ? 'Hide advanced' : 'Show advanced'}</Button>
            <Collapse in={createAdvanced}>
              <NumberInput mt="sm" label="Timeout (ms)" min={100} value={createTimeoutMs} onChange={(v) => setCreateTimeoutMs(Number(v || 5000))} />
              <Switch mt="sm" checked={createEnabled} onChange={(e) => setCreateEnabled(e.currentTarget.checked)} label="Enabled after create" disabled />
            </Collapse>
          </>
        ) : null}

        {createStep === 2 ? (
          <>
            <Text fw={600} mb="sm">Step 3/3 · Review</Text>
            <Text size="sm">Name: <b>{createName}</b></Text>
            <Text size="sm">URL: <b>{createTarget}</b></Text>
            <Text size="sm">Interval: <b>{createInterval}s</b></Text>
            <Text size="sm">Timeout: <b>{createTimeoutMs}ms</b></Text>
          </>
        ) : null}

        <Group justify="space-between" mt="md">
          <Button variant="default" onClick={() => setCreateStep((s) => Math.max(0, s - 1))} disabled={createStep === 0}>Back</Button>
          {createStep < 2 ? <Button onClick={() => setCreateStep((s) => Math.min(2, s + 1))}>Next</Button> : <Button onClick={createMonitor}>Create ping</Button>}
        </Group>
      </AppModal>

      <AppModal opened={editOpen} onClose={() => setEditOpen(false)} title="Edit monitor">
        <TextInput label="Name" value={editName} onChange={(e) => setEditName(e.currentTarget.value)} />
        <TextInput mt="sm" label="Target" value={editTarget} onChange={(e) => setEditTarget(e.currentTarget.value)} />
        <NumberInput mt="sm" label="Interval (sec)" min={10} value={editInterval} onChange={(v) => setEditInterval(Number(v || 60))} />
        <Group mt="md" justify="flex-end">
          <Button variant="default" onClick={() => setEditOpen(false)}>Cancel</Button>
          <Button onClick={saveEdit}>Save</Button>
        </Group>
      </AppModal>

      <ConfirmModal
        opened={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete monitor"
        message={<>Delete <b>{selected?.name}</b>?</>}
        onConfirm={confirmDelete}
        confirmLabel="Delete"
      />

      <AppModal opened={historyOpen} onClose={() => setHistoryOpen(false)} title={`Run history · ${selected?.name ?? ''}`} size="xl">
        <Table.ScrollContainer minWidth={760}>
          <Table withTableBorder withColumnBorders>
            <Table.Thead><Table.Tr><Table.Th>Time</Table.Th><Table.Th>Level</Table.Th><Table.Th>Status</Table.Th><Table.Th>Latency</Table.Th><Table.Th>Message</Table.Th></Table.Tr></Table.Thead>
            <Table.Tbody>
              {historyRows.map((r) => (
                <Table.Tr key={r.id}>
                  <Table.Td>{new Date(r.checkedAt).toLocaleString()}</Table.Td>
                  <Table.Td><Badge color={r.level === 'green' ? 'green' : r.level === 'yellow' ? 'yellow' : 'red'}>{r.level.toUpperCase()}</Badge></Table.Td>
                  <Table.Td>{r.statusCode}</Table.Td>
                  <Table.Td>{r.latencyMs ?? '-'}</Table.Td>
                  <Table.Td>{r.message}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </AppModal>

      <Card withBorder radius="md" mb="md">
        <Group justify="space-between">
          <Text fw={700}>Website pings</Text>
          <Button onClick={() => { resetCreateForm(); setCreateOpen(true); }}>Create ping</Button>
        </Group>
      </Card>

      <Card withBorder radius="md" mb="md">
        <Group>
          <Select
            label="Filter"
            value={filter}
            onChange={(v) => { setFilter((v as any) || 'ALL'); setPage(1); }}
            data={[{ value: 'ALL', label: 'All' }, { value: 'HTTP', label: 'HTTP' }, { value: 'GIT_RELEASE', label: 'Git Release' }, { value: 'DOCKER_IMAGE', label: 'Docker Image' }]}
          />
        </Group>
      </Card>

      <Card withBorder radius="md">
        <Table.ScrollContainer minWidth={980}>
          <Table withTableBorder withColumnBorders>
            <Table.Thead><Table.Tr><Table.Th>Name</Table.Th><Table.Th>Type</Table.Th><Table.Th>Target</Table.Th><Table.Th>Interval</Table.Th><Table.Th>Status (click)</Table.Th><Table.Th>Actions</Table.Th></Table.Tr></Table.Thead>
            <Table.Tbody>
              {pageRows.map((m) => {
                const latest = runs.find((r) => r.monitorId === m.id);
                const level = latest?.level ?? 'green';
                return (
                  <Table.Tr key={m.id}>
                    <Table.Td style={{ cursor: 'pointer' }} onClick={() => openHistory(m)}>{m.name}</Table.Td>
                    <Table.Td>{m.type}</Table.Td>
                    <Table.Td style={{ maxWidth: 320, overflowWrap: 'anywhere' }}>{m.target}</Table.Td>
                    <Table.Td>{m.intervalSec}s</Table.Td>
                    <Table.Td style={{ cursor: 'pointer' }} onClick={() => openHistory(m)}><Badge color={level === 'green' ? 'green' : level === 'yellow' ? 'yellow' : 'red'}>{level.toUpperCase()}</Badge></Table.Td>
                    <Table.Td>
                      <Group gap="xs" wrap="nowrap">
                        <Button size="xs" onClick={() => runNow(m.id)}>Run</Button>
                        <Button size="xs" variant="light" onClick={() => openEdit(m)}>Edit</Button>
                        <Button size="xs" variant="light" color="red" onClick={() => openDelete(m)}>Delete</Button>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
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

'use client';

import { Badge, Card, Group, Progress, ScrollArea, SimpleGrid, Table, Text } from '@mantine/core';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../lib/api';
import { getToken, getUser } from '../../components/auth';
import { AppFrame } from '../../components/app-frame';
import { LoadingState } from '../../components/ui/loading-state';

type Overview = {
  stats: { totalMonitors: number; green: number; yellow: number; red: number; uptimePct: number };
  latestRuns: Array<{ id: string; checkedAt: string; level: 'green'|'yellow'|'red'; ok: boolean; message: string; latencyMs: number | null }>;
};

type Health = { ok: boolean; service: string; runtime: string };
type VersionSummary = { stats: { total: number; green: number; yellow: number; red: number } };

type NavTile = { label: string; value: string; hint: string; to: string; color?: 'green'|'yellow'|'red'|'teal' };

export default function DashboardPage() {
  const router = useRouter();
  const token = useMemo(() => (typeof window !== 'undefined' ? getToken() : ''), []);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [versions, setVersions] = useState<VersionSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const user = getUser();
    if (!user || !token) router.push('/login');
  }, [router, token]);

  async function load() {
    setLoading(true);
    try {
      const [o, h, v] = await Promise.all([
        api<Overview>('/v1/dashboard/overview', token),
        api<Health>('/health'),
        api<VersionSummary>('/v1/monitors/version-summary', token),
      ]);
      setOverview(o);
      setHealth(h);
      setVersions(v);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load().catch(() => router.push('/login')); }, []);

  const s = overview?.stats;
  const tiles: NavTile[] = [
    { label: 'Monitors', value: String(s?.totalMonitors ?? 0), hint: 'Create/manage checks', to: '/monitors', color: 'teal' },
    { label: 'Alerts', value: String((s?.yellow ?? 0) + (s?.red ?? 0)), hint: 'Channels and delivery', to: '/alerts', color: (s?.red ?? 0) > 0 ? 'red' : (s?.yellow ?? 0) > 0 ? 'yellow' : 'green' },
    { label: 'Versions', value: `${versions?.stats.yellow ?? 0} outdated`, hint: 'Daily release/image checks', to: '/versions', color: (versions?.stats.red ?? 0) > 0 ? 'red' : (versions?.stats.yellow ?? 0) > 0 ? 'yellow' : 'green' },
    { label: 'Projects', value: 'Organize', hint: 'Group monitors by domain', to: '/projects', color: 'teal' },
  ];

  return (
    <AppFrame title="Dashboard" subtitle="">
      {loading ? <LoadingState label="Loading dashboard..." /> : <>
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 5 }} mb="md">
        <Card withBorder radius="md" style={{ cursor: 'pointer' }} onClick={() => router.push('/monitors')}>
          <Text c="dimmed">Uptime</Text>
          <Text fw={800} size="2rem">{s?.uptimePct ?? 0}%</Text>
          <Progress color="teal" value={s?.uptimePct ?? 0} mt="sm" />
        </Card>
        <Card withBorder radius="md" style={{ cursor: 'pointer' }} onClick={() => router.push('/monitors')}><Text c="dimmed">Healthy</Text><Text fw={800} size="2rem">{s?.green ?? 0}</Text></Card>
        <Card withBorder radius="md" style={{ cursor: 'pointer' }} onClick={() => router.push('/monitors')}><Text c="dimmed">At Risk</Text><Text fw={800} size="2rem">{(s?.yellow ?? 0) + (s?.red ?? 0)}</Text></Card>
        <Card withBorder radius="md" style={{ cursor: 'pointer' }} onClick={() => router.push('/versions')}><Text c="dimmed">Outdated Versions</Text><Text fw={800} size="2rem">{(versions?.stats.yellow ?? 0) + (versions?.stats.red ?? 0)}</Text></Card>
        <Card withBorder radius="md"><Text c="dimmed">API Health</Text><Text fw={800} size="2rem">{health?.ok ? 'OK' : 'DOWN'}</Text><Text size="xs" c="dimmed">{health?.runtime ?? '—'}</Text></Card>
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} mb="md">
        {tiles.map((tile) => (
          <Card key={tile.label} withBorder radius="md" style={{ cursor: 'pointer' }} onClick={() => router.push(tile.to)}>
            <Group justify="space-between">
              <Text fw={700}>{tile.label}</Text>
              <Badge color={tile.color ?? 'teal'}>{tile.value}</Badge>
            </Group>
            <Text size="sm" c="dimmed" mt="xs">{tile.hint}</Text>
          </Card>
        ))}
      </SimpleGrid>

      <Card withBorder radius="md">
        <Group justify="space-between" mb="sm">
          <Text fw={700}>Latest runs</Text>
          <Badge variant="light">Click a row for monitors page</Badge>
        </Group>
        <ScrollArea>
          <Table withTableBorder withColumnBorders miw={720}>
            <Table.Thead><Table.Tr><Table.Th>Time</Table.Th><Table.Th>Level</Table.Th><Table.Th>Status</Table.Th><Table.Th>Latency</Table.Th><Table.Th>Message</Table.Th></Table.Tr></Table.Thead>
            <Table.Tbody>
              {overview?.latestRuns.map((r) => (
                <Table.Tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => router.push('/monitors')}>
                  <Table.Td>{new Date(r.checkedAt).toLocaleString()}</Table.Td>
                  <Table.Td><Badge color={r.level === 'green' ? 'green' : r.level === 'yellow' ? 'yellow' : 'red'}>{r.level.toUpperCase()}</Badge></Table.Td>
                  <Table.Td>{r.ok ? 'OK' : 'FAIL'}</Table.Td>
                  <Table.Td>{r.latencyMs ?? '-'}</Table.Td>
                  <Table.Td>{r.message}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </ScrollArea>
      </Card>
      </>}
    </AppFrame>
  );
}

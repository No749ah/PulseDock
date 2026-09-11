'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getUser } from '../../../components/auth';
import { api } from '../../../lib/api';
import type { ToolEntry, VersionItem, MonitorDetails, MonitorRun, Summary, AlertChannelFull } from '../components/types';

type ReleaseNotesData = {
  available: boolean;
  reason?: string;
  version?: string | null;
  releaseName?: string | null;
  body?: string | null;
  publishedAt?: string | null;
  url?: string | null;
  prerelease?: boolean;
  assetCount?: number;
};

type SecurityData = {
  supported: boolean;
  reason?: string;
  source?: string;
  total?: number;
  error?: string;
  advisories: Array<{
    id: string;
    cveId: string | null;
    summary: string | null;
    cvss: string | null;
    publishedAt: string | null;
    fixedIn: string | null;
    url: string;
  }>;
};

export type UseVersionsReturn = {
  // State
  summary: Summary | null;
  monitorDetails: Record<string, MonitorDetails>;
  expandedId: string | null;
  runsByMonitor: Record<string, MonitorRun[]>;
  runsLoadingId: string | null;
  releaseNotesByMonitor: Record<string, ReleaseNotesData>;
  releaseNotesLoading: string | null;
  securityByMonitor: Record<string, SecurityData>;
  securityLoading: string | null;
  loading: boolean;
  runningId: string | null;
  runningAll: boolean;
  sortBy: 'name' | 'status' | 'lastChecked';
  sortDir: 'asc' | 'desc';
  page: number;
  pageSize: string;
  visibleCols: Record<string, boolean>;
  showColPicker: boolean;
  createOpen: boolean;
  toolRegistry: { tools: ToolEntry[]; categories: string[] } | null;
  editOpen: boolean;
  editItem: VersionItem | null;
  alertPanelMonitor: VersionItem | null;
  assignedChannels: AlertChannelFull[];
  allChannels: AlertChannelFull[];
  alertPanelLoading: boolean;
  alertPanelError: string;
  // Computed
  total: number;
  size: number;
  pages: number;
  safePage: number;
  sortedItems: VersionItem[];
  visible: VersionItem[];
  // Setters / handlers
  setPage: (p: number) => void;
  setPageSize: (s: string) => void;
  setShowColPicker: (v: boolean | ((prev: boolean) => boolean)) => void;
  setCreateOpen: (v: boolean) => void;
  setEditOpen: (v: boolean) => void;
  setEditItem: (item: VersionItem | null) => void;
  setAlertPanelMonitor: (item: VersionItem | null) => void;
  load: () => Promise<void>;
  runNow: (monitorId: string) => Promise<void>;
  runAllNow: () => Promise<void>;
  toggleDetails: (monitorId: string) => Promise<void>;
  fetchSecurity: (monitorId: string) => Promise<void>;
  fetchReleaseNotes: (monitorId: string) => Promise<void>;
  openAlertPanel: (monitor: VersionItem) => Promise<void>;
  assignChannel: (channelId: string) => Promise<void>;
  unassignChannel: (channelId: string) => Promise<void>;
  updateNotifyOn: (channelId: string, notifyOn: string) => Promise<void>;
  exportCSV: () => void;
  toggleCol: (col: string) => void;
  handleVersionSort: (col: 'name' | 'status' | 'lastChecked') => void;
  setSortBy: (col: 'name' | 'status' | 'lastChecked') => void;
  setSortDir: (dir: 'asc' | 'desc') => void;
  openEdit: (item: VersionItem) => void;
  removeCheck: (id: string) => Promise<void>;
};

export function useVersions(): UseVersionsReturn {
  const router = useRouter();

  const [summary, setSummary] = useState<Summary | null>(null);
  const [monitorDetails, setMonitorDetails] = useState<Record<string, MonitorDetails>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [runsByMonitor, setRunsByMonitor] = useState<Record<string, MonitorRun[]>>({});
  const [runsLoadingId, setRunsLoadingId] = useState<string | null>(null);
  const [releaseNotesByMonitor, setReleaseNotesByMonitor] = useState<Record<string, ReleaseNotesData>>({});
  const [releaseNotesLoading, setReleaseNotesLoading] = useState<string | null>(null);
  const [securityByMonitor, setSecurityByMonitor] = useState<Record<string, SecurityData>>({});
  const [securityLoading, setSecurityLoading] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [runningAll, setRunningAll] = useState(false);
  const [sortBy, setSortBy] = useState<'name' | 'status' | 'lastChecked'>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState('10');
  const [visibleCols, setVisibleCols] = useState<Record<string, boolean>>(() => {
    try {
      const stored = localStorage.getItem('versions-col-visibility');
      return stored
        ? JSON.parse(stored)
        : { name: true, type: true, target: true, current: true, latest: true, status: true, lastChecked: true, interval: true, action: true };
    } catch {
      return { name: true, type: true, target: true, current: true, latest: true, status: true, lastChecked: true, interval: true, action: true };
    }
  });
  const [showColPicker, setShowColPicker] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [toolRegistry, setToolRegistry] = useState<{ tools: ToolEntry[]; categories: string[] } | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editItem, setEditItem] = useState<VersionItem | null>(null);
  const [alertPanelMonitor, setAlertPanelMonitor] = useState<VersionItem | null>(null);
  const [assignedChannels, setAssignedChannels] = useState<AlertChannelFull[]>([]);
  const [allChannels, setAllChannels] = useState<AlertChannelFull[]>([]);
  const [alertPanelLoading, setAlertPanelLoading] = useState(false);
  const [alertPanelError, setAlertPanelError] = useState('');

  useEffect(() => {
    const user = getUser();
    if (!user) router.push('/login');
  }, [router]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [data, monitors] = await Promise.all([
        api<Summary>('/v1/monitors/version-summary').catch((error) => {
          console.error('Failed to load version summary', error);
          return { stats: { total: 0, green: 0, yellow: 0, red: 0 }, items: [] } as Summary;
        }),
        api<MonitorDetails[]>('/v1/monitors').catch((error) => {
          console.error('Failed to load monitors for versions', error);
          return [] as MonitorDetails[];
        }),
      ]);
      setSummary(data);
      const map: Record<string, MonitorDetails> = {};
      for (const m of monitors) map[m.id] = m;
      setMonitorDetails(map);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load().catch((error) => {
      console.error('Versions page load failed', error);
    });
  }, [load]);

  // Load tool registry once
  useEffect(() => {
    if (toolRegistry) return;
    fetch('/api/v1/tool-registry')
      .then((r) => r.json())
      .then((d: { tools: ToolEntry[]; categories: string[]; total: number }) => setToolRegistry(d))
      .catch(() => null);
  }, [toolRegistry]);

  const openAlertPanel = useCallback(async (monitor: VersionItem) => {
    setAlertPanelMonitor(monitor);
    setAlertPanelLoading(true);
    setAlertPanelError('');
    const userId = getUser()?.id;
    try {
      const [assigned, all] = await Promise.all([
        api<AlertChannelFull[]>(`/v1/monitors/${monitor.id}/alerts`, userId),
        api<AlertChannelFull[]>('/v1/alert-channels', userId),
      ]);
      setAssignedChannels(assigned);
      setAllChannels(all);
    } catch (e) {
      setAlertPanelError(e instanceof Error ? e.message : 'Failed to load alerts');
    } finally {
      setAlertPanelLoading(false);
    }
  }, []);

  const assignChannel = useCallback(async (channelId: string) => {
    if (!alertPanelMonitor) return;
    const userId = getUser()?.id;
    try {
      await api(`/v1/monitors/${alertPanelMonitor.id}/alerts/${channelId}`, userId, { method: 'POST' });
      const updated = await api<AlertChannelFull[]>(`/v1/monitors/${alertPanelMonitor.id}/alerts`, userId);
      setAssignedChannels(updated);
      await load();
    } catch (e) {
      setAlertPanelError(e instanceof Error ? e.message : 'Failed to assign channel');
    }
  }, [alertPanelMonitor, load]);

  const unassignChannel = useCallback(async (channelId: string) => {
    if (!alertPanelMonitor) return;
    const userId = getUser()?.id;
    try {
      await api(`/v1/monitors/${alertPanelMonitor.id}/alerts/${channelId}`, userId, { method: 'DELETE' });
      setAssignedChannels((prev) => prev.filter((c) => c.id !== channelId));
      await load();
    } catch (e) {
      setAlertPanelError(e instanceof Error ? e.message : 'Failed to unassign channel');
    }
  }, [alertPanelMonitor, load]);

  const updateNotifyOn = useCallback(async (channelId: string, notifyOn: string) => {
    if (!alertPanelMonitor) return;
    const userId = getUser()?.id;
    try {
      await api(`/v1/monitors/${alertPanelMonitor.id}/alerts/${channelId}`, userId, {
        method: 'PATCH',
        body: JSON.stringify({ notifyOn }),
      });
      setAssignedChannels((prev) => prev.map((c) => (c.id === channelId ? { ...c, notifyOn } : c)));
      await load();
    } catch (e) {
      setAlertPanelError(e instanceof Error ? e.message : 'Failed to update notification setting');
    }
  }, [alertPanelMonitor, load]);

  const runNow = useCallback(async (monitorId: string) => {
    setRunningId(monitorId);
    try {
      await api('/v1/monitors/run', undefined, { method: 'POST', body: JSON.stringify({ monitorId }) });
      await load();
      if (expandedId === monitorId) {
        const runs = await api<MonitorRun[]>(`/v1/monitors/${monitorId}/runs`);
        setRunsByMonitor((prev) => ({ ...prev, [monitorId]: runs }));
      }
    } finally {
      setRunningId(null);
    }
  }, [load, expandedId]);

  const runAllNow = useCallback(async () => {
    const ids = summary?.items?.map((i) => i.id) ?? [];
    if (ids.length === 0) return;
    setRunningAll(true);
    try {
      await api('/v1/monitors/bulk', undefined, { method: 'POST', body: JSON.stringify({ ids, action: 'run' }) });
      await new Promise((r) => setTimeout(r, 1500));
      await load();
    } finally {
      setRunningAll(false);
    }
  }, [summary, load]);

  const fetchSecurity = useCallback(async (monitorId: string) => {
    if (securityByMonitor[monitorId] || securityLoading === monitorId) return;
    setSecurityLoading(monitorId);
    try {
      const data = await api<SecurityData>(`/v1/monitors/${monitorId}/security`);
      setSecurityByMonitor((prev) => ({ ...prev, [monitorId]: data }));
    } catch {
      setSecurityByMonitor((prev) => ({ ...prev, [monitorId]: { supported: false, reason: 'Failed to fetch', advisories: [] } }));
    } finally {
      setSecurityLoading(null);
    }
  }, [securityByMonitor, securityLoading]);

  const fetchReleaseNotes = useCallback(async (monitorId: string) => {
    if (releaseNotesByMonitor[monitorId] || releaseNotesLoading === monitorId) return;
    setReleaseNotesLoading(monitorId);
    try {
      const notes = await api<ReleaseNotesData>(`/v1/monitors/${monitorId}/release-notes`);
      setReleaseNotesByMonitor((prev) => ({ ...prev, [monitorId]: notes }));
    } catch {
      setReleaseNotesByMonitor((prev) => ({ ...prev, [monitorId]: { available: false, reason: 'Failed to fetch' } }));
    } finally {
      setReleaseNotesLoading(null);
    }
  }, [releaseNotesByMonitor, releaseNotesLoading]);

  const toggleDetails = useCallback(async (monitorId: string) => {
    if (expandedId === monitorId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(monitorId);
    if (runsByMonitor[monitorId]) return;
    setRunsLoadingId(monitorId);
    try {
      const runs = await api<MonitorRun[]>(`/v1/monitors/${monitorId}/runs`);
      setRunsByMonitor((prev) => ({ ...prev, [monitorId]: runs }));
    } finally {
      setRunsLoadingId(null);
    }
  }, [expandedId, runsByMonitor]);

  const openEdit = useCallback((item: VersionItem) => {
    setEditItem(item);
    setEditOpen(true);
  }, []);

  const removeCheck = useCallback(async (id: string) => {
    if (!confirm('Version check wirklich löschen?')) return;
    await api(`/v1/monitors/${id}`, undefined, { method: 'DELETE' });
    await load();
  }, [load]);

  const exportCSV = useCallback(() => {
    const cols = ['Name', 'Type', 'Target', 'Current Version', 'Latest Message', 'Status', 'Last Checked'];
    const rows = sortedItems.map((item) => [
      item.name,
      item.type,
      item.target,
      item.currentVersion ?? '',
      item.latestMessage ?? '',
      item.level ?? '',
      item.checkedAt ? new Date(item.checkedAt).toISOString() : '',
    ]);
    const csv = [cols, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `version-checks-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [summary]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleCol = useCallback((col: string) => {
    setVisibleCols((prev) => {
      const next = { ...prev, [col]: !prev[col] };
      try { localStorage.setItem('versions-col-visibility', JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const handleVersionSort = useCallback((col: 'name' | 'status' | 'lastChecked') => {
    if (sortBy === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortBy(col); setSortDir('asc'); }
    setPage(1);
  }, [sortBy]);

  // Computed
  const total = summary?.items.length ?? 0;
  const size = Number(pageSize);
  const pages = Math.max(1, Math.ceil(total / size));
  const safePage = Math.min(page, pages);

  function statusSortKey(level: 'green' | 'yellow' | 'red') {
    if (level === 'green') return 1;
    if (level === 'yellow') return 2;
    return 0;
  }

  const sortedItems = [...(summary?.items ?? [])].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    if (sortBy === 'name') return dir * a.name.localeCompare(b.name);
    if (sortBy === 'status') return dir * (statusSortKey(a.level) - statusSortKey(b.level));
    if (sortBy === 'lastChecked') {
      const ta = a.checkedAt ? new Date(a.checkedAt).getTime() : 0;
      const tb = b.checkedAt ? new Date(b.checkedAt).getTime() : 0;
      return dir * (ta - tb);
    }
    return 0;
  });

  const visible = sortedItems.slice((safePage - 1) * size, safePage * size);

  return {
    summary, monitorDetails, expandedId, runsByMonitor, runsLoadingId,
    releaseNotesByMonitor, releaseNotesLoading, securityByMonitor, securityLoading,
    loading, runningId, runningAll, sortBy, sortDir, page, pageSize,
    visibleCols, showColPicker, createOpen, toolRegistry, editOpen, editItem,
    alertPanelMonitor, assignedChannels, allChannels, alertPanelLoading, alertPanelError,
    total, size, pages, safePage, sortedItems, visible,
    setPage, setPageSize, setShowColPicker, setCreateOpen, setEditOpen, setEditItem,
    setAlertPanelMonitor,
    load, runNow, runAllNow, toggleDetails, fetchSecurity, fetchReleaseNotes,
    openAlertPanel, assignChannel, unassignChannel, updateNotifyOn,
    exportCSV, toggleCol, handleVersionSort, openEdit, removeCheck,
    setSortBy, setSortDir,
  };
}

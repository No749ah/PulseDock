'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Edit, Trash2, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, ChevronsUpDown, Check, X, Info, AlertCircle, Play, GitBranch, Search, Grid2x2, List, Copy, ExternalLink, RefreshCw, Bell, CheckCircle2, ArrowUpCircle, Download, Eye } from 'lucide-react';
import { AppFrame } from '../../components/app-frame';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Badge } from '../components/Badge';
import { Modal } from '../components/Modal';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '../components/Table';
import { Select } from '../components/Select';
import { VersionDiff, extractVersionsFromMessage } from '../components/VersionDiff';
import { getUser } from '../../components/auth';
import { api } from '../../lib/api';
import { useDebounce } from '../../lib/useDebounce';

// Minimal ToolVariant type (mirrors packages/tool-registry/src/types.ts)
type ToolVariant = {
  id: string;
  label: string;
  description?: string;
  requiresInstanceUrl?: boolean;
  authRequired?: boolean;
  urlPlaceholder?: string;
  evidenceUrl?: string;
  versionSource?: { type: string; urlTemplate?: string; jsonPath?: string; authRequired?: boolean; endpointFallbacks?: string[] };
  latestSource?: { type: string; target?: string };
  tags?: string[];
};

type AlertChannelSummary = {
  id: string;
  name: string;
  type: string;
  notifyOn: string;
};

type VersionItem = {
  id: string;
  name: string;
  type: 'GIT_RELEASE' | 'DOCKER_IMAGE';
  target: string;
  currentVersion: string;
  latestMessage: string;
  level: 'green' | 'yellow' | 'red';
  checkedAt: string | null;
  intervalSec: number;
  alertChannels?: AlertChannelSummary[];
};

type MonitorDetails = {
  id: string;
  name: string;
  type: 'GIT_RELEASE' | 'DOCKER_IMAGE';
  target: string;
  intervalSec: number;
  timeoutMs: number;
  config: Record<string, unknown>;
  alertChannels?: AlertChannelSummary[];
};

type AlertChannelFull = {
  id: string;
  name: string;
  type: string;
  config: Record<string, unknown>;
  createdAt: string;
  notifyOn?: string;
};

type MonitorRun = {
  id: string;
  monitorId: string;
  checkedAt: string;
  ok: boolean;
  statusCode: number;
  latencyMs: number | null;
  message: string;
  level: 'green' | 'yellow' | 'red';
};

type Summary = {
  stats: { total: number; green: number; yellow: number; red: number };
  items: VersionItem[];
};

const inputClass = "w-full px-4 py-3 bg-surface border border-border rounded-lg text-text-primary placeholder-text-secondary focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent";

// ── Tool Registry (inline types + fetched data) ──────────────────────────────
type ToolEntry = {
  id: string;
  name: string;
  category: string;
  tags: string[];
  icon: string;
  description: string;
  homepage: string;
  versionSource: { type: string; target?: string; urlTemplate?: string; endpointFallbacks?: string[]; jsonPath?: string; authRequired?: boolean; agentCommand?: string; agentNote?: string };
  latestSource: { type: string; target?: string; urlTemplate?: string };
  checkInterval: number;
  requiresInstanceUrl: boolean;
  verified: boolean;
  agentInstallHint?: string;
};

const CHANNEL_TYPE_COLORS: Record<string, string> = {
  discord: 'text-indigo-400',
  slack: 'text-green-400',
  webhook: 'text-blue-400',
  telegram: 'text-sky-400',
  email: 'text-yellow-400',
};

const VERSION_NOTIFY_OPTIONS = [
  { value: 'VERSION_ANY',   label: 'Any update (minor + major)' },
  { value: 'VERSION_MAJOR', label: 'Major updates only' },
];

const NOTIFY_ON_LABELS: Record<string, string> = {
  VERSION_ANY:   'Any update',
  VERSION_MAJOR: 'Major only',
};

function stripLeadingV(version: string) {
  return version.replace(/^v(?=\d)/i, '');
}

function secondsToHuman(sec: number) {
  if (sec % 86400 === 0) return `${sec / 86400}d`;
  if (sec % 3600 === 0) return `${sec / 3600}h`;
  if (sec % 60 === 0) return `${sec / 60}m`;
  return `${sec}s`;
}

function levelBadgeVariant(level: string): 'success' | 'warning' | 'danger' {
  if (level === 'green') return 'success';
  if (level === 'yellow') return 'warning';
  return 'danger';
}

function StatusIcon({ status }: { status: 'unknown' | 'ok' | 'fail' }) {
  if (status === 'ok') return <Check className="w-4 h-4 text-success" />;
  if (status === 'fail') return <X className="w-4 h-4 text-danger" />;
  return <Info className="w-4 h-4 text-text-secondary" />;
}

export default function VersionsPage() {
  const router = useRouter();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [monitorDetails, setMonitorDetails] = useState<Record<string, MonitorDetails>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [runsByMonitor, setRunsByMonitor] = useState<Record<string, MonitorRun[]>>({});
  const [runsLoadingId, setRunsLoadingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'name' | 'status' | 'lastChecked'>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState('10');
  // Column visibility (persisted to localStorage)
  const [visibleCols, setVisibleCols] = useState<Record<string, boolean>>(() => {
    try {
      const stored = localStorage.getItem('versions-col-visibility');
      return stored ? JSON.parse(stored) : { name: true, type: true, target: true, current: true, latest: true, status: true, lastChecked: true, interval: true, action: true };
    } catch {
      return { name: true, type: true, target: true, current: true, latest: true, status: true, lastChecked: true, interval: true, action: true };
    }
  });
  const [showColPicker, setShowColPicker] = useState(false);
  const toggleCol = (col: string) => {
    setVisibleCols((prev) => {
      const next = { ...prev, [col]: !prev[col] };
      try { localStorage.setItem('versions-col-visibility', JSON.stringify(next)); } catch {}
      return next;
    });
  };
  const [createOpen, setCreateOpen] = useState(false);
  const [createStep, setCreateStep] = useState(-1); // -1 = tool picker, 0-3 = manual steps
  // Tool registry
  const [toolRegistry, setToolRegistry] = useState<{ tools: ToolEntry[]; categories: string[] } | null>(null);
  const [toolSearch, setToolSearch] = useState('');
  const toolSearchDebounced = useDebounce(toolSearch, 250);
  const [toolCategory, setToolCategory] = useState('');
  const [toolVisibleCount, setToolVisibleCount] = useState(50);
  const [selectedTool, setSelectedTool] = useState<ToolEntry | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<'GIT_RELEASE' | 'DOCKER_IMAGE'>('GIT_RELEASE');
  const [provider, setProvider] = useState<'github' | 'gitlab' | 'docker' | 'apt' | 'npm' | 'pypi' | 'cargo' | 'maven' | 'helm'>('github');
  const [target, setTarget] = useState('');
  const [currentVersion, setCurrentVersion] = useState('');
  const [intervalSec, setIntervalSec] = useState(86400);
  const [intervalInput, setIntervalInput] = useState(String(Math.round(86400 / 60)));
  const [tokenInput, setTokenInput] = useState('');
  const [gitlabHost, setGitlabHost] = useState('');
  const [appUrl, setAppUrl] = useState('');
  const [appToken, setAppToken] = useState('');
  const [appVersionEndpoint, setAppVersionEndpoint] = useState('');
  const [appAuthType, setAppAuthType] = useState<'none' | 'token' | 'openvpn'>('none');
  const [openvpnUsername, setOpenvpnUsername] = useState('');
  const [openvpnPassword, setOpenvpnPassword] = useState('');
  const showTokenField = false;
  const [advanced, setAdvanced] = useState(false);
  const [agentTab, setAgentTab] = useState<'docker-run' | 'compose' | 'shell'>('docker-run');
  const [agentPolling, setAgentPolling] = useState(false);
  const [agentReported, setAgentReported] = useState(false);
  const [copiedSnippet, setCopiedSnippet] = useState<string | null>(null);
  const [userApiKeys, setUserApiKeys] = useState<{ id: string; name: string; prefix: string }[]>([]);
  const [selectedApiKeyId, setSelectedApiKeyId] = useState<string>('');
  const [testMessage, setTestMessage] = useState('');
  const [detectTried, setDetectTried] = useState(false);
  const [sourceStatus, setSourceStatus] = useState<'unknown' | 'ok' | 'fail'>('unknown');
  const [appStatus, setAppStatus] = useState<'unknown' | 'ok' | 'fail'>('unknown');
  const [showAuthHint, setShowAuthHint] = useState(false);
  // Tool variant selection
  const [toolVariants, setToolVariants] = useState<ToolVariant[]>([]);
  const [selectedVariantId, setSelectedVariantId] = useState<string>('');
  const [showTemplateReport, setShowTemplateReport] = useState(false);
  const [templateReportNote, setTemplateReportNote] = useState('');
  const [templateReportSent, setTemplateReportSent] = useState(false);
  const [currentVersionLocked, setCurrentVersionLocked] = useState(false);
  const [latestPreview, setLatestPreview] = useState('');
  const [latestPreviewLoading, setLatestPreviewLoading] = useState(false);
  const [appDetectedFrom, setAppDetectedFrom] = useState('');
  const [appTriedEndpoints, setAppTriedEndpoints] = useState<string[]>([]);

  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState('');
  const [editName, setEditName] = useState('');
  const [editProvider, setEditProvider] = useState<'github' | 'gitlab' | 'docker' | 'apt' | 'npm' | 'pypi' | 'cargo' | 'maven' | 'helm'>('github');
  const [editTarget, setEditTarget] = useState('');
  const [editCurrentVersion, setEditCurrentVersion] = useState('');
  const [editIntervalSec, setEditIntervalSec] = useState(86400);
  const [editIntervalInput, setEditIntervalInput] = useState(String(Math.round(86400 / 60)));
  const [editToken, setEditToken] = useState('');
  const [editHasRepoToken, setEditHasRepoToken] = useState(false);
  const [editGitlabHost, setEditGitlabHost] = useState('');
  const [editAppUrl, setEditAppUrl] = useState('');
  const [editAppAuthType, setEditAppAuthType] = useState<'none' | 'token' | 'openvpn'>('none');
  const [editAppToken, setEditAppToken] = useState('');
  const [editHasAppToken, setEditHasAppToken] = useState(false);
  const [editOpenvpnUsername, setEditOpenvpnUsername] = useState('');
  const [editHasOpenvpnPassword, setEditHasOpenvpnPassword] = useState(false);
  const [editOpenvpnPassword, setEditOpenvpnPassword] = useState('');
  const [editAppVersionEndpoint, setEditAppVersionEndpoint] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  // Alert panel state
  const [alertPanelMonitor, setAlertPanelMonitor] = useState<VersionItem | null>(null);
  const [assignedChannels, setAssignedChannels] = useState<AlertChannelFull[]>([]);
  const [allChannels, setAllChannels] = useState<AlertChannelFull[]>([]);
  const [alertPanelLoading, setAlertPanelLoading] = useState(false);
  const [alertPanelError, setAlertPanelError] = useState('');

  useEffect(() => {
    const user = getUser();
    if (!user) router.push('/login');
  }, [router]);

  async function load() {
    setLoading(true);
    try {
      const [data, monitors] = await Promise.all([
        api<Summary>('/v1/monitors/version-summary'),
        api<MonitorDetails[]>('/v1/monitors'),
      ]);
      setSummary(data);
      const map: Record<string, MonitorDetails> = {};
      for (const m of monitors) map[m.id] = m;
      setMonitorDetails(map);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load().catch(() => router.push('/login')); }, []);

  // ── Alert panel handlers ───────────────────────────────────────────────────
  const openAlertPanel = async (monitor: VersionItem) => {
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
  };

  const assignChannel = async (channelId: string) => {
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
  };

  const unassignChannel = async (channelId: string) => {
    if (!alertPanelMonitor) return;
    const userId = getUser()?.id;
    try {
      await api(`/v1/monitors/${alertPanelMonitor.id}/alerts/${channelId}`, userId, { method: 'DELETE' });
      setAssignedChannels((prev) => prev.filter((c) => c.id !== channelId));
      await load();
    } catch (e) {
      setAlertPanelError(e instanceof Error ? e.message : 'Failed to unassign channel');
    }
  };

  const updateNotifyOn = async (channelId: string, notifyOn: string) => {
    if (!alertPanelMonitor) return;
    const userId = getUser()?.id;
    try {
      await api(`/v1/monitors/${alertPanelMonitor.id}/alerts/${channelId}`, userId, {
        method: 'PATCH',
        body: JSON.stringify({ notifyOn }),
      });
      setAssignedChannels((prev) => prev.map((c) => c.id === channelId ? { ...c, notifyOn } : c));
      await load();
    } catch (e) {
      setAlertPanelError(e instanceof Error ? e.message : 'Failed to update notification setting');
    }
  };

  // Load tool registry once (public endpoint, no auth needed)
  useEffect(() => {
    if (toolRegistry) return;
    fetch('/api/v1/tool-registry')
      .then((r) => r.json())
      .then((d: { tools: ToolEntry[]; categories: string[]; total: number }) => setToolRegistry(d))
      .catch(() => null);
  }, [toolRegistry]);

  useEffect(() => {
    // Reset tool pagination when search/filter/modal state changes
    setToolVisibleCount(50);
  }, [toolSearchDebounced, toolCategory, createOpen, createStep]);

  useEffect(() => {
    if (!target.trim()) {
      setLatestPreview('');
      return;
    }

    const t = setTimeout(async () => {
      setLatestPreviewLoading(true);
      try {
        const res = await api<{ ok: boolean; latestVersion?: string | null; message: string }>('/v1/monitors/version-test', undefined, {
          method: 'POST',
          body: JSON.stringify({ provider, target, token: tokenInput || undefined, host: gitlabHost || undefined }),
        });
        setLatestPreview(res.latestVersion ? `Latest detected: ${res.latestVersion}` : res.message);
      } catch {
        setLatestPreview('Could not detect latest version yet.');
      } finally {
        setLatestPreviewLoading(false);
      }
    }, 450);

    return () => clearTimeout(t);
  }, [provider, target, tokenInput, gitlabHost]);

  async function runNow(monitorId: string) {
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
  }

  const [runningAll, setRunningAll] = useState(false);

  async function runAllNow() {
    const ids = summary?.items?.map((i) => i.id) ?? [];
    if (ids.length === 0) return;
    setRunningAll(true);
    try {
      await api('/v1/monitors/bulk', undefined, { method: 'POST', body: JSON.stringify({ ids, action: 'run' }) });
      // Wait a moment for checks to run, then reload
      await new Promise((r) => setTimeout(r, 1500));
      await load();
    } finally {
      setRunningAll(false);
    }
  }

  async function toggleDetails(monitorId: string) {
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
  }

  function openEdit(item: VersionItem) {
    const details = monitorDetails[item.id];
    const cfg = (details?.config ?? {}) as Record<string, unknown>;
    const p = String(cfg.provider ?? (item.type === 'DOCKER_IMAGE' ? 'docker' : 'github')).toLowerCase() as 'github' | 'gitlab' | 'docker' | 'apt' | 'npm' | 'pypi' | 'cargo' | 'maven' | 'helm';

    setEditId(item.id);
    setEditName(item.name);
    setEditProvider(p);
    setEditTarget(item.target);
    setEditCurrentVersion(String(cfg.currentVersion ?? item.currentVersion ?? ''));
    setEditIntervalSec(item.intervalSec || 86400);
    setEditIntervalInput(String(Math.round((item.intervalSec || 86400) / 60)));
    setEditHasRepoToken(Boolean(cfg.hasRepoToken));
    setEditToken('');
    setEditGitlabHost(String(cfg.gitlabHost ?? ''));
    setEditAppUrl(String(cfg.appUrl ?? ''));
    setEditAppAuthType((String(cfg.appAuthType ?? 'none') as 'none' | 'token' | 'openvpn') || 'none');
    setEditHasAppToken(Boolean(cfg.hasAppToken));
    setEditAppToken('');
    setEditOpenvpnUsername(String(cfg.openvpnUsername ?? ''));
    setEditHasOpenvpnPassword(Boolean(cfg.hasOpenvpnPassword));
    setEditOpenvpnPassword('');
    setEditAppVersionEndpoint(String(cfg.appVersionEndpoint ?? ''));
    setEditOpen(true);
  }

  async function saveEdit() {
    if (!editId) return;
    setEditSaving(true);
    try {
      await api(`/v1/monitors/${editId}`, undefined, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editName,
          type: editProvider === 'docker' ? 'DOCKER_IMAGE' : 'GIT_RELEASE',
          target: editTarget,
          intervalSec: editIntervalSec,
          config: {
            provider: editProvider,
            currentVersion: stripLeadingV(editCurrentVersion),
            currentTag: stripLeadingV(editCurrentVersion),
            token: editToken || undefined,
            gitlabHost: editGitlabHost || undefined,
            appUrl: editAppUrl || undefined,
            appAuthType: editAppAuthType,
            appToken: editAppToken || undefined,
            openvpnUsername: editOpenvpnUsername || undefined,
            openvpnPassword: editOpenvpnPassword || undefined,
            appVersionEndpoint: editAppVersionEndpoint || undefined,
          },
        }),
      });
      setEditOpen(false);
      await load();
    } finally {
      setEditSaving(false);
    }
  }

  async function removeCheck(id: string) {
    if (!confirm('Version check wirklich löschen?')) return;
    await api(`/v1/monitors/${id}`, undefined, { method: 'DELETE' });
    await load();
  }

  async function testConnection() {
    setShowAuthHint(false);
    try {
      const result = await api<{ ok: boolean; message: string; latestVersion?: string | null; unauthorized?: boolean }>('/v1/monitors/version-test', undefined, {
        method: 'POST',
        body: JSON.stringify({ provider, target, token: tokenInput || undefined, host: gitlabHost || undefined }),
      });
      if (provider === 'github' && result.unauthorized) {
        setTestMessage('GitHub may require a token for this repository/rate limit.');
      }
      setSourceStatus(result.ok ? 'ok' : 'fail');
      setTestMessage(result.latestVersion ? `Source latest version: ${result.latestVersion}` : result.message);
      return result;
    } catch {
      setSourceStatus('fail');
      setTestMessage('Source check failed.');
      return null;
    }
  }

  async function discoverCurrentVersion() {
    setDetectTried(true);
    setShowAuthHint(false);
    const result = await api<{ currentVersion: string | null; message?: string; detectedFrom?: string | null; tried?: string[]; authFailed?: boolean }>('/v1/monitors/version-discover', undefined, {
      method: 'POST',
      body: JSON.stringify({
        provider,
        target,
        token: tokenInput || undefined,
        host: gitlabHost || undefined,
        appUrl: appUrl || undefined,
        appToken: appToken || undefined,
        appVersionEndpoint: appVersionEndpoint || undefined,
        appAuthType,
        openvpnUsername: openvpnUsername || undefined,
        openvpnPassword: openvpnPassword || undefined,
        endpointFallbacks: selectedTool?.versionSource.endpointFallbacks?.length
          ? selectedTool.versionSource.endpointFallbacks
          : undefined,
      }),
    });
    setAppDetectedFrom(result.detectedFrom ?? '');
    setAppTriedEndpoints((result.tried ?? []).map((u) => u.replace(/\s\[[^\]]+\]$/, '')));

    if (result.currentVersion) {
      const normalized = stripLeadingV(result.currentVersion);
      setCurrentVersion(normalized);
      setCurrentVersionLocked(true);
      setAppStatus('ok');
    } else {
      setCurrentVersionLocked(false);
      setAppStatus(appUrl ? 'fail' : 'unknown');
      // Show auth hint when the app endpoint returned 401/403
      if (result.authFailed && appUrl && appAuthType === 'none') {
        setShowAuthHint(true);
      }
    }
    return result;
  }

  const isAgentTool = selectedTool?.versionSource.type === 'pulsedock-agent';

  // Load API keys when agent panel becomes relevant
  useEffect(() => {
    if (!isAgentTool || userApiKeys.length > 0) return;
    api<{ apiKeys: { id: string; name: string; prefix: string }[] }>('/v1/apikeys')
      .then((res) => {
        setUserApiKeys(res.apiKeys ?? []);
        if (res.apiKeys?.length > 0) setSelectedApiKeyId(res.apiKeys[0].id);
      })
      .catch(() => {/* silently ignore */});
  }, [isAgentTool]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedApiKey = userApiKeys.find((k) => k.id === selectedApiKeyId);
  const agentApiKeyDisplay = selectedApiKey ? `${selectedApiKey.prefix}...` : 'YOUR_API_KEY';
  const agentPulsedockUrl = typeof window !== 'undefined'
    ? `${window.location.protocol}//${window.location.host}`
    : 'https://your-pulsedock.example.com';

  /**
   * Apply a variant's overrides to the form (auth, endpoint, placeholders).
   * Called when a tool is selected (auto-picks first variant) or when the user
   * manually switches variant via the Platform dropdown.
   */
  function applyVariantOverride(tool: ToolEntry, variant: ToolVariant) {
    const vs = variant.versionSource ?? tool.versionSource;
    const ls = variant.latestSource ?? tool.latestSource;
    const requiresUrl = variant.requiresInstanceUrl ?? tool.requiresInstanceUrl;

    // Override auth type from variant
    const authRequired = variant.authRequired ?? vs.authRequired ?? tool.versionSource.authRequired ?? false;
    setAppAuthType(authRequired ? 'token' : 'none');

    // Override endpoint from variant
    if (requiresUrl && vs.urlTemplate) {
      setAppVersionEndpoint(vs.urlTemplate.replace('{{instanceUrl}}', '').replace(/^\//, ''));
    } else if (!requiresUrl) {
      setAppVersionEndpoint('');
      setAppUrl('');
    }

    // Override target from variant's latestSource if provided
    if (ls.target) setTarget(ls.target);
  }

  function applyToolToForm(tool: ToolEntry) {
    setSelectedTool(tool);
    setSelectedVariantId('');
    setToolVariants([]);
    // Fetch variants in background — non-blocking
    fetch(`/api/v1/tool-registry/${tool.id}/variants`)
      .then((r) => r.ok ? r.json() : null)
      .then((d: { variants: ToolVariant[] } | null) => {
        if (d?.variants?.length) {
          setToolVariants(d.variants);
          setSelectedVariantId(d.variants[0].id);
          applyVariantOverride(tool, d.variants[0]);
        }
      })
      .catch(() => null);
    setName(tool.name);
    setIntervalSec(tool.checkInterval);
    setIntervalInput(String(Math.round((tool.checkInterval) / 60)));

    // Map latestSource type → provider
    const ls = tool.latestSource;
    const providerMap: Record<string, typeof provider> = {
      'github-releases': 'github',
      'github-tags': 'github',
      'gitlab-releases': 'gitlab',
      'docker-hub': 'docker',
      'npm-registry': 'npm',
      'pypi': 'pypi',
      'apt-release': 'apt',
      'cargo': 'cargo',
      'maven-central': 'maven',
      'helm-chart': 'helm',
    };
    const p = providerMap[ls.type] ?? 'github';
    setProvider(p);
    setType(p === 'docker' ? 'DOCKER_IMAGE' : 'GIT_RELEASE');
    if (ls.target) setTarget(ls.target);
    if (p === 'gitlab' && (ls as Record<string, unknown>).host) {
      setGitlabHost((ls as Record<string, unknown>).host as string);
    }

    // If it requires an instance URL, clear appUrl so user must enter their own instance
    if (tool.requiresInstanceUrl) {
      setAppUrl(''); // user must enter their own instance URL
      setAppAuthType(tool.versionSource.authRequired ? 'token' : 'none');
      if (tool.versionSource.urlTemplate) {
        setAppVersionEndpoint(tool.versionSource.urlTemplate.replace('{{instanceUrl}}', '').replace(/^\//, ''));
      }
    } else {
      setAppUrl('');
      setAppAuthType('none');
      setAppVersionEndpoint('');
    }

    // Advance past the picker to step 0
    setCreateStep(0);
  }

  function copySnippet(text: string, key: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedSnippet(key);
      setTimeout(() => setCopiedSnippet(null), 2000);
    }).catch(() => null);
  }

  async function pollAgentStatus(monitorId: string) {
    setAgentPolling(true);
    const maxAttempts = 12; // 12 × 5s = 60s
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      try {
        const runs = await api<{ items: { id: string }[] }>(`/v1/monitors/${monitorId}/runs?limit=1`);
        if (runs?.items?.length > 0) {
          setAgentReported(true);
          setAgentPolling(false);
          setCreateStep(3); // jump to review
          return;
        }
      } catch { /* ignore */ }
    }
    setAgentPolling(false);
  }

  async function validateSetup() {
    const source = await testConnection();
    const discovered = await discoverCurrentVersion();

    if (discovered.currentVersion) {
      setTestMessage(`Source: ${source?.latestVersion ?? 'ok'} · App version detected: ${discovered.currentVersion}`);
    } else if (appUrl) {
      setTestMessage(`Source: ${source?.latestVersion ?? source?.message ?? 'check failed'} · ${discovered.message ?? 'App version could not be detected.'}`);
    }
  }

  async function sendTemplateReport() {
    if (!selectedTool) return;
    try {
      await api('/v1/feedback/template-report', undefined, {
        method: 'POST',
        body: JSON.stringify({
          toolId: selectedTool.id,
          endpoint: target || undefined,
          statusCode: undefined,
          error: testMessage || undefined,
          note: templateReportNote || undefined,
        }),
      });
      setTemplateReportSent(true);
      setShowTemplateReport(false);
      setTemplateReportNote('');
    } catch {
      // silently ignore
    }
  }

  function resetCreateForm() {
    setCreateStep(-1);
    setToolSearch('');
    setToolCategory('');
    setSelectedTool(null);
    setToolVariants([]);
    setSelectedVariantId('');
    setName('');
    setType('GIT_RELEASE');
    setProvider('github');
    setTarget('');
    setCurrentVersion('');
    setIntervalSec(86400);
    setIntervalInput(String(Math.round(86400 / 60)));
    setTokenInput('');
    setGitlabHost('');
    setAppUrl('');
    setAppAuthType('none');
    setAppToken('');
    setOpenvpnUsername('');
    setOpenvpnPassword('');
    setAppVersionEndpoint('');
    setAdvanced(false);
    setTestMessage('');
    setDetectTried(false);
    setSourceStatus('unknown');
    setAppStatus('unknown');
    setShowAuthHint(false);
    setShowTemplateReport(false);
    setTemplateReportNote('');
    setTemplateReportSent(false);
    setCurrentVersionLocked(false);
    setLatestPreview('');
    setLatestPreviewLoading(false);
    setAppDetectedFrom('');
    setAppTriedEndpoints([]);
  }

  async function createVersionCheck() {
    let resolvedCurrentVersion = currentVersion;

    if (appUrl && !resolvedCurrentVersion) {
      const result = await api<{ currentVersion: string | null; message?: string; detectedFrom?: string | null; tried?: string[] }>('/v1/monitors/version-discover', undefined, {
        method: 'POST',
        body: JSON.stringify({
          provider,
          target,
          token: tokenInput || undefined,
          host: gitlabHost || undefined,
          appUrl: appUrl || undefined,
          appToken: appToken || undefined,
          appVersionEndpoint: appVersionEndpoint || undefined,
          appAuthType,
          openvpnUsername: openvpnUsername || undefined,
          openvpnPassword: openvpnPassword || undefined,
        }),
      });
      setAppDetectedFrom(result.detectedFrom ?? '');
      setAppTriedEndpoints((result.tried ?? []).map((u) => u.replace(/\s\[[^\]]+\]$/, '')));

      if (result.currentVersion) {
        resolvedCurrentVersion = stripLeadingV(result.currentVersion);
        setCurrentVersion(stripLeadingV(result.currentVersion));
        setCurrentVersionLocked(true);
        setAppStatus('ok');
      } else {
        setCurrentVersionLocked(false);
        setAppStatus('fail');
        setTestMessage(result.message ?? 'Could not auto-detect deployed version. Add app token/custom endpoint, or enter current version manually.');
        setCreateStep(2);
        return;
      }
    }

    await api('/v1/monitors', undefined, {
      method: 'POST',
      body: JSON.stringify({
        name,
        type,
        target,
        intervalSec,
        timeoutMs: 5000,
        config: {
          currentVersion: stripLeadingV(resolvedCurrentVersion),
          currentTag: stripLeadingV(resolvedCurrentVersion),
          gitlabHost,
          provider,
          token: tokenInput || undefined,
          appUrl: appUrl || undefined,
          appAuthType,
          appToken: appToken || undefined,
          openvpnUsername: openvpnUsername || undefined,
          openvpnPassword: openvpnPassword || undefined,
          appVersionEndpoint: appVersionEndpoint || undefined,
          endpointFallbacks: selectedTool?.versionSource.endpointFallbacks?.length
            ? selectedTool.versionSource.endpointFallbacks
            : undefined,
        },
      }),
    });
    setCreateOpen(false);
    resetCreateForm();
    await load();
  }

  const total = summary?.items.length ?? 0;
  const size = Number(pageSize);

  const modalProgress = createStep < 0 ? 0 : ((createStep + 1) / 4) * 100;
  const missing: string[] = [];
  if (createStep === 0) {
    if (!name.trim()) missing.push('Name is required.');
    if (!target.trim()) missing.push('Target is required.');
  }
  if (createStep === 1) {
    if (sourceStatus !== 'ok') missing.push('Please run Source check successfully.');
    if (selectedTool?.requiresInstanceUrl && !appUrl.trim()) missing.push(`Enter your ${selectedTool.name} instance URL.`);
    if (appUrl && appStatus !== 'ok' && !currentVersion.trim()) missing.push('App version could not be detected. Add token/custom endpoint or set current version manually.');
  }
  if (createStep === 2 && !currentVersion.trim()) {
    missing.push('Current version is required.');
  }
  const pages = Math.max(1, Math.ceil(total / size));
  const safePage = Math.min(page, pages);

  function handleVersionSort(col: typeof sortBy) {
    if (sortBy === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortBy(col); setSortDir('asc'); }
    setPage(1);
  }

  function statusSortKey(level: 'green' | 'yellow' | 'red') {
    if (level === 'green') return 1;
    if (level === 'yellow') return 2;
    return 0; // red = worst first when asc
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

  function exportCSV() {
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
  }

  const providerOptions = [
    { value: 'github', label: 'GitHub releases' },
    { value: 'gitlab', label: 'GitLab releases' },
    { value: 'docker', label: 'Docker image tags' },
    { value: 'apt', label: 'APT package versions' },
    { value: 'npm', label: 'npm package' },
    { value: 'pypi', label: 'PyPI package' },
    { value: 'cargo', label: 'Cargo crate (crates.io)' },
    { value: 'maven', label: 'Maven Central artifact' },
    { value: 'helm', label: 'Helm chart (Artifact Hub)' },
  ];

  const authOptions = [
    { value: 'token', label: 'Token headers' },
    { value: 'openvpn', label: 'OpenVPN (Basic / OpenVPN headers)' },
    { value: 'none', label: 'No auth' },
  ];

  return (
    <AppFrame title="Version Center" subtitle="Track outdated releases/images and trigger checks on demand." breadcrumbs={[{ label: "Version Center" }]}>
      {loading ? (
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-12 w-12 border-2 border-accent border-t-transparent" />
        </div>
      ) : (
        <>
          {/* Create Modal */}
          <Modal
            isOpen={createOpen}
            onClose={() => { setCreateOpen(false); resetCreateForm(); }}
            title="Create version check"
            size="lg"
            actions={
              <div className="flex items-center justify-between w-full">
                <Button variant="secondary" onClick={() => setCreateStep((s) => Math.max(-1, s - 1))} disabled={createStep === -1}>Back</Button>
                {createStep < 3
                  ? <Button onClick={() => setCreateStep((s) => Math.min(3, s + 1))} disabled={missing.length > 0}>Next</Button>
                  : <Button onClick={createVersionCheck} disabled={missing.length > 0}>Create check</Button>
                }
              </div>
            }
          >
            {/* Progress bar */}
            <div className="w-full bg-surface-elevated rounded-full h-2 mb-4">
              <div className="bg-accent h-2 rounded-full transition-all" style={{ '--progress-width': `${modalProgress}%`, width: 'var(--progress-width)' } as CSSProperties} />
            </div>

            {/* Validation errors */}
            {missing.length > 0 && (
              <div className="bg-danger/10 border border-danger/30 rounded-lg p-3 mb-4">
                <div className="flex items-center gap-2 mb-1">
                  <AlertCircle className="w-4 h-4 text-danger" />
                  <span className="text-sm font-semibold text-danger">Missing information</span>
                </div>
                {missing.map((m) => <p key={m} className="text-sm text-danger">• {m}</p>)}
              </div>
            )}

            {createStep === -1 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-text-primary">Pick a tool from the registry</p>
                  <button onClick={() => setCreateStep(0)} className="text-xs text-accent hover:underline">Skip → manual config</button>
                </div>
                {/* Search + category filter */}
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary" />
                    <input
                      className="w-full pl-9 pr-4 py-2 text-sm bg-surface border border-border rounded-lg text-text-primary placeholder-text-secondary focus:outline-none focus:ring-2 focus:ring-accent"
                      placeholder="Search tools…"
                      value={toolSearch}
                      onChange={(e) => {
                        setToolSearch(e.target.value);
                        setToolVisibleCount(50);
                      }}
                      autoFocus
                    />
                  </div>
                  <select
                    value={toolCategory}
                    onChange={(e) => setToolCategory(e.target.value)}
                    className="px-3 py-2 text-sm bg-surface border border-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
                  >
                    <option value="">All categories</option>
                    {(toolRegistry?.categories ?? []).map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                {/* Tool grid */}
                <div
                  className="max-h-80 overflow-y-auto -mx-1 px-1"
                  onScroll={(e) => {
                    const el = e.currentTarget;
                    const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 40;
                    if (nearBottom) setToolVisibleCount((prev) => prev + 50);
                  }}
                >
                  {toolRegistry === null ? (
                    <p className="text-sm text-text-secondary text-center py-8">Loading registry…</p>
                  ) : (() => {
                    const q = toolSearchDebounced.toLowerCase().trim().replace(/\s+/g, ' ');
                    // Ranked filter: exact name > name starts-with > name contains > tag exact > tag contains > description
                    const filtered = (() => {
                      const all = toolRegistry.tools.filter((t) => {
                        const cat = !toolCategory || t.category === toolCategory;
                        if (!q) return cat;
                        if (!cat) return false;
                        const name = t.name.toLowerCase();
                        const desc = t.description.toLowerCase();
                        const id = t.id.toLowerCase();
                        return (
                          name === q || name.startsWith(q) || name.includes(q) ||
                          id === q || id.startsWith(q) ||
                          t.tags.some((tag) => tag.toLowerCase() === q || tag.toLowerCase().includes(q)) ||
                          desc.includes(q)
                        );
                      });
                      if (!q) return all;
                      return all.sort((a, b) => {
                        const score = (t: typeof a) => {
                          const name = t.name.toLowerCase();
                          const id = t.id.toLowerCase();
                          if (name === q) return 10;
                          if (name.startsWith(q)) return 20;
                          if (name.includes(q)) return 30;
                          if (id === q || id.startsWith(q)) return 40;
                          if (t.tags.some((tag) => tag.toLowerCase() === q)) return 50;
                          if (t.tags.some((tag) => tag.toLowerCase().includes(q))) return 60;
                          return 70;
                        };
                        const sa = score(a), sb = score(b);
                        if (sa !== sb) return sa - sb;
                        if (a.verified !== b.verified) return a.verified ? -1 : 1;
                        return a.name.localeCompare(b.name);
                      });
                    })();
                    const visible = filtered.slice(0, toolVisibleCount);
                    // For empty results, find close matches (cross-category if category filter is active)
                    const closeMatches = filtered.length === 0 && q
                      ? toolRegistry.tools.filter((t) => {
                          const name = t.name.toLowerCase();
                          const id = t.id.toLowerCase();
                          return name.includes(q) || id.includes(q) || t.tags.some((tag) => tag.toLowerCase().includes(q));
                        }).slice(0, 4)
                      : [];
                    return filtered.length === 0 ? (
                      <div className="py-8 text-center space-y-3">
                        <p className="text-sm text-text-secondary">
                          No tools found for &ldquo;{toolSearch}&rdquo;{toolCategory ? ` in ${toolCategory}` : ''}.
                        </p>
                        {closeMatches.length > 0 && (
                          <div>
                            <p className="text-xs text-text-secondary mb-2">Did you mean:</p>
                            <div className="flex flex-wrap gap-2 justify-center">
                              {closeMatches.map((t) => (
                                <button
                                  key={t.id}
                                  onClick={() => { setToolCategory(''); applyToolToForm(t); }}
                                  className="text-xs px-3 py-1 rounded-full border border-border bg-surface-elevated text-text-primary hover:border-accent/50 transition-colors"
                                >
                                  {t.name}
                                  {toolCategory && <span className="ml-1 text-text-secondary">({t.category})</span>}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                        <p className="text-xs text-text-secondary">
                          Not in the registry?{' '}
                          <button
                            className="text-accent hover:underline"
                            onClick={() => { setToolSearch(''); setSelectedTool(null); setToolVariants([]); setSelectedVariantId(''); }}
                          >
                            Use manual config
                          </button>
                        </p>
                      </div>
                    ) : (
                      <>
                        <p className="text-xs text-text-secondary mb-2">Showing {visible.length} of {filtered.length} tools</p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {visible.map((tool) => (
                            <button
                              key={tool.id}
                              onClick={() => applyToolToForm(tool)}
                              className="flex flex-col items-start gap-1.5 rounded-xl border border-border bg-surface-elevated p-3 text-left hover:border-accent/50 hover:bg-accent/5 transition-all"
                            >
                              <div className="flex items-center gap-2 w-full min-w-0">
                                <img src={tool.icon} alt={tool.name} className="w-6 h-6 shrink-0" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                                <span className="text-sm font-medium text-text-primary truncate">{tool.name}</span>
                                {tool.verified && <Check className="w-3 h-3 text-success shrink-0 ml-auto" aria-label="Verified" />}
                              </div>
                              <span className="text-xs text-text-secondary leading-snug line-clamp-2">{tool.description}</span>
                              <span className="text-xs px-1.5 py-0.5 rounded-md bg-surface border border-border text-text-secondary">{tool.category}</span>
                            </button>
                          ))}
                        </div>
                        {visible.length < filtered.length && (
                          <p className="text-xs text-text-secondary text-center mt-3">Scroll to load more…</p>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>
            )}

            {createStep === 0 && isAgentTool && (() => {
              const toolSlug = selectedTool?.id ?? 'my-tool';
              const dockerRun = `docker run -d \\
  --name pulsedock-agent \\
  -e PULSEDOCK_URL=${agentPulsedockUrl} \\
  -e PULSEDOCK_API_KEY=${agentApiKeyDisplay} \\
  -e AGENT_TOOL_IDS=${toolSlug} \\
  --restart unless-stopped \\
  pulsedock/agent:latest`;
              const dockerCompose = `services:
  pulsedock-agent:
    image: pulsedock/agent:latest
    container_name: pulsedock-agent
    restart: unless-stopped
    environment:
      PULSEDOCK_URL: ${agentPulsedockUrl}
      PULSEDOCK_API_KEY: ${agentApiKeyDisplay}
      AGENT_TOOL_IDS: ${toolSlug}
      AGENT_INTERVAL_SEC: "3600"`;
              const shellScript = `#!/bin/bash
# PulseDock Agent — one-shot shell check for ${selectedTool?.name ?? 'your tool'}
PULSEDOCK_URL="${agentPulsedockUrl}"
PULSEDOCK_API_KEY="${agentApiKeyDisplay}"
${selectedTool?.versionSource.agentCommand ? `VERSION=$(${selectedTool.versionSource.agentCommand})` : `VERSION=$(your-tool --version 2>&1 | grep -oP '\\d+\\.\\d+\\.\\d+')`}
curl -s -X POST "$PULSEDOCK_URL/v1/agent/report" \\
  -H "Authorization: Bearer $PULSEDOCK_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d "{\"toolId\":\"${toolSlug}\",\"version\":\"$VERSION\"}"`;
              const currentSnippet = agentTab === 'docker-run' ? dockerRun : agentTab === 'compose' ? dockerCompose : shellScript;
              return (
                <div className="space-y-4 mb-4">
                  <div className="rounded-xl border border-accent/30 bg-accent/5 p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-8 h-8 rounded-lg bg-accent/20 flex items-center justify-center">
                        <GitBranch className="w-4 h-4 text-accent" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-text-primary">Agent Required</p>
                        <p className="text-xs text-text-secondary">This tool requires the PulseDock Agent running locally</p>
                      </div>
                      <a href="/account#api-keys" target="_blank" rel="noopener" className="text-xs text-accent hover:underline flex items-center gap-1 shrink-0">
                        Get API key <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                    <p className="text-sm text-text-secondary mb-3">
                      <strong className="text-text-primary">{selectedTool?.name}</strong> doesn&apos;t expose an external API.
                      The PulseDock Agent runs on your server, checks the local version, and reports it back via API key.
                    </p>
                    {/* API key selector */}
                    {userApiKeys.length > 0 ? (
                      <div className="mb-3">
                        <label className="block text-xs font-medium text-text-secondary mb-1">API Key (pre-filled in snippets below)</label>
                        <select
                          className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
                          value={selectedApiKeyId}
                          onChange={(e) => setSelectedApiKeyId(e.target.value)}
                        >
                          {userApiKeys.map((k) => (
                            <option key={k.id} value={k.id}>{k.name} ({k.prefix}...)</option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <div className="mb-3 p-3 rounded-lg bg-warning/10 border border-warning/30 text-xs text-warning">
                        No API keys yet. <a href="/account#api-keys" target="_blank" rel="noopener" className="underline font-medium">Create one first →</a>
                      </div>
                    )}

                    {selectedTool?.versionSource.agentNote && (
                      <p className="text-sm text-accent mb-3">{selectedTool.versionSource.agentNote}</p>
                    )}

                    {/* Tab switcher */}
                    <div className="flex gap-1 mb-3 p-1 bg-background rounded-lg">
                      {(['docker-run', 'compose', 'shell'] as const).map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setAgentTab(t)}
                          className={`flex-1 py-1.5 text-xs font-medium rounded-md transition ${agentTab === t ? 'bg-accent text-white' : 'text-text-secondary hover:text-text-primary'}`}
                        >
                          {t === 'docker-run' ? 'Docker Run' : t === 'compose' ? 'Compose' : 'Shell Script'}
                        </button>
                      ))}
                    </div>

                    {/* Snippet + copy button */}
                    <div className="relative">
                      <pre className="text-xs bg-background rounded-lg p-3 pr-10 overflow-x-auto text-text-primary font-mono whitespace-pre">{currentSnippet}</pre>
                      <button
                        type="button"
                        onClick={() => copySnippet(currentSnippet, agentTab)}
                        className="absolute top-2 right-2 p-1.5 rounded-md bg-surface hover:bg-surface-elevated transition"
                        title="Copy to clipboard"
                      >
                        {copiedSnippet === agentTab ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5 text-text-secondary" />}
                      </button>
                    </div>

                    {/* Replace placeholders hint */}
                    <p className="text-xs text-text-secondary mt-2">
                      Replace <code className="bg-background px-1 rounded">https://your-pulsedock.example.com</code> and <code className="bg-background px-1 rounded">pdck_your_api_key</code> with your values.{' '}
                      <a href="/account#api-keys" target="_blank" rel="noopener" className="text-accent hover:underline">Create an API key →</a>
                    </p>

                    {/* "I've started the agent" polling button */}
                    {agentReported ? (
                      <div className="mt-3 flex items-center gap-2 text-sm text-green-400">
                        <Check className="w-4 h-4" /> Agent connected — first report received!
                      </div>
                    ) : (
                      <p className="text-xs text-text-secondary mt-3">
                        Create the monitor first, then start the agent. The monitor will show <em>&quot;Waiting for agent…&quot;</em> until the first report arrives.
                      </p>
                    )}
                  </div>
                </div>
              );
            })()}

            {createStep === 0 && (
              <div className="space-y-4">
                {selectedTool ? (
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-surface border border-border">
                    <img src={selectedTool.icon} alt={selectedTool.name} className="w-8 h-8 shrink-0 rounded" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-text-primary">{selectedTool.name}</p>
                      <p className="text-xs text-text-secondary truncate">{selectedTool.description}</p>
                    </div>
                    <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-surface-elevated border border-border text-text-secondary shrink-0">{selectedTool.category}</span>
                  </div>
                ) : (
                  <p className="font-semibold text-text-primary">Step 1/4 · Source</p>
                )}
                {/* Platform variant selector — only shown when tool has multiple variants */}
                {toolVariants.length > 1 && (
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1.5">
                      Platform / Edition
                    </label>
                    <select
                      className="w-full px-3 py-2 rounded-xl bg-surface border border-border text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                      value={selectedVariantId}
                      onChange={(e) => {
                        const variantId = e.target.value;
                        setSelectedVariantId(variantId);
                        const variant = toolVariants.find((v) => v.id === variantId);
                        if (variant && selectedTool) applyVariantOverride(selectedTool, variant);
                      }}
                    >
                      {toolVariants.map((v) => (
                        <option key={v.id} value={v.id}>{v.label}</option>
                      ))}
                    </select>
                    {(() => {
                      const activeVariant = toolVariants.find((v) => v.id === selectedVariantId);
                      return activeVariant?.description ? (
                        <p className="mt-1.5 text-xs text-text-secondary">{activeVariant.description}</p>
                      ) : null;
                    })()}
                    {(() => {
                      const activeVariant = toolVariants.find((v) => v.id === selectedVariantId);
                      return activeVariant?.evidenceUrl ? (
                        <p className="mt-1 text-xs text-text-secondary/60">
                          <a href={activeVariant.evidenceUrl} target="_blank" rel="noopener noreferrer" className="hover:text-accent underline underline-offset-2">
                            View endpoint docs ↗
                          </a>
                        </p>
                      ) : null;
                    })()}
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1.5">Name</label>
                  <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. API backend" />
                </div>
                <Select label="Provider" value={provider} onChange={(v) => {
                  const p = (v as 'github' | 'gitlab' | 'docker' | 'apt' | 'npm' | 'pypi' | 'cargo' | 'maven' | 'helm') || 'github';
                  setProvider(p);
                  setType(p === 'docker' ? 'DOCKER_IMAGE' : 'GIT_RELEASE');
                  setSourceStatus('unknown');
                }} options={providerOptions} />
                {(provider === 'maven' || provider === 'helm') && (
                  <p className="text-xs text-text-secondary/70 -mt-1">
                    {provider === 'maven'
                      ? 'Format: groupId:artifactId — e.g. org.springframework.boot:spring-boot'
                      : 'Format: repoName/chartName — e.g. bitnami/postgresql (from Artifact Hub)'}
                  </p>
                )}
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1.5">
                    Target
                    {selectedTool && target && <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-accent/10 text-accent font-normal">from registry</span>}
                  </label>
                  <input
                    className={`${inputClass} ${selectedTool && target ? 'opacity-70 cursor-not-allowed' : ''}`}
                    value={target}
                    onChange={(e) => { if (!selectedTool) setTarget(e.target.value); }}
                    readOnly={!!(selectedTool && target)}
                    placeholder={provider === 'docker' ? 'library/nginx' : provider === 'apt' ? 'openssl' : provider === 'gitlab' ? 'group/project' : provider === 'npm' ? 'react' : provider === 'pypi' ? 'requests' : provider === 'cargo' ? 'serde' : provider === 'maven' ? 'org.springframework.boot:spring-boot' : provider === 'helm' ? 'bitnami/postgresql' : 'owner/repo'}
                  />
                  {selectedTool && target && (
                    <p className="mt-1 text-xs text-text-secondary">Target pre-filled from the {selectedTool.name} registry entry. <button type="button" className="text-accent hover:underline" onClick={() => { setSelectedTool(null); setToolVariants([]); setSelectedVariantId(''); }}>Clear tool selection</button> to edit manually.</p>
                  )}
                </div>
                {((provider === 'github' || provider === 'gitlab') || showTokenField) && (
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1.5">Repo access token (optional/private repo)</label>
                    <input className={inputClass} value={tokenInput} onChange={(e) => setTokenInput(e.target.value)} />
                  </div>
                )}
                {target && <p className="text-sm text-text-secondary">{latestPreviewLoading ? 'Detecting latest version…' : latestPreview || 'Latest not detected yet'}</p>}
              </div>
            )}

            {createStep === 1 && (
              <div className="space-y-4">
                {selectedTool ? (
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-surface border border-border">
                    <img src={selectedTool.icon} alt={selectedTool.name} className="w-8 h-8 shrink-0 rounded" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-text-primary">{selectedTool.name}</p>
                      <p className="text-xs text-text-secondary truncate">{selectedTool.description}</p>
                    </div>
                  </div>
                ) : (
                  <p className="font-semibold text-text-primary">Step 2/4 · Connection</p>
                )}
                {provider === 'gitlab' && (
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1.5">GitLab host</label>
                    <input className={inputClass} value={gitlabHost} onChange={(e) => setGitlabHost(e.target.value)} placeholder="gitlab.com" />
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1.5">
                    {selectedTool?.requiresInstanceUrl
                      ? <>{selectedTool.name} instance URL <span className="text-danger">*</span></>
                      : 'Application URL (optional — enables deployed version detection)'}
                  </label>
                  <input
                    className={inputClass}
                    value={appUrl}
                    onChange={(e) => { setAppUrl(e.target.value); setAppStatus('unknown'); setCurrentVersionLocked(false); setAppDetectedFrom(''); setAppTriedEndpoints([]); }}
                    placeholder={selectedTool?.requiresInstanceUrl ? `https://your-${selectedTool.name.toLowerCase().replace(/\s+/g, '-')}.example.com` : 'https://app.example.com'}
                  />
                  {selectedTool?.requiresInstanceUrl && !appUrl && (
                    <p className="mt-1 text-xs text-danger">Enter the URL where your {selectedTool.name} instance is running.</p>
                  )}
                </div>
                {appUrl && (
                  <Select label="Application auth" value={appAuthType} onChange={(v) => setAppAuthType((v as 'none' | 'token' | 'openvpn') || 'none')} options={authOptions} />
                )}
                {appUrl && appAuthType === 'token' && (
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1.5">Application token (optional)</label>
                    <input type="password" className={inputClass} value={appToken} onChange={(e) => setAppToken(e.target.value)} placeholder="Bearer token or API key" />
                  </div>
                )}
                {appUrl && appAuthType === 'openvpn' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-text-secondary mb-1.5">OpenVPN username</label>
                      <input className={inputClass} value={openvpnUsername} onChange={(e) => setOpenvpnUsername(e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-text-secondary mb-1.5">OpenVPN password</label>
                      <input className={inputClass} value={openvpnPassword} onChange={(e) => setOpenvpnPassword(e.target.value)} />
                    </div>
                  </>
                )}
                {appUrl && (
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1.5">Custom app version endpoint (optional)</label>
                    <input className={inputClass} value={appVersionEndpoint} onChange={(e) => setAppVersionEndpoint(e.target.value)} placeholder="/api/system/version" />
                  </div>
                )}
                <Button variant="primary" onClick={validateSetup}>✓ Verify connection</Button>
                {testMessage && <p className={`text-sm ${sourceStatus === 'ok' ? 'text-success' : sourceStatus === 'fail' ? 'text-danger' : 'text-text-secondary'}`}>{testMessage}</p>}
                {showAuthHint && (
                  <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30">
                    <span className="text-amber-400 text-base shrink-0 mt-0.5">⚠</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-amber-300">Got 401 Unauthorized — authentication required</p>
                      <p className="text-xs text-amber-400/80 mt-0.5">This app requires a token to read its version endpoint. Switch to auth mode and add credentials.</p>
                      <button
                        type="button"
                        className="mt-2 text-xs font-medium text-amber-300 hover:text-amber-200 underline underline-offset-2"
                        onClick={() => { setAppAuthType('token'); setShowAuthHint(false); }}
                      >
                        Enable auth →
                      </button>
                    </div>
                    <button
                      type="button"
                      className="text-amber-500/60 hover:text-amber-400 text-lg leading-none shrink-0"
                      aria-label="Dismiss"
                      onClick={() => setShowAuthHint(false)}
                    >
                      ×
                    </button>
                  </div>
                )}
                {appDetectedFrom && <p className="text-xs text-text-secondary">App version source endpoint: {appDetectedFrom}</p>}
                {!appDetectedFrom && appTriedEndpoints.length > 0 && <p className="text-xs text-text-secondary">Tried: {appTriedEndpoints.join(', ')}</p>}
                {appUrl && !currentVersion && !detectTried && <p className="text-xs text-text-secondary">Tip: click &quot;Validate and detect versions&quot; to auto-read deployed app version first.</p>}
                {selectedTool && sourceStatus === 'fail' && !templateReportSent && (
                  <div>
                    {!showTemplateReport ? (
                      <button
                        type="button"
                        className="text-xs text-text-secondary hover:text-text-primary underline underline-offset-2"
                        onClick={() => setShowTemplateReport(true)}
                      >
                        Wrong version format? Report this template →
                      </button>
                    ) : (
                      <div className="p-3 rounded-xl bg-surface border border-border space-y-3">
                        <p className="text-sm font-medium text-text-primary">Report template issue</p>
                        <p className="text-xs text-text-secondary">Tool: <span className="text-text-primary">{selectedTool.name}</span> · Target: <span className="text-text-primary">{target || '—'}</span></p>
                        {testMessage && <p className="text-xs text-text-secondary">Error: <span className="text-danger">{testMessage}</span></p>}
                        <textarea
                          className={`${inputClass} text-sm resize-none`}
                          rows={3}
                          placeholder="Optional note (e.g. expected format, actual response)…"
                          value={templateReportNote}
                          onChange={(e) => setTemplateReportNote(e.target.value)}
                        />
                        <div className="flex gap-2">
                          <Button variant="primary" size="sm" onClick={sendTemplateReport}>Send report</Button>
                          <Button variant="ghost" size="sm" onClick={() => { setShowTemplateReport(false); setTemplateReportNote(''); }}>Cancel</Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {templateReportSent && (
                  <p className="text-xs text-success">✓ Thanks — we&apos;ll review this template.</p>
                )}
              </div>
            )}

            {createStep === 2 && (
              <div className="space-y-4">
                <p className="font-semibold text-text-primary">Step 3/4 · Version strategy</p>
                <div className="flex items-center gap-6 mb-2">
                  <div className="flex items-center gap-2">
                    <StatusIcon status={sourceStatus} />
                    <span className="text-sm text-text-primary">Source version ({provider})</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusIcon status={appStatus} />
                    <span className="text-sm text-text-primary">Application version</span>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1.5">Current version/tag</label>
                  <input className={inputClass} value={currentVersion} onChange={(e) => setCurrentVersion(e.target.value)} placeholder="v1.2.3" disabled={currentVersionLocked} />
                </div>
                <Button variant="ghost" size="sm" onClick={() => setAdvanced((v) => !v)}>{advanced ? 'Hide advanced' : 'Show advanced'}</Button>
                {advanced && (
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1.5">Interval (minutes)</label>
                    <input
                      type="number"
                      className={inputClass}
                      value={intervalInput}
                      min={1}
                      onChange={(e) => setIntervalInput(e.target.value)}
                      onBlur={() => {
                        const mins = parseInt(intervalInput, 10);
                        const safe = isNaN(mins) || mins < 1 ? 1 : mins;
                        setIntervalInput(String(safe));
                        setIntervalSec(safe * 60);
                      }}
                    />
                  </div>
                )}
              </div>
            )}

            {createStep === 3 && (
              <div className="space-y-2">
                <p className="font-semibold text-text-primary">Step 4/4 · Review</p>
                <p className="text-sm text-text-primary">Name: <strong>{name}</strong></p>
                <p className="text-sm text-text-primary">Provider: <strong>{provider}</strong></p>
                <p className="text-sm text-text-primary">Target: <strong>{target}</strong></p>
                <p className="text-sm text-text-primary">Current: <strong>{currentVersion || 'not set'}</strong></p>
                <p className="text-sm text-text-primary">App URL: <strong>{appUrl || 'not set'}</strong></p>
                <p className="text-sm text-text-primary">Interval: <strong>{secondsToHuman(intervalSec)}</strong></p>
              </div>
            )}
          </Modal>

          {/* Edit Modal */}
          <Modal
            isOpen={editOpen}
            onClose={() => setEditOpen(false)}
            title="Edit version check"
            size="lg"
            actions={
              <>
                <Button variant="secondary" onClick={() => setEditOpen(false)}>Cancel</Button>
                <Button loading={editSaving} onClick={saveEdit}>Save</Button>
              </>
            }
          >
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1.5">Name</label>
                <input className={inputClass} value={editName} onChange={(e) => setEditName(e.target.value)} />
              </div>
              <Select label="Provider" value={editProvider} onChange={(v) => setEditProvider((v as 'github' | 'gitlab' | 'docker' | 'apt' | 'npm' | 'pypi' | 'cargo' | 'maven' | 'helm') || 'github')} options={providerOptions} />
              {(editProvider === 'maven' || editProvider === 'helm') && (
                <p className="text-xs text-text-secondary/70 -mt-1">
                  {editProvider === 'maven'
                    ? 'Format: groupId:artifactId — e.g. org.springframework.boot:spring-boot'
                    : 'Format: repoName/chartName — e.g. bitnami/postgresql (from Artifact Hub)'}
                </p>
              )}
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1.5">Target</label>
                <input className={inputClass} value={editTarget} onChange={(e) => setEditTarget(e.target.value)} placeholder={editProvider === 'docker' ? 'library/nginx' : editProvider === 'apt' ? 'openssl' : editProvider === 'gitlab' ? 'group/project' : editProvider === 'npm' ? 'react' : editProvider === 'pypi' ? 'requests' : editProvider === 'cargo' ? 'serde' : editProvider === 'maven' ? 'org.springframework.boot:spring-boot' : editProvider === 'helm' ? 'bitnami/postgresql' : 'owner/repo'} />
              </div>
              {(editProvider === 'github' || editProvider === 'gitlab') && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1.5">Repo token (stored)</label>
                    <input className={`${inputClass} opacity-50`} value={editHasRepoToken ? '••••••••••' : 'not set'} disabled />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1.5">Overwrite repo token (optional)</label>
                    <input className={inputClass} value={editToken} onChange={(e) => setEditToken(e.target.value)} placeholder="Enter only if you want to replace existing token" />
                  </div>
                </>
              )}
              {editProvider === 'gitlab' && (
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1.5">GitLab host</label>
                  <input className={inputClass} value={editGitlabHost} onChange={(e) => setEditGitlabHost(e.target.value)} placeholder="gitlab.com" />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1.5">Application URL (optional)</label>
                <input className={inputClass} value={editAppUrl} onChange={(e) => setEditAppUrl(e.target.value)} placeholder="https://app.example.com" />
              </div>
              {editAppUrl && (
                <Select label="Application auth" value={editAppAuthType} onChange={(v) => setEditAppAuthType((v as 'none' | 'token' | 'openvpn') || 'none')} options={authOptions} />
              )}
              {editAppUrl && editAppAuthType === 'token' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1.5">Application token (stored)</label>
                    <input className={`${inputClass} opacity-50`} value={editHasAppToken ? '••••••••••' : 'not set'} disabled />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1.5">Overwrite application token (optional)</label>
                    <input className={inputClass} value={editAppToken} onChange={(e) => setEditAppToken(e.target.value)} placeholder="Enter only if you want to replace existing token" />
                  </div>
                </>
              )}
              {editAppUrl && editAppAuthType === 'openvpn' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1.5">OpenVPN username</label>
                    <input className={inputClass} value={editOpenvpnUsername} onChange={(e) => setEditOpenvpnUsername(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1.5">OpenVPN password (stored)</label>
                    <input className={`${inputClass} opacity-50`} value={editHasOpenvpnPassword ? '••••••••••' : 'not set'} disabled />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1.5">Overwrite OpenVPN password (optional)</label>
                    <input className={inputClass} value={editOpenvpnPassword} onChange={(e) => setEditOpenvpnPassword(e.target.value)} />
                  </div>
                </>
              )}
              {editAppUrl && (
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1.5">Custom app version endpoint (optional)</label>
                  <input className={inputClass} value={editAppVersionEndpoint} onChange={(e) => setEditAppVersionEndpoint(e.target.value)} placeholder="/api/system/version" />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1.5">Current version</label>
                <input className={inputClass} value={editCurrentVersion} onChange={(e) => setEditCurrentVersion(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1.5">Interval (minutes)</label>
                <input
                  type="number"
                  className={inputClass}
                  value={editIntervalInput}
                  min={1}
                  onChange={(e) => setEditIntervalInput(e.target.value)}
                  onBlur={() => {
                    const mins = parseInt(editIntervalInput, 10);
                    const safe = isNaN(mins) || mins < 1 ? 1 : mins;
                    setEditIntervalInput(String(safe));
                    setEditIntervalSec(safe * 60);
                  }}
                />
              </div>
            </div>
          </Modal>

          {/* Header */}
          <div className="flex items-center justify-between mb-4 gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs text-text-secondary mb-1">
                <span>Dashboard</span>
                <span>/</span>
                <span className="text-text-primary font-medium">Versions</span>
              </div>
              <h2 className="text-2xl font-bold text-text-primary">Version Checks</h2>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {(summary?.items?.length ?? 0) > 0 && (
                <Button variant="secondary" size="sm" loading={runningAll} onClick={runAllNow} title="Run all version checks now">
                  <span className="flex items-center gap-1.5">
                    <Play className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Check All</span>
                  </span>
                </Button>
              )}
              <Button variant="secondary" size="sm" onClick={() => load()} title="Refresh">
                <span className="hidden sm:inline">Refresh</span>
                <span className="sm:hidden">↺</span>
              </Button>
              {sortedItems.length > 0 && (
                <Button variant="secondary" size="sm" onClick={exportCSV} title="Export to CSV">
                  <span className="flex items-center gap-1.5">
                    <Download className="w-4 h-4" />
                    <span className="hidden sm:inline">Export CSV</span>
                  </span>
                </Button>
              )}
              <Button size="sm" onClick={() => { resetCreateForm(); setCreateOpen(true); }}>
                <span className="flex items-center gap-1.5">
                  <Plus className="w-4 h-4" />
                  <span className="hidden sm:inline">Create version check</span>
                  <span className="sm:hidden">New</span>
                </span>
              </Button>
            </div>
          </div>

          {/* Summary row */}
          {(summary?.stats.total ?? 0) > 0 && (
            <div className="flex items-center gap-4 mb-6 text-sm flex-wrap">
              <span className="text-text-secondary">
                <span className="font-semibold text-text-primary">{summary?.stats.total ?? 0}</span> monitored
              </span>
              <span className="text-text-secondary opacity-40">·</span>
              <span className="text-text-secondary">
                <span className="font-semibold text-success">{summary?.stats.green ?? 0}</span> up to date
              </span>
              <span className="text-text-secondary opacity-40">·</span>
              <span className="text-text-secondary">
                <span className={`font-semibold ${((summary?.stats.yellow ?? 0) + (summary?.stats.red ?? 0)) > 0 ? 'text-warning' : 'text-text-primary'}`}>
                  {(summary?.stats.yellow ?? 0) + (summary?.stats.red ?? 0)}
                </span> updates available
              </span>
              {(summary?.stats.red ?? 0) > 0 && (
                <>
                  <span className="text-text-secondary opacity-40">·</span>
                  <span className="text-text-secondary">
                    <span className="font-semibold text-danger">{summary?.stats.red ?? 0}</span> critical
                  </span>
                </>
              )}
              {/* Sort by + column picker */}
              <div className="ml-auto flex items-center gap-2">
                <span className="text-xs text-text-secondary">Sort by</span>
                <select
                  value={`${sortBy}-${sortDir}`}
                  onChange={(e) => {
                    const [col, dir] = e.target.value.split('-') as [typeof sortBy, typeof sortDir];
                    setSortBy(col);
                    setSortDir(dir);
                    setPage(1);
                  }}
                  className="text-xs px-2 py-1 bg-surface-elevated border border-border rounded-lg text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
                >
                  <option value="name-asc">Name A→Z</option>
                  <option value="name-desc">Name Z→A</option>
                  <option value="status-asc">Status (updates first)</option>
                  <option value="status-desc">Status (ok first)</option>
                  <option value="lastChecked-desc">Last checked (newest)</option>
                  <option value="lastChecked-asc">Last checked (oldest)</option>
                </select>
                {/* Column visibility toggle */}
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
                      {([['name', 'Name'], ['type', 'Type'], ['target', 'Target'], ['current', 'Current'], ['latest', 'Latest'], ['status', 'Status'], ['lastChecked', 'Last Checked'], ['interval', 'Interval'], ['action', 'Action']] as [string, string][]).map(([col, label]) => (
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
              </div>
            </div>
          )}

          {/* Stats */}
          {(summary?.stats.total ?? 0) > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <Card>
                <p className="text-text-secondary text-sm mb-1">Tracked</p>
                <p className="text-2xl font-bold text-text-primary">{summary?.stats.total ?? 0}</p>
              </Card>
              <Card>
                <p className="text-text-secondary text-sm mb-1">Up-to-date</p>
                <p className="text-2xl font-bold text-success">{summary?.stats.green ?? 0}</p>
              </Card>
              <Card>
                <p className="text-text-secondary text-sm mb-1">Updates</p>
                <p className="text-2xl font-bold text-warning">{summary?.stats.yellow ?? 0}</p>
              </Card>
              <Card>
                <p className="text-text-secondary text-sm mb-1">Critical</p>
                <p className="text-2xl font-bold text-danger">{summary?.stats.red ?? 0}</p>
              </Card>
            </div>
          )}

          {(summary?.items.length ?? 0) === 0 ? (
            <Card className="text-center py-16">
              <div className="p-4 rounded-2xl bg-surface-elevated inline-block mb-4">
                <GitBranch className="w-12 h-12 text-text-secondary opacity-50" />
              </div>
              <p className="text-text-primary text-lg font-medium mb-2">No version checks yet</p>
              <p className="text-text-secondary text-sm mb-6">
                Track GitHub releases, Docker image tags, and more to stay on top of updates
              </p>
              <Button size="lg" onClick={() => { resetCreateForm(); setCreateOpen(true); }}>Create your first version check</Button>
            </Card>
          ) : (
          <>
          {/* Main Table */}
          <Card className="p-0">
            <div className="overflow-x-auto">
            <Table>
              <TableHead className="sticky top-0 z-10 bg-surface-elevated/95 backdrop-blur-sm">
                <TableRow hover={false}>
                  <TableHeader className={visibleCols.name ? '' : 'hidden'}>
                    <button onClick={() => handleVersionSort('name')} className="flex items-center gap-1 hover:text-text-primary transition-colors">
                      Name {sortBy === 'name' ? (sortDir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />) : <ChevronsUpDown className="h-3 w-3 opacity-40" />}
                    </button>
                  </TableHeader>
                  <TableHeader className={visibleCols.type ? 'hidden sm:table-cell' : 'hidden'}>Type</TableHeader>
                  <TableHeader className={visibleCols.target ? 'hidden md:table-cell' : 'hidden'}>Target</TableHeader>
                  <TableHeader className={visibleCols.current ? 'hidden sm:table-cell' : 'hidden'}>Current</TableHeader>
                  <TableHeader className={visibleCols.latest ? '' : 'hidden'}>Latest</TableHeader>
                  <TableHeader className={visibleCols.status ? '' : 'hidden'}>
                    <button onClick={() => handleVersionSort('status')} className="flex items-center gap-1 hover:text-text-primary transition-colors">
                      Status {sortBy === 'status' ? (sortDir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />) : <ChevronsUpDown className="h-3 w-3 opacity-40" />}
                    </button>
                  </TableHeader>
                  <TableHeader className={visibleCols.lastChecked ? 'hidden lg:table-cell' : 'hidden'}>
                    <button onClick={() => handleVersionSort('lastChecked')} className="flex items-center gap-1 hover:text-text-primary transition-colors">
                      Last check {sortBy === 'lastChecked' ? (sortDir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />) : <ChevronsUpDown className="h-3 w-3 opacity-40" />}
                    </button>
                  </TableHeader>
                  <TableHeader className={visibleCols.interval ? 'hidden lg:table-cell' : 'hidden'}>Interval</TableHeader>
                  <TableHeader className={visibleCols.action ? '' : 'hidden'}>Action</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {visible.map((item) => {
                  const runs = runsByMonitor[item.id] ?? [];
                  const stats = runs.reduce((acc, r) => {
                    acc.total += 1;
                    if (r.level === 'green') acc.green += 1;
                    else if (r.level === 'yellow') acc.yellow += 1;
                    else acc.red += 1;
                    return acc;
                  }, { total: 0, green: 0, yellow: 0, red: 0 });

                  return (
                    <Fragment key={item.id}>
                      <TableRow>
                        <TableCell className={visibleCols.name ? '' : 'hidden'}>
                          <button className="text-accent hover:underline flex items-center gap-1 text-left" onClick={() => toggleDetails(item.id)}>
                            {expandedId === item.id ? <ChevronUp className="w-3 h-3 shrink-0" /> : <ChevronDown className="w-3 h-3 shrink-0" />}
                            <span className="truncate max-w-[120px] sm:max-w-none">{item.name}</span>
                          </button>
                        </TableCell>
                        <TableCell className={visibleCols.type ? 'hidden sm:table-cell' : 'hidden'}>
                          {(() => {
                            const cfg = (monitorDetails[item.id]?.config ?? {}) as Record<string, unknown>;
                            const prov = String(cfg.provider ?? (item.type === 'DOCKER_IMAGE' ? 'docker' : 'github')).toLowerCase();
                            const providerLabels: Record<string, string> = {
                              github: 'GitHub', gitlab: 'GitLab', docker: 'Docker',
                              apt: 'APT', npm: 'npm', pypi: 'PyPI',
                              cargo: 'Cargo', maven: 'Maven', helm: 'Helm',
                            };
                            return <span className="text-xs text-text-secondary">{providerLabels[prov] ?? item.type}</span>;
                          })()}
                        </TableCell>
                        <TableCell className={visibleCols.target ? 'hidden md:table-cell' : 'hidden'}>
                          <span
                            className="block max-w-[160px] truncate text-xs font-mono text-text-secondary"
                            title={item.target}
                          >
                            {item.target}
                          </span>
                        </TableCell>
                        <TableCell className={visibleCols.current ? 'hidden sm:table-cell' : 'hidden'}>
                          {item.currentVersion ? (
                            <span className="font-mono text-sm">{item.currentVersion}</span>
                          ) : '—'}
                        </TableCell>
                        <TableCell className={`max-w-[200px] sm:max-w-[320px]${visibleCols.latest ? '' : ' hidden'}`}>
                          {(() => {
                            const { from, to } = extractVersionsFromMessage(item.latestMessage);
                            if (from && to && from !== to) {
                              return <VersionDiff from={from} to={to} />;
                            }
                            return <span className="text-xs text-text-secondary break-all">{item.latestMessage}</span>;
                          })()}
                        </TableCell>
                        <TableCell className={visibleCols.status ? '' : 'hidden'}>
                          {(() => {
                            const { from, to } = extractVersionsFromMessage(item.latestMessage);
                            const hasUpdate = item.level !== 'green';
                            // Build changelog link for GitHub targets
                            let changelogUrl: string | null = null;
                            if (hasUpdate && to && item.target) {
                              const ghMatch = item.target.match(/^([^/]+\/[^/]+)$/);
                              if (ghMatch) {
                                changelogUrl = `https://github.com/${ghMatch[1]}/releases`;
                              }
                            }
                            if (item.level === 'green') {
                              return (
                                <div className="flex items-center gap-1.5 text-success">
                                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                                  <span className="text-xs font-medium">Up to date</span>
                                </div>
                              );
                            }
                            return (
                              <div className="space-y-1">
                                <div className="flex items-center gap-1.5 text-warning">
                                  <ArrowUpCircle className="w-3.5 h-3.5 shrink-0" />
                                  <span className="text-xs font-medium">
                                    {to ? `${/^v\d/i.test(to) ? to : `v${to}`} available` : item.level === 'red' ? 'Critical update' : 'Update available'}
                                  </span>
                                </div>
                                {changelogUrl && (
                                  <a
                                    href={changelogUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1 text-[10px] text-accent hover:underline"
                                  >
                                    <ExternalLink className="w-2.5 h-2.5" />
                                    View changelog
                                  </a>
                                )}
                              </div>
                            );
                          })()}
                        </TableCell>
                        <TableCell className={visibleCols.lastChecked ? 'hidden lg:table-cell' : 'hidden'}>{item.checkedAt ? new Date(item.checkedAt).toLocaleString() : 'Never'}</TableCell>
                        <TableCell className={visibleCols.interval ? 'hidden lg:table-cell' : 'hidden'}>{secondsToHuman(item.intervalSec)}</TableCell>
                        <TableCell className={visibleCols.action ? '' : 'hidden'}>
                          <div className="flex items-center gap-1">
                            <Button variant="secondary" size="sm" loading={runningId === item.id} onClick={() => runNow(item.id)}>
                              <span className="flex items-center gap-1"><Play className="w-3 h-3" /> Run</span>
                            </Button>
                            <button
                              className="relative p-1.5 rounded-lg text-text-secondary hover:text-accent hover:bg-surface-elevated transition-colors"
                              onClick={() => openAlertPanel(item)}
                              aria-label="Alert channels"
                              title="Manage alert channels"
                            >
                              <Bell className="w-4 h-4" />
                              {item.alertChannels && item.alertChannels.length > 0 && (
                                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-accent rounded-full" />
                              )}
                            </button>
                            <button className="p-1.5 rounded-lg text-accent hover:bg-surface-elevated transition-colors" onClick={() => openEdit(item)} aria-label="Edit">
                              <Edit className="w-4 h-4" />
                            </button>
                            <button className="p-1.5 rounded-lg text-danger hover:bg-surface-elevated transition-colors" onClick={() => removeCheck(item.id)} aria-label="Delete">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </TableCell>
                      </TableRow>

                      {expandedId === item.id && (
                        <tr className="border-b border-border">
                          <td colSpan={9} className="px-4 py-3 bg-surface-elevated overflow-x-auto">
                            {runsLoadingId === item.id ? (
                              <p className="text-sm text-text-secondary">Loading runs…</p>
                            ) : (
                              <>
                                <div className="flex items-center gap-4 mb-3">
                                  <span className="text-sm font-semibold text-text-primary">Last runs: {stats.total}</span>
                                  <Badge variant="success">{`Green ${stats.green}`}</Badge>
                                  <Badge variant="warning">{`Yellow ${stats.yellow}`}</Badge>
                                  <Badge variant="danger">{`Red ${stats.red}`}</Badge>
                                </div>
                                {runs.length === 0 ? (
                                  <p className="text-sm text-text-secondary">No runs yet.</p>
                                ) : (
                                  <Table>
                                    <TableHead>
                                      <TableRow hover={false}>
                                        <TableHeader>Time</TableHeader>
                                        <TableHeader>Level</TableHeader>
                                        <TableHeader>Status</TableHeader>
                                        <TableHeader>Latency</TableHeader>
                                        <TableHeader>Version diff</TableHeader>
                                        <TableHeader>Message</TableHeader>
                                      </TableRow>
                                    </TableHead>
                                    <TableBody>
                                      {runs.slice(0, 12).map((r) => {
                                        const { from, to } = extractVersionsFromMessage(r.message);
                                        const hasDiff = from && to && from !== to;
                                        return (
                                          <TableRow key={r.id}>
                                            <TableCell>{new Date(r.checkedAt).toLocaleString()}</TableCell>
                                            <TableCell><Badge variant={levelBadgeVariant(r.level)}>{r.level.toUpperCase()}</Badge></TableCell>
                                            <TableCell>{r.statusCode}</TableCell>
                                            <TableCell>{r.latencyMs ?? '—'} ms</TableCell>
                                            <TableCell>
                                              {hasDiff ? (
                                                <VersionDiff from={from} to={to} />
                                              ) : (
                                                <span className="text-xs text-text-secondary">—</span>
                                              )}
                                            </TableCell>
                                            <TableCell className="text-xs text-text-secondary max-w-[200px]">{r.message}</TableCell>
                                          </TableRow>
                                        );
                                      })}
                                    </TableBody>
                                  </Table>
                                )}
                              </>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>

            {/* Pagination */}
            <div className="flex flex-col gap-3 p-4 border-t border-border sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage <= 1} aria-label="Previous page">
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-sm text-text-secondary">Page {safePage} of {pages}</span>
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
      {/* Alert channel panel */}
      {alertPanelMonitor && (
        <div className="fixed inset-0 z-40 flex justify-end" onClick={() => setAlertPanelMonitor(null)}>
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" />
          <div
            className="relative z-50 w-full max-w-sm bg-bg border-l border-border h-full flex flex-col shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
              <div>
                <h3 className="font-semibold text-text-primary">Alert Channels</h3>
                <p className="text-xs text-text-secondary mt-0.5 truncate max-w-[200px]">{alertPanelMonitor.name}</p>
              </div>
              <button onClick={() => setAlertPanelMonitor(null)} className="p-1.5 rounded-lg hover:bg-surface-elevated text-text-secondary transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
              {alertPanelError && (
                <div className="px-3 py-2 rounded-lg bg-danger/10 border border-danger/20 text-danger text-sm">{alertPanelError}</div>
              )}
              {alertPanelLoading ? (
                <p className="text-sm text-text-secondary">Loading…</p>
              ) : (
                <>
                  {/* Assigned channels */}
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-widest text-text-secondary mb-3">Assigned Channels</h4>
                    {assignedChannels.length === 0 ? (
                      <p className="text-sm text-text-secondary italic">No channels assigned yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {assignedChannels.map((channel) => (
                          <div key={channel.id} className="rounded-lg bg-surface-elevated border border-border/50 overflow-hidden">
                            <div className="flex items-center justify-between px-3 pt-3 pb-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className={`text-[11px] font-bold uppercase tracking-wide ${CHANNEL_TYPE_COLORS[channel.type] ?? 'text-text-secondary'}`}>
                                  {channel.type}
                                </span>
                                <span className="text-sm text-text-primary truncate">{channel.name}</span>
                              </div>
                              <button
                                onClick={() => unassignChannel(channel.id)}
                                className="ml-2 p-1 rounded hover:bg-danger/10 text-text-secondary hover:text-danger transition-colors shrink-0"
                                aria-label={`Remove ${channel.name}`}
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                            <div className="px-3 pb-3">
                              <label className="block text-[10px] text-text-secondary uppercase tracking-wide mb-1">Notify when</label>
                              <select
                                value={channel.notifyOn ?? 'VERSION_ANY'}
                                onChange={(e) => updateNotifyOn(channel.id, e.target.value)}
                                className="w-full text-xs bg-bg border border-border rounded-lg px-2 py-1.5 text-text-primary focus:outline-none focus:border-accent"
                              >
                                {VERSION_NOTIFY_OPTIONS.map((o) => (
                                  <option key={o.value} value={o.value}>{o.label}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Available channels */}
                  {allChannels.filter((c) => !assignedChannels.some((a) => a.id === c.id)).length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold uppercase tracking-widest text-text-secondary mb-3">Add Channel</h4>
                      <div className="space-y-2">
                        {allChannels.filter((c) => !assignedChannels.some((a) => a.id === c.id)).map((channel) => (
                          <div
                            key={channel.id}
                            className="flex items-center justify-between p-3 rounded-lg bg-surface-elevated border border-border/50 hover:border-accent/40 transition-colors"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className={`text-[11px] font-bold uppercase tracking-wide ${CHANNEL_TYPE_COLORS[channel.type] ?? 'text-text-secondary'}`}>
                                {channel.type}
                              </span>
                              <span className="text-sm text-text-primary truncate">{channel.name}</span>
                            </div>
                            <button
                              onClick={() => assignChannel(channel.id)}
                              className="ml-2 p-1.5 rounded-lg bg-accent/10 hover:bg-accent/20 text-accent transition-colors shrink-0"
                              aria-label={`Assign ${channel.name}`}
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </AppFrame>
  );
}

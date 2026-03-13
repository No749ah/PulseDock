'use client';

import { Fragment, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Edit, Trash2, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Check, X, Info, AlertCircle, Play, GitBranch } from 'lucide-react';
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
};

type MonitorDetails = {
  id: string;
  name: string;
  type: 'GIT_RELEASE' | 'DOCKER_IMAGE';
  target: string;
  intervalSec: number;
  timeoutMs: number;
  config: Record<string, unknown>;
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
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState('10');
  const [createOpen, setCreateOpen] = useState(false);
  const [createStep, setCreateStep] = useState(0);
  const [name, setName] = useState('');
  const [type, setType] = useState<'GIT_RELEASE' | 'DOCKER_IMAGE'>('GIT_RELEASE');
  const [provider, setProvider] = useState<'github' | 'gitlab' | 'docker' | 'apt'>('github');
  const [target, setTarget] = useState('');
  const [currentVersion, setCurrentVersion] = useState('');
  const [intervalSec, setIntervalSec] = useState(86400);
  const [tokenInput, setTokenInput] = useState('');
  const [gitlabHost, setGitlabHost] = useState('');
  const [appUrl, setAppUrl] = useState('');
  const [appToken, setAppToken] = useState('');
  const [appVersionEndpoint, setAppVersionEndpoint] = useState('');
  const [appAuthType, setAppAuthType] = useState<'none' | 'token' | 'openvpn'>('token');
  const [openvpnUsername, setOpenvpnUsername] = useState('');
  const [openvpnPassword, setOpenvpnPassword] = useState('');
  const showTokenField = false;
  const [advanced, setAdvanced] = useState(false);
  const [testMessage, setTestMessage] = useState('');
  const [detectTried, setDetectTried] = useState(false);
  const [sourceStatus, setSourceStatus] = useState<'unknown' | 'ok' | 'fail'>('unknown');
  const [appStatus, setAppStatus] = useState<'unknown' | 'ok' | 'fail'>('unknown');
  const [currentVersionLocked, setCurrentVersionLocked] = useState(false);
  const [latestPreview, setLatestPreview] = useState('');
  const [latestPreviewLoading, setLatestPreviewLoading] = useState(false);
  const [appDetectedFrom, setAppDetectedFrom] = useState('');
  const [appTriedEndpoints, setAppTriedEndpoints] = useState<string[]>([]);

  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState('');
  const [editName, setEditName] = useState('');
  const [editProvider, setEditProvider] = useState<'github' | 'gitlab' | 'docker' | 'apt'>('github');
  const [editTarget, setEditTarget] = useState('');
  const [editCurrentVersion, setEditCurrentVersion] = useState('');
  const [editIntervalSec, setEditIntervalSec] = useState(86400);
  const [editToken, setEditToken] = useState('');
  const [editHasRepoToken, setEditHasRepoToken] = useState(false);
  const [editGitlabHost, setEditGitlabHost] = useState('');
  const [editAppUrl, setEditAppUrl] = useState('');
  const [editAppAuthType, setEditAppAuthType] = useState<'none' | 'token' | 'openvpn'>('token');
  const [editAppToken, setEditAppToken] = useState('');
  const [editHasAppToken, setEditHasAppToken] = useState(false);
  const [editOpenvpnUsername, setEditOpenvpnUsername] = useState('');
  const [editHasOpenvpnPassword, setEditHasOpenvpnPassword] = useState(false);
  const [editOpenvpnPassword, setEditOpenvpnPassword] = useState('');
  const [editAppVersionEndpoint, setEditAppVersionEndpoint] = useState('');
  const [editSaving, setEditSaving] = useState(false);

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
    const p = String(cfg.provider ?? (item.type === 'DOCKER_IMAGE' ? 'docker' : 'github')).toLowerCase() as 'github' | 'gitlab' | 'docker' | 'apt';

    setEditId(item.id);
    setEditName(item.name);
    setEditProvider(p);
    setEditTarget(item.target);
    setEditCurrentVersion(String(cfg.currentVersion ?? item.currentVersion ?? ''));
    setEditIntervalSec(item.intervalSec || 86400);
    setEditHasRepoToken(Boolean(cfg.hasRepoToken));
    setEditToken('');
    setEditGitlabHost(String(cfg.gitlabHost ?? ''));
    setEditAppUrl(String(cfg.appUrl ?? ''));
    setEditAppAuthType((String(cfg.appAuthType ?? 'token') as 'none' | 'token' | 'openvpn') || 'token');
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
      const normalized = stripLeadingV(result.currentVersion);
      setCurrentVersion(normalized);
      setCurrentVersionLocked(true);
      setAppStatus('ok');
    } else {
      setCurrentVersionLocked(false);
      setAppStatus(appUrl ? 'fail' : 'unknown');
    }
    return result;
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

  function resetCreateForm() {
    setCreateStep(0);
    setName('');
    setType('GIT_RELEASE');
    setProvider('github');
    setTarget('');
    setCurrentVersion('');
    setIntervalSec(86400);
    setTokenInput('');
    setGitlabHost('');
    setAppUrl('');
    setAppAuthType('token');
    setAppToken('');
    setOpenvpnUsername('');
    setOpenvpnPassword('');
    setAppVersionEndpoint('');
    setAdvanced(false);
    setTestMessage('');
    setDetectTried(false);
    setSourceStatus('unknown');
    setAppStatus('unknown');
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
        },
      }),
    });
    setCreateOpen(false);
    resetCreateForm();
    await load();
  }

  const total = summary?.items.length ?? 0;
  const size = Number(pageSize);

  const modalProgress = ((createStep + 1) / 4) * 100;
  const missing: string[] = [];
  if (createStep === 0) {
    if (!name.trim()) missing.push('Name is required.');
    if (!target.trim()) missing.push('Target is required.');
  }
  if (createStep === 1) {
    if (sourceStatus !== 'ok') missing.push('Please run Source check successfully.');
    if (appUrl && appStatus !== 'ok' && !currentVersion.trim()) missing.push('App version could not be detected. Add token/custom endpoint or set current version manually.');
  }
  if (createStep === 2 && !currentVersion.trim()) {
    missing.push('Current version is required.');
  }
  const pages = Math.max(1, Math.ceil(total / size));
  const safePage = Math.min(page, pages);
  const visible = (summary?.items ?? []).slice((safePage - 1) * size, safePage * size);

  const providerOptions = [
    { value: 'github', label: 'GitHub releases' },
    { value: 'gitlab', label: 'GitLab releases' },
    { value: 'docker', label: 'Docker image tags' },
    { value: 'apt', label: 'APT package versions' },
  ];

  const authOptions = [
    { value: 'token', label: 'Token headers' },
    { value: 'openvpn', label: 'OpenVPN (Basic / OpenVPN headers)' },
    { value: 'none', label: 'No auth' },
  ];

  return (
    <AppFrame title="Version Center" subtitle="Track outdated releases/images and trigger checks on demand.">
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
                <Button variant="secondary" onClick={() => setCreateStep((s) => Math.max(0, s - 1))} disabled={createStep === 0}>Back</Button>
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

            {createStep === 0 && (
              <div className="space-y-4">
                <p className="font-semibold text-text-primary">Step 1/4 · Source</p>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1.5">Name</label>
                  <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. API backend" />
                </div>
                <Select label="Provider" value={provider} onChange={(v) => {
                  const p = (v as 'github' | 'gitlab' | 'docker' | 'apt') || 'github';
                  setProvider(p);
                  setType(p === 'docker' ? 'DOCKER_IMAGE' : 'GIT_RELEASE');
                  setSourceStatus('unknown');
                }} options={providerOptions} />
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1.5">Target</label>
                  <input className={inputClass} value={target} onChange={(e) => setTarget(e.target.value)} placeholder={provider === 'docker' ? 'library/nginx' : provider === 'apt' ? 'openssl' : provider === 'gitlab' ? 'group/project' : 'owner/repo'} />
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
                <p className="font-semibold text-text-primary">Step 2/4 · Connection</p>
                {provider === 'gitlab' && (
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1.5">GitLab host</label>
                    <input className={inputClass} value={gitlabHost} onChange={(e) => setGitlabHost(e.target.value)} placeholder="gitlab.com" />
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1.5">Application URL (deployed app)</label>
                  <input className={inputClass} value={appUrl} onChange={(e) => { setAppUrl(e.target.value); setAppStatus('unknown'); setCurrentVersionLocked(false); setAppDetectedFrom(''); setAppTriedEndpoints([]); }} placeholder="https://app.example.com" />
                </div>
                {appUrl && (
                  <Select label="Application auth" value={appAuthType} onChange={(v) => setAppAuthType((v as 'none' | 'token' | 'openvpn') || 'token')} options={authOptions} />
                )}
                {appUrl && appAuthType === 'token' && (
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1.5">Application token (optional)</label>
                    <input className={inputClass} value={appToken} onChange={(e) => setAppToken(e.target.value)} />
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
                <Button variant="secondary" onClick={validateSetup}>Validate and detect versions</Button>
                {testMessage && <p className="text-sm text-text-secondary">{testMessage}</p>}
                {appDetectedFrom && <p className="text-xs text-text-secondary">App version source endpoint: {appDetectedFrom}</p>}
                {!appDetectedFrom && appTriedEndpoints.length > 0 && <p className="text-xs text-text-secondary">Tried: {appTriedEndpoints.join(', ')}</p>}
                {appUrl && !currentVersion && !detectTried && <p className="text-xs text-text-secondary">Tip: click &quot;Validate and detect versions&quot; to auto-read deployed app version first.</p>}
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
                    <input type="number" className={inputClass} value={Math.max(1, Math.round(intervalSec / 60))} min={1} onChange={(e) => setIntervalSec(Math.max(60, Number(e.target.value || 1) * 60))} />
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
              <Select label="Provider" value={editProvider} onChange={(v) => setEditProvider((v as 'github' | 'gitlab' | 'docker' | 'apt') || 'github')} options={providerOptions} />
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1.5">Target</label>
                <input className={inputClass} value={editTarget} onChange={(e) => setEditTarget(e.target.value)} placeholder={editProvider === 'docker' ? 'library/nginx' : editProvider === 'apt' ? 'openssl' : editProvider === 'gitlab' ? 'group/project' : 'owner/repo'} />
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
                <Select label="Application auth" value={editAppAuthType} onChange={(v) => setEditAppAuthType((v as 'none' | 'token' | 'openvpn') || 'token')} options={authOptions} />
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
                <input type="number" className={inputClass} value={Math.max(1, Math.round(editIntervalSec / 60))} min={1} onChange={(e) => setEditIntervalSec(Math.max(60, Number(e.target.value || 1) * 60))} />
              </div>
            </div>
          </Modal>

          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-text-primary">Version Checks</h2>
              <p className="text-text-secondary text-sm mt-1">
                {summary?.stats.total ?? 0} tracked {(summary?.stats.total ?? 0) === 1 ? 'item' : 'items'}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="secondary" onClick={() => load()}>Refresh</Button>
              <Button size="lg" onClick={() => { resetCreateForm(); setCreateOpen(true); }}>
                <span className="flex items-center gap-2"><Plus className="w-4 h-4" /> Create version check</span>
              </Button>
            </div>
          </div>

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
              <TableHead>
                <TableRow hover={false}>
                  <TableHeader>Name</TableHeader>
                  <TableHeader>Type</TableHeader>
                  <TableHeader>Target</TableHeader>
                  <TableHeader>Current</TableHeader>
                  <TableHeader>Latest</TableHeader>
                  <TableHeader>Status</TableHeader>
                  <TableHeader>Last check</TableHeader>
                  <TableHeader>Interval</TableHeader>
                  <TableHeader>Action</TableHeader>
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
                        <TableCell>
                          <button className="text-accent hover:underline flex items-center gap-1" onClick={() => toggleDetails(item.id)}>
                            {expandedId === item.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                            {item.name}
                          </button>
                        </TableCell>
                        <TableCell>{item.type}</TableCell>
                        <TableCell className="max-w-[280px] break-all">{item.target}</TableCell>
                        <TableCell>
                          {item.currentVersion ? (
                            <span className="font-mono text-sm">{item.currentVersion}</span>
                          ) : '—'}
                        </TableCell>
                        <TableCell className="max-w-[320px]">
                          {(() => {
                            const { from, to } = extractVersionsFromMessage(item.latestMessage);
                            if (from && to && from !== to) {
                              return <VersionDiff from={from} to={to} />;
                            }
                            return <span className="text-xs text-text-secondary break-all">{item.latestMessage}</span>;
                          })()}
                        </TableCell>
                        <TableCell>
                          <div>
                            <Badge variant={levelBadgeVariant(item.level)}>
                              {item.level === 'green' ? 'GREEN' : item.level === 'yellow' ? 'YELLOW' : 'RED'}
                            </Badge>
                            <p className="text-xs text-text-secondary mt-1">
                              {item.level === 'green' ? 'Okay' : item.level === 'yellow' ? 'Update' : 'Critical'}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>{item.checkedAt ? new Date(item.checkedAt).toLocaleString() : 'Never'}</TableCell>
                        <TableCell>{secondsToHuman(item.intervalSec)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button variant="secondary" size="sm" loading={runningId === item.id} onClick={() => runNow(item.id)}>
                              <span className="flex items-center gap-1"><Play className="w-3 h-3" /> Run</span>
                            </Button>
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
                          <td colSpan={9} className="px-4 py-3 bg-surface-elevated">
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
            <div className="flex items-center justify-between p-4 border-t border-border">
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage <= 1}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-sm text-text-secondary">Page {safePage} of {pages}</span>
                <Button variant="ghost" size="sm" onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={safePage >= pages}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
              <div className="flex items-center gap-2">
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

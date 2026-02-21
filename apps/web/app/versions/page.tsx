'use client';

import { ActionIcon, Alert, Badge, Button, Card, Collapse, Group, NumberInput, Pagination, Progress, Select, Table, Text, TextInput, ThemeIcon, Tooltip } from '@mantine/core';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { IconAlertCircle, IconCheck, IconInfoCircle, IconPencil, IconTrash, IconX } from '@tabler/icons-react';
import { useRouter } from 'next/navigation';
import { AppFrame } from '../../components/app-frame';
import { LoadingState } from '../../components/ui/loading-state';
import { AppModal } from '../../components/ui/modal-framework';
import { getToken, getUser } from '../../components/auth';
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

function stripLeadingV(version: string) {
  return version.replace(/^v(?=\d)/i, '');
}

function secondsToHuman(sec: number) {
  if (sec % 86400 === 0) return `${sec / 86400}d`;
  if (sec % 3600 === 0) return `${sec / 3600}h`;
  if (sec % 60 === 0) return `${sec / 60}m`;
  return `${sec}s`;
}

export default function VersionsPage() {
  const router = useRouter();
  const token = useMemo(() => (typeof window !== 'undefined' ? getToken() : ''), []);
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
    if (!user || !token) router.push('/login');
  }, [router, token]);

  async function load() {
    setLoading(true);
    try {
      const [data, monitors] = await Promise.all([
        api<Summary>('/v1/monitors/version-summary', token),
        api<MonitorDetails[]>('/v1/monitors', token),
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
        const res = await api<{ ok: boolean; latestVersion?: string | null; message: string }>('/v1/monitors/version-test', token, {
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
  }, [provider, target, tokenInput, gitlabHost, token]);

  async function runNow(monitorId: string) {
    setRunningId(monitorId);
    try {
      await api('/v1/monitors/run', token, { method: 'POST', body: JSON.stringify({ monitorId }) });
      await load();
      if (expandedId === monitorId) {
        const runs = await api<MonitorRun[]>(`/v1/monitors/${monitorId}/runs`, token);
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
      const runs = await api<MonitorRun[]>(`/v1/monitors/${monitorId}/runs`, token);
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
    setEditAppAuthType((String(cfg.appAuthType ?? 'token') as any) || 'token');
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
      await api(`/v1/monitors/${editId}`, token, {
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
    await api(`/v1/monitors/${id}`, token, { method: 'DELETE' });
    await load();
  }

  async function testConnection() {
    try {
      const result = await api<{ ok: boolean; message: string; latestVersion?: string | null; unauthorized?: boolean }>('/v1/monitors/version-test', token, {
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
    const result = await api<{ currentVersion: string | null; message?: string; detectedFrom?: string | null; tried?: string[] }>('/v1/monitors/version-discover', token, {
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
      const result = await api<{ currentVersion: string | null; message?: string; detectedFrom?: string | null; tried?: string[] }>('/v1/monitors/version-discover', token, {
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

    await api('/v1/monitors', token, {
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

  return (
    <AppFrame title="Version Center" subtitle="Track outdated releases/images and trigger checks on demand.">
      {loading ? <LoadingState label="Loading version checks..." /> : <>
      <AppModal opened={createOpen} onClose={() => { setCreateOpen(false); resetCreateForm(); }} title="Create version check" size="lg">
        <Progress value={modalProgress} color="teal" mb="md" />
        {missing.length > 0 ? (
          <Alert color="red" icon={<IconAlertCircle size={16} />} mb="md" title="Missing information">
            {missing.map((m) => <Text key={m} size="sm">• {m}</Text>)}
          </Alert>
        ) : null}
        {createStep === 0 ? (
          <>
            <Text fw={600} mb="sm">Step 1/4 · Source</Text>
            <TextInput label="Name" value={name} onChange={(e) => setName(e.currentTarget.value)} rightSection={<Tooltip label="Example: API backend"><ActionIcon variant="subtle" size="sm"><IconInfoCircle size={16} /></ActionIcon></Tooltip>} />
            <Select mt="sm" label="Provider" value={provider} onChange={(v) => {
              const p = (v as 'github' | 'gitlab' | 'docker' | 'apt') || 'github';
              setProvider(p);
              setType(p === 'docker' ? 'DOCKER_IMAGE' : 'GIT_RELEASE');
              setSourceStatus('unknown');
            }} data={[{ value: 'github', label: 'GitHub releases' }, { value: 'gitlab', label: 'GitLab releases' }, { value: 'docker', label: 'Docker image tags' }, { value: 'apt', label: 'APT package versions' }]} />
            <TextInput mt="sm" label="Target" value={target} onChange={(e) => setTarget(e.currentTarget.value)} placeholder={provider === 'docker' ? 'library/nginx' : provider === 'apt' ? 'openssl' : provider === 'gitlab' ? 'group/project' : 'owner/repo'} rightSection={<Tooltip label="Examples: GitHub=No749ah/PulseDock · GitLab=group/project (no gitlab: needed) · Docker=library/nginx · APT=openssl"><ActionIcon variant="subtle" size="sm"><IconInfoCircle size={16} /></ActionIcon></Tooltip>} />
            {((provider === 'github' || provider === 'gitlab') || showTokenField) ? <TextInput mt="sm" label="Repo access token (optional/private repo)" value={tokenInput} onChange={(e) => setTokenInput(e.currentTarget.value)} rightSection={<Tooltip label="GitHub/GitLab token. Put it here in Step 1 if your repo is private or rate-limited."><ActionIcon variant="subtle" size="sm"><IconInfoCircle size={16} /></ActionIcon></Tooltip>} /> : null}
            {target ? <Text size="sm" c="dimmed" mt="xs">{latestPreviewLoading ? 'Detecting latest version…' : latestPreview || 'Latest not detected yet'}</Text> : null}
          </>
        ) : null}

        {createStep === 1 ? (
          <>
            <Text fw={600} mb="sm">Step 2/4 · Connection</Text>
            {provider === 'gitlab' ? <TextInput mt="sm" label="GitLab host" value={gitlabHost} onChange={(e) => setGitlabHost(e.currentTarget.value)} rightSection={<Tooltip label="Example: gitlab.com"><ActionIcon variant="subtle" size="sm"><IconInfoCircle size={16} /></ActionIcon></Tooltip>} /> : null}
            <TextInput mt="sm" label="Application URL (deployed app)" value={appUrl} onChange={(e) => { setAppUrl(e.currentTarget.value); setAppStatus('unknown'); setCurrentVersionLocked(false); setAppDetectedFrom(''); setAppTriedEndpoints([]); }} placeholder="https://app.example.com" rightSection={<Tooltip label="Used to auto-detect deployed version from common endpoints"><ActionIcon variant="subtle" size="sm"><IconInfoCircle size={16} /></ActionIcon></Tooltip>} />
            {appUrl ? <Select mt="sm" label="Application auth" value={appAuthType} onChange={(v) => setAppAuthType((v as any) || 'token')} data={[{ value: 'token', label: 'Token headers' }, { value: 'openvpn', label: 'OpenVPN (Basic / OpenVPN headers)' }, { value: 'none', label: 'No auth' }]} /> : null}
            {appUrl && appAuthType === 'token' ? <TextInput mt="sm" label="Application token (optional, required for protected app endpoints)" value={appToken} onChange={(e) => setAppToken(e.currentTarget.value)} rightSection={<Tooltip label="Will be sent as Authorization Bearer, X-API-Key and X-Access-Token."><ActionIcon variant="subtle" size="sm"><IconInfoCircle size={16} /></ActionIcon></Tooltip>} /> : null}
            {appUrl && appAuthType === 'openvpn' ? <TextInput mt="sm" label="OpenVPN username" value={openvpnUsername} onChange={(e) => setOpenvpnUsername(e.currentTarget.value)} /> : null}
            {appUrl && appAuthType === 'openvpn' ? <TextInput mt="sm" label="OpenVPN password" value={openvpnPassword} onChange={(e) => setOpenvpnPassword(e.currentTarget.value)} /> : null}
            {appUrl ? <TextInput mt="sm" label="Custom app version endpoint (optional)" value={appVersionEndpoint} onChange={(e) => setAppVersionEndpoint(e.currentTarget.value)} placeholder="/api/system/version" rightSection={<Tooltip label="If auto-detect fails, set your exact endpoint here (e.g. /api/system/version)"><ActionIcon variant="subtle" size="sm"><IconInfoCircle size={16} /></ActionIcon></Tooltip>} /> : null}
            <Group mt="sm">
              <Button variant="light" onClick={validateSetup}>Validate and detect versions</Button>
            </Group>
            {testMessage ? <Text size="sm" c="dimmed" mt="sm">{testMessage}</Text> : null}
            {appDetectedFrom ? <Text size="xs" c="dimmed" mt="xs">App version source endpoint: {appDetectedFrom}</Text> : null}
            {!appDetectedFrom && appTriedEndpoints.length > 0 ? <Text size="xs" c="dimmed" mt="xs">Tried: {appTriedEndpoints.join(', ')}</Text> : null}
            {appUrl && !currentVersion && !detectTried ? <Text size="xs" c="dimmed" mt="xs">Tip: click “Validate and detect versions” to auto-read deployed app version first.</Text> : null}
          </>
        ) : null}

        {createStep === 2 ? (
          <>
            <Text fw={600} mb="sm">Step 3/4 · Version strategy</Text>
            <Group mb="sm" gap="md">
              <Group gap="xs">
                <ThemeIcon size="sm" color={sourceStatus === 'ok' ? 'green' : sourceStatus === 'fail' ? 'red' : 'gray'} variant="light">
                  {sourceStatus === 'ok' ? <IconCheck size={14} /> : sourceStatus === 'fail' ? <IconX size={14} /> : <IconInfoCircle size={14} />}
                </ThemeIcon>
                <Text size="sm">Source version ({provider})</Text>
              </Group>
              <Group gap="xs">
                <ThemeIcon size="sm" color={appStatus === 'ok' ? 'green' : appStatus === 'fail' ? 'red' : 'gray'} variant="light">
                  {appStatus === 'ok' ? <IconCheck size={14} /> : appStatus === 'fail' ? <IconX size={14} /> : <IconInfoCircle size={14} />}
                </ThemeIcon>
                <Text size="sm">Application version</Text>
              </Group>
            </Group>
            <TextInput label="Current version/tag" value={currentVersion} onChange={(e) => setCurrentVersion(e.currentTarget.value)} placeholder="v1.2.3" disabled={currentVersionLocked} rightSection={<Tooltip label="Example: v0.2.0"><ActionIcon variant="subtle" size="sm"><IconInfoCircle size={16} /></ActionIcon></Tooltip>} />
            <Button mt="sm" variant="subtle" onClick={() => setAdvanced((v) => !v)}>{advanced ? 'Hide advanced' : 'Show advanced'}</Button>
            <Collapse in={advanced}>
              <NumberInput mt="sm" label="Interval (minutes)" value={Math.max(1, Math.round(intervalSec / 60))} min={1} onChange={(v) => setIntervalSec(Math.max(60, Number(v || 1) * 60))} />
            </Collapse>
          </>
        ) : null}

        {createStep === 3 ? (
          <>
            <Text fw={600} mb="sm">Step 4/4 · Review</Text>
            <Text size="sm">Name: <b>{name}</b></Text>
            <Text size="sm">Provider: <b>{provider}</b></Text>
            <Text size="sm">Target: <b>{target}</b></Text>
            <Text size="sm">Current: <b>{currentVersion || 'not set'}</b></Text>
            <Text size="sm">App URL: <b>{appUrl || 'not set'}</b></Text>
            <Text size="sm">Interval: <b>{secondsToHuman(intervalSec)}</b></Text>
          </>
        ) : null}

        <Group justify="space-between" mt="md">
          <Button variant="default" onClick={() => setCreateStep((s) => Math.max(0, s - 1))} disabled={createStep === 0}>Back</Button>
          {createStep < 3 ? <Button onClick={() => setCreateStep((s) => Math.min(3, s + 1))} disabled={missing.length > 0}>Next</Button> : <Button onClick={createVersionCheck} disabled={missing.length > 0}>Create check</Button>}
        </Group>
      </AppModal>

      <AppModal opened={editOpen} onClose={() => setEditOpen(false)} title="Edit version check" size="lg">
        <TextInput label="Name" value={editName} onChange={(e) => setEditName(e.currentTarget.value)} />
        <Select mt="sm" label="Provider" value={editProvider} onChange={(v) => setEditProvider((v as any) || 'github')} data={[{ value: 'github', label: 'GitHub releases' }, { value: 'gitlab', label: 'GitLab releases' }, { value: 'docker', label: 'Docker image tags' }, { value: 'apt', label: 'APT package versions' }]} />
        <TextInput mt="sm" label="Target" value={editTarget} onChange={(e) => setEditTarget(e.currentTarget.value)} placeholder={editProvider === 'docker' ? 'library/nginx' : editProvider === 'apt' ? 'openssl' : editProvider === 'gitlab' ? 'group/project' : 'owner/repo'} />
        {(editProvider === 'github' || editProvider === 'gitlab') ? (
          <>
            <TextInput mt="sm" label="Repo token (stored)" value={editHasRepoToken ? '••••••••••' : 'not set'} disabled />
            <TextInput mt="sm" label="Overwrite repo token (optional)" value={editToken} onChange={(e) => setEditToken(e.currentTarget.value)} placeholder="Enter only if you want to replace existing token" />
          </>
        ) : null}
        {editProvider === 'gitlab' ? <TextInput mt="sm" label="GitLab host" value={editGitlabHost} onChange={(e) => setEditGitlabHost(e.currentTarget.value)} placeholder="gitlab.com" /> : null}
        <TextInput mt="sm" label="Application URL (optional)" value={editAppUrl} onChange={(e) => setEditAppUrl(e.currentTarget.value)} placeholder="https://app.example.com" />
        {editAppUrl ? <Select mt="sm" label="Application auth" value={editAppAuthType} onChange={(v) => setEditAppAuthType((v as any) || 'token')} data={[{ value: 'token', label: 'Token headers' }, { value: 'openvpn', label: 'OpenVPN (Basic / OpenVPN headers)' }, { value: 'none', label: 'No auth' }]} /> : null}
        {editAppUrl && editAppAuthType === 'token' ? (
          <>
            <TextInput mt="sm" label="Application token (stored)" value={editHasAppToken ? '••••••••••' : 'not set'} disabled />
            <TextInput mt="sm" label="Overwrite application token (optional)" value={editAppToken} onChange={(e) => setEditAppToken(e.currentTarget.value)} placeholder="Enter only if you want to replace existing token" />
          </>
        ) : null}
        {editAppUrl && editAppAuthType === 'openvpn' ? (
          <>
            <TextInput mt="sm" label="OpenVPN username" value={editOpenvpnUsername} onChange={(e) => setEditOpenvpnUsername(e.currentTarget.value)} />
            <TextInput mt="sm" label="OpenVPN password (stored)" value={editHasOpenvpnPassword ? '••••••••••' : 'not set'} disabled />
            <TextInput mt="sm" label="Overwrite OpenVPN password (optional)" value={editOpenvpnPassword} onChange={(e) => setEditOpenvpnPassword(e.currentTarget.value)} />
          </>
        ) : null}
        {editAppUrl ? <TextInput mt="sm" label="Custom app version endpoint (optional)" value={editAppVersionEndpoint} onChange={(e) => setEditAppVersionEndpoint(e.currentTarget.value)} placeholder="/api/system/version" /> : null}
        <TextInput mt="sm" label="Current version" value={editCurrentVersion} onChange={(e) => setEditCurrentVersion(e.currentTarget.value)} />
        <NumberInput mt="sm" label="Interval (minutes)" value={Math.max(1, Math.round(editIntervalSec / 60))} min={1} onChange={(v) => setEditIntervalSec(Math.max(60, Number(v || 1) * 60))} />
        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={() => setEditOpen(false)}>Cancel</Button>
          <Button color="teal" loading={editSaving} onClick={saveEdit}>Save</Button>
        </Group>
      </AppModal>

      <Card withBorder mb="md">
        <Group justify="space-between">
          <Text fw={700}>Version checks</Text>
          <Button onClick={() => { resetCreateForm(); setCreateOpen(true); }}>Create version check</Button>
        </Group>
      </Card>

      <Card withBorder mb="md">
        <Group>
          <Text fw={700}>Tracked: {summary?.stats.total ?? 0}</Text>
          <Badge color="green">Up-to-date: {summary?.stats.green ?? 0}</Badge>
          <Badge color="yellow">Updates: {summary?.stats.yellow ?? 0}</Badge>
          <Badge color="red">Critical: {summary?.stats.red ?? 0}</Badge>
          <Button variant="light" onClick={() => load()}>Refresh</Button>
        </Group>
      </Card>

      <Card withBorder>
        <Table withTableBorder withColumnBorders>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              <Table.Th>Type</Table.Th>
              <Table.Th>Target</Table.Th>
              <Table.Th>Current</Table.Th>
              <Table.Th>Latest</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Last check</Table.Th>
              <Table.Th>Interval</Table.Th>
              <Table.Th>Action</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
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
                  <Table.Tr>
                    <Table.Td>
                      <Button variant="subtle" size="compact-sm" onClick={() => toggleDetails(item.id)}>
                        {item.name}
                      </Button>
                    </Table.Td>
                    <Table.Td>{item.type}</Table.Td>
                    <Table.Td>{item.target}</Table.Td>
                    <Table.Td>{item.currentVersion || '—'}</Table.Td>
                    <Table.Td><Text size="sm">{item.latestMessage}</Text></Table.Td>
                    <Table.Td>
                      <Badge color={item.level === 'green' ? 'green' : item.level === 'yellow' ? 'yellow' : 'red'}>
                        {item.level === 'green' ? 'GREEN' : item.level === 'yellow' ? 'YELLOW' : 'RED'}
                      </Badge>
                      <Text size="xs" c="dimmed" mt={4}>
                        {item.level === 'green' ? 'Okay' : item.level === 'yellow' ? 'Update' : 'Critical'}
                      </Text>
                    </Table.Td>
                    <Table.Td>{item.checkedAt ? new Date(item.checkedAt).toLocaleString() : 'Never'}</Table.Td>
                    <Table.Td>{secondsToHuman(item.intervalSec)}</Table.Td>
                    <Table.Td>
                      <Group gap="xs" wrap="nowrap">
                        <Button size="xs" variant="light" loading={runningId === item.id} onClick={() => runNow(item.id)}>Run now</Button>
                        <ActionIcon variant="light" color="blue" onClick={() => openEdit(item)} aria-label="Edit">
                          <IconPencil size={14} />
                        </ActionIcon>
                        <ActionIcon variant="light" color="red" onClick={() => removeCheck(item.id)} aria-label="Delete">
                          <IconTrash size={14} />
                        </ActionIcon>
                      </Group>
                    </Table.Td>
                  </Table.Tr>

                  {expandedId === item.id ? (
                    <Table.Tr>
                      <Table.Td colSpan={9}>
                        {runsLoadingId === item.id ? (
                          <Text size="sm" c="dimmed">Loading runs…</Text>
                        ) : (
                          <>
                            <Group mb="xs" gap="md">
                              <Text size="sm" fw={600}>Last runs: {stats.total}</Text>
                              <Badge color="green">Green {stats.green}</Badge>
                              <Badge color="yellow">Yellow {stats.yellow}</Badge>
                              <Badge color="red">Red {stats.red}</Badge>
                            </Group>
                            {runs.length === 0 ? <Text size="sm" c="dimmed">No runs yet.</Text> : (
                              <Table withTableBorder>
                                <Table.Thead>
                                  <Table.Tr>
                                    <Table.Th>Time</Table.Th>
                                    <Table.Th>Level</Table.Th>
                                    <Table.Th>Status</Table.Th>
                                    <Table.Th>Latency</Table.Th>
                                    <Table.Th>Message</Table.Th>
                                  </Table.Tr>
                                </Table.Thead>
                                <Table.Tbody>
                                  {runs.slice(0, 12).map((r) => (
                                    <Table.Tr key={r.id}>
                                      <Table.Td>{new Date(r.checkedAt).toLocaleString()}</Table.Td>
                                      <Table.Td><Badge color={r.level === 'green' ? 'green' : r.level === 'yellow' ? 'yellow' : 'red'}>{r.level.toUpperCase()}</Badge></Table.Td>
                                      <Table.Td>{r.statusCode}</Table.Td>
                                      <Table.Td>{r.latencyMs ?? '—'} ms</Table.Td>
                                      <Table.Td>{r.message}</Table.Td>
                                    </Table.Tr>
                                  ))}
                                </Table.Tbody>
                              </Table>
                            )}
                          </>
                        )}
                      </Table.Td>
                    </Table.Tr>
                  ) : null}
                </Fragment>
              );
            })}
          </Table.Tbody>
        </Table>
        <Group justify="space-between" mt="md" wrap="wrap" gap="xs">
          <Pagination value={safePage} onChange={setPage} total={pages} />
          <Group gap="xs" wrap="nowrap">
            <Text size="sm" c="dimmed">Rows per page</Text>
            <Select w={90} value={pageSize} onChange={(v) => { setPageSize(v || '10'); setPage(1); }} data={['10', '25', '50']} />
          </Group>
        </Group>
      </Card>
      </>}
    </AppFrame>
  );
}

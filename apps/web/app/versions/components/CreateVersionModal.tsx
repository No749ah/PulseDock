'use client';

import { type CSSProperties, useEffect, useMemo, useState } from 'react';
import { Check, X, AlertCircle, Play, GitBranch, Search, Copy, ExternalLink } from 'lucide-react';
import { Button } from '../../components/Button';
import { Modal } from '../../components/Modal';
import { Select } from '../../components/Select';
import { getUser } from '../../../components/auth';
import { api } from '../../../lib/api';
import { useDebounce } from '../../../lib/useDebounce';
import { brand } from '../../../lib/brand';
import type { ToolEntry, ToolVariant, ProviderType } from './types';
import { inputClass, stripLeadingV, StatusIcon, providerOptions, authOptions, secondsToHuman } from './utils';

interface CreateVersionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => Promise<void>;
  toolRegistry: { tools: ToolEntry[]; categories: string[] } | null;
}

export function CreateVersionModal({ isOpen, onClose, onCreated, toolRegistry }: CreateVersionModalProps) {
  const [createStep, setCreateStep] = useState(-1); // -1 = tool picker, 0-3 = manual steps
  // Tool registry search
  const [toolSearch, setToolSearch] = useState('');
  const toolSearchDebounced = useDebounce(toolSearch, 250);
  const [toolCategory, setToolCategory] = useState('');
  const [toolVisibleCount, setToolVisibleCount] = useState(50);
  const [selectedTool, setSelectedTool] = useState<ToolEntry | null>(null);
  // Form state
  const [name, setName] = useState('');
  const [type, setType] = useState<'GIT_RELEASE' | 'DOCKER_IMAGE'>('GIT_RELEASE');
  const [provider, setProvider] = useState<ProviderType>('github');
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

  const isAgentTool = selectedTool?.versionSource.type === 'pulsedock-agent';

  const selectedApiKey = userApiKeys.find((k) => k.id === selectedApiKeyId);
  const agentApiKeyDisplay = selectedApiKey ? `${selectedApiKey.prefix}...` : 'YOUR_API_KEY';
  const agentPulsedockUrl = typeof window !== 'undefined'
    ? `${window.location.protocol}//${window.location.host}`
    : 'https://your-pulsedock.example.com';

  // Reset tool pagination when search/filter changes
  useEffect(() => {
    setToolVisibleCount(50);
  }, [toolSearchDebounced, toolCategory, isOpen, createStep]);

  // Latest version preview
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

  function applyVariantOverride(tool: ToolEntry, variant: ToolVariant) {
    const vs = variant.versionSource ?? tool.versionSource;
    const ls = variant.latestSource ?? tool.latestSource;
    const requiresUrl = variant.requiresInstanceUrl ?? tool.requiresInstanceUrl;
    const authRequired = variant.authRequired ?? vs.authRequired ?? tool.versionSource.authRequired ?? false;
    setAppAuthType(authRequired ? 'token' : 'none');
    if (requiresUrl && vs.urlTemplate) {
      setAppVersionEndpoint(vs.urlTemplate.replace('{{instanceUrl}}', '').replace(/^\//, ''));
    } else if (!requiresUrl) {
      setAppVersionEndpoint('');
      setAppUrl('');
    }
    if (ls.target) setTarget(ls.target);
  }

  function applyToolToForm(tool: ToolEntry) {
    setSelectedTool(tool);
    setSelectedVariantId('');
    setToolVariants([]);
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
    const ls = tool.latestSource;
    const providerMap: Record<string, ProviderType> = {
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
    if (tool.requiresInstanceUrl) {
      setAppUrl('');
      setAppAuthType(tool.versionSource.authRequired ? 'token' : 'none');
      if (tool.versionSource.urlTemplate) {
        setAppVersionEndpoint(tool.versionSource.urlTemplate.replace('{{instanceUrl}}', '').replace(/^\//, ''));
      }
    } else {
      setAppUrl('');
      setAppAuthType('none');
      setAppVersionEndpoint('');
    }
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
    const maxAttempts = 12;
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      try {
        const runs = await api<{ items: { id: string }[] }>(`/v1/monitors/${monitorId}/runs?limit=1`);
        if (runs?.items?.length > 0) {
          setAgentReported(true);
          setAgentPolling(false);
          setCreateStep(3);
          return;
        }
      } catch { /* ignore */ }
    }
    setAgentPolling(false);
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
        provider, target,
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
      if (result.authFailed && appUrl && appAuthType === 'none') {
        setShowAuthHint(true);
      }
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
    } catch { /* silently ignore */ }
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
          provider, target,
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
        name, type, target, intervalSec,
        timeoutMs: 5000,
        config: {
          currentVersion: stripLeadingV(resolvedCurrentVersion),
          currentTag: stripLeadingV(resolvedCurrentVersion),
          gitlabHost, provider,
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
    handleClose();
    await onCreated();
  }

  function handleClose() {
    resetCreateForm();
    onClose();
  }

  const modalProgress = createStep < 0 ? 0 : ((createStep + 1) / 4) * 100;

  const normalizedToolQuery = useMemo(
    () => toolSearchDebounced.toLowerCase().trim().replace(/\s+/g, ' '),
    [toolSearchDebounced],
  );

  const filteredTools = useMemo(() => {
    if (!toolRegistry) return [] as ToolEntry[];
    const all = toolRegistry.tools.filter((t) => {
      const cat = !toolCategory || t.category === toolCategory;
      if (!normalizedToolQuery) return cat;
      if (!cat) return false;
      const tName = t.name.toLowerCase();
      const desc = t.description.toLowerCase();
      const id = t.id.toLowerCase();
      return (
        tName === normalizedToolQuery ||
        tName.startsWith(normalizedToolQuery) ||
        tName.includes(normalizedToolQuery) ||
        id === normalizedToolQuery ||
        id.startsWith(normalizedToolQuery) ||
        t.tags.some((tag) => tag.toLowerCase() === normalizedToolQuery || tag.toLowerCase().includes(normalizedToolQuery)) ||
        desc.includes(normalizedToolQuery)
      );
    });
    if (!normalizedToolQuery) return all;
    const score = (t: ToolEntry) => {
      const tName = t.name.toLowerCase();
      const id = t.id.toLowerCase();
      if (tName === normalizedToolQuery) return 10;
      if (tName.startsWith(normalizedToolQuery)) return 20;
      if (tName.includes(normalizedToolQuery)) return 30;
      if (id === normalizedToolQuery || id.startsWith(normalizedToolQuery)) return 40;
      if (t.tags.some((tag) => tag.toLowerCase() === normalizedToolQuery)) return 50;
      if (t.tags.some((tag) => tag.toLowerCase().includes(normalizedToolQuery))) return 60;
      return 70;
    };
    return all.sort((a, b) => {
      const sa = score(a);
      const sb = score(b);
      if (sa !== sb) return sa - sb;
      if (a.verified !== b.verified) return a.verified ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [toolRegistry, toolCategory, normalizedToolQuery]);

  const visibleFilteredTools = useMemo(
    () => filteredTools.slice(0, toolVisibleCount),
    [filteredTools, toolVisibleCount],
  );

  const closeMatchTools = useMemo(() => {
    if (!toolRegistry || filteredTools.length > 0 || !normalizedToolQuery) return [] as ToolEntry[];
    return toolRegistry.tools
      .filter((t) => {
        const tName = t.name.toLowerCase();
        const id = t.id.toLowerCase();
        return tName.includes(normalizedToolQuery) || id.includes(normalizedToolQuery) || t.tags.some((tag) => tag.toLowerCase().includes(normalizedToolQuery));
      })
      .slice(0, 4);
  }, [toolRegistry, filteredTools.length, normalizedToolQuery]);

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

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
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
                onChange={(e) => { setToolSearch(e.target.value); setToolVisibleCount(50); }}
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
            ) : filteredTools.length === 0 ? (
              <div className="py-8 text-center space-y-3">
                <p className="text-sm text-text-secondary">
                  No tools found for &ldquo;{toolSearch}&rdquo;{toolCategory ? ` in ${toolCategory}` : ''}.
                </p>
                {closeMatchTools.length > 0 && (
                  <div>
                    <p className="text-xs text-text-secondary mb-2">Did you mean:</p>
                    <div className="flex flex-wrap gap-2 justify-center">
                      {closeMatchTools.map((t) => (
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
                <p className="text-xs text-text-secondary mb-2">Showing {visibleFilteredTools.length} of {filteredTools.length} tools</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {visibleFilteredTools.map((tool) => (
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
                {visibleFilteredTools.length < filteredTools.length && (
                  <p className="text-xs text-text-secondary text-center mt-3">Scroll to load more…</p>
                )}
              </>
            )}
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
# ${brand.name} Agent — one-shot shell check for ${selectedTool?.name ?? 'your tool'}
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
                  <p className="text-xs text-text-secondary">This tool requires the {brand.name} Agent running locally</p>
                </div>
                <a href="/account#api-keys" target="_blank" rel="noopener" className="text-xs text-accent hover:underline flex items-center gap-1 shrink-0">
                  Get API key <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <p className="text-sm text-text-secondary mb-3">
                <strong className="text-text-primary">{selectedTool?.name}</strong> doesn&apos;t expose an external API.
                The {brand.name} Agent runs on your server, checks the local version, and reports it back via API key.
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
              <p className="text-xs text-text-secondary mt-2">
                Replace <code className="bg-background px-1 rounded">https://your-pulsedock.example.com</code> and <code className="bg-background px-1 rounded">pdck_your_api_key</code> with your values.{' '}
                <a href="/account#api-keys" target="_blank" rel="noopener" className="text-accent hover:underline">Create an API key →</a>
              </p>
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
          {/* Platform variant selector */}
          {toolVariants.length > 1 && (
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">Platform / Edition</label>
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
            const p = (v as ProviderType) || 'github';
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
  );
}

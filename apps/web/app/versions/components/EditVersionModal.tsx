'use client';

import { useState } from 'react';
import { Button } from '../../components/Button';
import { Modal } from '../../components/Modal';
import { Select } from '../../components/Select';
import { api } from '../../../lib/api';
import type { VersionItem, MonitorDetails, ProviderType } from './types';
import { inputClass, stripLeadingV, providerOptions, authOptions } from './utils';

interface EditVersionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
  item: VersionItem | null;
  monitorDetails: Record<string, MonitorDetails>;
}

export function EditVersionModal({ isOpen, onClose, onSaved, item, monitorDetails }: EditVersionModalProps) {
  const details = item ? monitorDetails[item.id] : undefined;
  const cfg = (details?.config ?? {}) as Record<string, unknown>;
  const initialProvider = item
    ? (String(cfg.provider ?? (item.type === 'DOCKER_IMAGE' ? 'docker' : 'github')).toLowerCase() as ProviderType)
    : 'github';

  const [editName, setEditName] = useState('');
  const [editProvider, setEditProvider] = useState<ProviderType>('github');
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
  const [initialized, setInitialized] = useState<string | null>(null);

  // Populate form when item changes
  if (item && initialized !== item.id) {
    const d = monitorDetails[item.id];
    const c = (d?.config ?? {}) as Record<string, unknown>;
    const p = String(c.provider ?? (item.type === 'DOCKER_IMAGE' ? 'docker' : 'github')).toLowerCase() as ProviderType;
    setEditName(item.name);
    setEditProvider(p);
    setEditTarget(item.target);
    setEditCurrentVersion(String(c.currentVersion ?? item.currentVersion ?? ''));
    setEditIntervalSec(item.intervalSec || 86400);
    setEditIntervalInput(String(Math.round((item.intervalSec || 86400) / 60)));
    setEditHasRepoToken(Boolean(c.hasRepoToken));
    setEditToken('');
    setEditGitlabHost(String(c.gitlabHost ?? ''));
    setEditAppUrl(String(c.appUrl ?? ''));
    setEditAppAuthType((String(c.appAuthType ?? 'none') as 'none' | 'token' | 'openvpn') || 'none');
    setEditHasAppToken(Boolean(c.hasAppToken));
    setEditAppToken('');
    setEditOpenvpnUsername(String(c.openvpnUsername ?? ''));
    setEditHasOpenvpnPassword(Boolean(c.hasOpenvpnPassword));
    setEditOpenvpnPassword('');
    setEditAppVersionEndpoint(String(c.appVersionEndpoint ?? ''));
    setInitialized(item.id);
  }

  async function saveEdit() {
    if (!item) return;
    setEditSaving(true);
    try {
      await api(`/v1/monitors/${item.id}`, undefined, {
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
      onClose();
      await onSaved();
    } finally {
      setEditSaving(false);
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Edit version check"
      size="lg"
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={editSaving} onClick={saveEdit}>Save</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1.5">Name</label>
          <input className={inputClass} value={editName} onChange={(e) => setEditName(e.target.value)} />
        </div>
        <Select label="Provider" value={editProvider} onChange={(v) => setEditProvider((v as ProviderType) || 'github')} options={providerOptions} />
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
  );
}

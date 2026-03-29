'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { GitBranch, RefreshCw, CheckCircle, AlertTriangle, XCircle, HelpCircle, ExternalLink } from 'lucide-react';
import { AppFrame } from '../../../components/app-frame';
import { Card } from '../../components/Card';
import { getUser } from '../../../components/auth';
import { api } from '../../../lib/api';
import { useToast } from '../../../components/ui/toast';

type DriftKind = 'major' | 'minor' | 'patch' | 'up-to-date' | 'unknown';

type VersionDrift = {
  id: string;
  name: string;
  monitorId: string | null;
  currentVersion: string | null;
  latestVersion: string | null;
  status: string;
  lastCheckedAt: string | null;
  drift: {
    kind: DriftKind;
    majorBehind: number;
    minorBehind: number;
    patchBehind: number;
    driftScore: number;
  };
};

type DriftReport = {
  versions: VersionDrift[];
  summary: {
    total: number;
    upToDate: number;
    patchBehind: number;
    minorBehind: number;
    majorBehind: number;
    unknown: number;
    avgDriftScore: number;
  };
};

const KIND_CONFIG: Record<DriftKind, { label: string; bg: string; text: string; icon: React.ReactNode; border: string }> = {
  major: { label: 'Major', bg: 'bg-red-500/10', text: 'text-red-400', icon: <XCircle className="w-4 h-4" />, border: 'border-red-500/30' },
  minor: { label: 'Minor', bg: 'bg-orange-500/10', text: 'text-orange-400', icon: <AlertTriangle className="w-4 h-4" />, border: 'border-orange-500/30' },
  patch: { label: 'Patch', bg: 'bg-yellow-500/10', text: 'text-yellow-400', icon: <AlertTriangle className="w-4 h-4" />, border: 'border-yellow-500/30' },
  'up-to-date': { label: 'Up to date', bg: 'bg-emerald-500/10', text: 'text-emerald-400', icon: <CheckCircle className="w-4 h-4" />, border: 'border-emerald-500/30' },
  unknown: { label: 'Unknown', bg: 'bg-zinc-700/50', text: 'text-zinc-400', icon: <HelpCircle className="w-4 h-4" />, border: 'border-zinc-600' },
};

function DriftBadge({ kind }: { kind: DriftKind }) {
  const c = KIND_CONFIG[kind];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${c.bg} ${c.text}`}>
      {c.icon}
      {c.label}
    </span>
  );
}

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function DriftBar({ version, maxScore }: { version: VersionDrift; maxScore: number }) {
  const score = version.drift.driftScore;
  if (score === 0) return null;
  const pct = Math.max(4, Math.round((score / maxScore) * 100));
  const color = version.drift.kind === 'major' ? 'bg-red-500' : version.drift.kind === 'minor' ? 'bg-orange-400' : 'bg-yellow-400';
  return (
    <div className="w-full bg-zinc-800 rounded-full h-1.5 mt-1">
      <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function VersionDriftPage() {
  const router = useRouter();
  const { error: showError } = useToast();
  const [data, setData] = useState<DriftReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [kindFilter, setKindFilter] = useState<DriftKind | 'all'>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    const user = getUser();
    if (!user) { router.replace('/login'); return; }
    api<DriftReport>('/v1/monitors/version-drift', user.id)
      .then(setData)
      .catch(() => showError('Failed to load version drift report'))
      .finally(() => setLoading(false));
  }, []);

  const filtered = data?.versions.filter(v => {
    if (kindFilter !== 'all' && v.drift.kind !== kindFilter) return false;
    if (search && !v.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }) ?? [];

  const maxScore = Math.max(1, ...(data?.versions.map(v => v.drift.driftScore) ?? [0]));

  return (
    <AppFrame title="Version Drift Report">
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-orange-500/10 text-orange-400">
            <GitBranch className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Version Drift Report</h1>
            <p className="text-sm text-zinc-400">Which services are most out-of-date — semver gap analysis</p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24 text-zinc-500">
            <RefreshCw className="w-6 h-6 animate-spin mr-2" />
            Analyzing version drift...
          </div>
        ) : !data ? null : (
          <>
            {/* Summary */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                { label: 'Total', value: data.summary.total, color: 'text-white', kind: 'all' as const },
                { label: 'Up to date', value: data.summary.upToDate, color: 'text-emerald-400', kind: 'up-to-date' as DriftKind },
                { label: 'Patch', value: data.summary.patchBehind, color: 'text-yellow-400', kind: 'patch' as DriftKind },
                { label: 'Minor', value: data.summary.minorBehind, color: 'text-orange-400', kind: 'minor' as DriftKind },
                { label: 'Major', value: data.summary.majorBehind, color: 'text-red-400', kind: 'major' as DriftKind },
                { label: 'Unknown', value: data.summary.unknown, color: 'text-zinc-400', kind: 'unknown' as DriftKind },
              ].map(({ label, value, color, kind }) => (
                <button
                  key={label}
                  type="button"
                  className={`rounded-2xl border border-border bg-surface p-3 text-left cursor-pointer transition-all hover:ring-1 hover:ring-zinc-600 ${kindFilter === kind ? 'ring-1 ring-zinc-500' : ''}`}
                  onClick={() => setKindFilter(kindFilter === kind ? 'all' : kind)}
                >
                  <p className="text-xs text-zinc-400">{label}</p>
                  <p className={`text-xl font-bold mt-0.5 ${color}`}>{value}</p>
                </button>
              ))}
            </div>

            {/* Search */}
            <input
              className="w-full max-w-xs px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
              placeholder="Search versions..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />

            {/* Version Table */}
            <Card className="overflow-hidden">
              {filtered.length === 0 ? (
                <div className="text-center py-12 text-zinc-500">
                  <CheckCircle className="w-10 h-10 mx-auto mb-3 opacity-40" />
                  <p className="text-sm">No versions match the current filter.</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800">
                      <th className="text-left px-4 py-3 text-zinc-400 font-medium">Service</th>
                      <th className="text-left px-4 py-3 text-zinc-400 font-medium">Current</th>
                      <th className="text-left px-4 py-3 text-zinc-400 font-medium">Latest</th>
                      <th className="text-left px-4 py-3 text-zinc-400 font-medium">Gap</th>
                      <th className="text-left px-4 py-3 text-zinc-400 font-medium">Status</th>
                      <th className="text-right px-4 py-3 text-zinc-400 font-medium">Checked</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((v, i) => (
                      <tr
                        key={v.id}
                        className={`border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors ${i === 0 && v.drift.kind === 'major' ? 'bg-red-950/10' : ''}`}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="text-zinc-200 font-medium">{v.name}</span>
                            {v.monitorId && (
                              <button
                                onClick={() => router.push(`/monitors/${v.monitorId}`)}
                                className="text-zinc-500 hover:text-zinc-300 transition-colors"
                                title="View monitor"
                              >
                                <ExternalLink className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                          <DriftBar version={v} maxScore={maxScore} />
                        </td>
                        <td className="px-4 py-3 font-mono text-zinc-300">
                          {v.currentVersion ?? <span className="text-zinc-600">—</span>}
                        </td>
                        <td className="px-4 py-3 font-mono text-zinc-300">
                          {v.latestVersion ?? <span className="text-zinc-600">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          {v.drift.kind !== 'up-to-date' && v.drift.kind !== 'unknown' ? (
                            <div className="text-xs text-zinc-400">
                              {v.drift.majorBehind > 0 && <span className="text-red-400 font-medium">+{v.drift.majorBehind} major </span>}
                              {v.drift.minorBehind > 0 && <span className="text-orange-400 font-medium">+{v.drift.minorBehind} minor </span>}
                              {v.drift.patchBehind > 0 && <span className="text-yellow-400 font-medium">+{v.drift.patchBehind} patch</span>}
                            </div>
                          ) : (
                            <span className="text-zinc-600 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <DriftBadge kind={v.drift.kind} />
                        </td>
                        <td className="px-4 py-3 text-right text-xs text-zinc-500">
                          {formatRelativeTime(v.lastCheckedAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>

            {/* Drift Score Explanation */}
            <div className="text-xs text-zinc-500 flex items-center gap-2">
              <span className="text-zinc-400 font-medium">Drift score:</span>
              <span>major × 100 + minor × 10 + patch</span>
              {data.summary.avgDriftScore > 0 && (
                <span className="text-zinc-400">· Fleet avg: <span className="font-medium text-orange-400">{data.summary.avgDriftScore}</span></span>
              )}
            </div>
          </>
        )}
      </div>
    </AppFrame>
  );
}

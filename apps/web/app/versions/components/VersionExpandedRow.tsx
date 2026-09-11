'use client';

import { ExternalLink } from 'lucide-react';
import { Badge } from '../../components/Badge';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '../../components/Table';
import { VersionDiff, extractVersionsFromMessage } from '../../components/VersionDiff';
import { levelBadgeVariant } from './utils';
import type { VersionItem, MonitorDetails, MonitorRun } from './types';

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

interface VersionExpandedRowProps {
  item: VersionItem;
  runs: MonitorRun[];
  runsLoading: boolean;
  releaseNotes: ReleaseNotesData | undefined;
  releaseNotesLoading: boolean;
  security: SecurityData | undefined;
  securityLoading: boolean;
  monitorDetails: Record<string, MonitorDetails>;
  onFetchReleaseNotes: (monitorId: string) => void;
  onFetchSecurity: (monitorId: string) => void;
}

export function VersionExpandedRow({
  item, runs, runsLoading,
  releaseNotes, releaseNotesLoading,
  security, securityLoading,
  monitorDetails,
  onFetchReleaseNotes, onFetchSecurity,
}: VersionExpandedRowProps) {
  const stats = runs.reduce(
    (acc, r) => {
      acc.total += 1;
      if (r.level === 'green') acc.green += 1;
      else if (r.level === 'yellow') acc.yellow += 1;
      else acc.red += 1;
      return acc;
    },
    { total: 0, green: 0, yellow: 0, red: 0 },
  );

  const cfg = (monitorDetails[item.id]?.config ?? {}) as Record<string, unknown>;
  const prov = String(cfg.provider ?? (item.type === 'DOCKER_IMAGE' ? 'docker' : 'github')).toLowerCase();

  return (
    <tr className="border-b border-border">
      <td colSpan={9} className="px-4 py-3 bg-surface-elevated overflow-hidden max-w-0 w-full">
        {runsLoading ? (
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
              <Table noScroll>
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
                        <TableCell>
                          <Badge variant={levelBadgeVariant(r.level)}>{r.level.toUpperCase()}</Badge>
                        </TableCell>
                        <TableCell>{r.statusCode}</TableCell>
                        <TableCell>{r.latencyMs ?? '—'} ms</TableCell>
                        <TableCell>
                          {hasDiff ? (
                            <VersionDiff from={from} to={to} />
                          ) : (
                            <span className="text-xs text-text-secondary">—</span>
                          )}
                        </TableCell>
                        <TableCell
                          className="text-xs text-text-secondary max-w-[200px] truncate"
                          title={r.message}
                        >
                          {r.message}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </>
        )}

        {/* Release Notes (GitHub monitors) */}
        {prov === 'github' && (
          <div className="mt-4 pt-3 border-t border-border/50">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Release Notes</span>
              {!releaseNotes && !releaseNotesLoading && (
                <button
                  onClick={() => onFetchReleaseNotes(item.id)}
                  className="text-xs text-accent hover:underline flex items-center gap-1"
                >
                  <span>Fetch latest</span>
                </button>
              )}
              {releaseNotes?.url && (
                <a
                  href={releaseNotes.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-accent hover:underline flex items-center gap-1"
                >
                  <ExternalLink className="w-3 h-3" />
                  View on GitHub
                </a>
              )}
            </div>
            {releaseNotesLoading && (
              <p className="text-xs text-text-secondary">Loading release notes…</p>
            )}
            {releaseNotes && !releaseNotes.available && (
              <p className="text-xs text-text-muted">{releaseNotes.reason ?? 'Release notes unavailable'}</p>
            )}
            {releaseNotes?.available && (
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  {releaseNotes.version && (
                    <span className="text-xs font-mono font-semibold text-text-primary">{releaseNotes.version}</span>
                  )}
                  {releaseNotes.releaseName && releaseNotes.releaseName !== releaseNotes.version && (
                    <span className="text-xs text-text-secondary">{releaseNotes.releaseName}</span>
                  )}
                  {releaseNotes.publishedAt && (
                    <span className="text-xs text-text-muted">
                      {new Date(releaseNotes.publishedAt).toLocaleDateString()}
                    </span>
                  )}
                  {releaseNotes.prerelease && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-warning/15 text-warning border border-warning/30">
                      pre-release
                    </span>
                  )}
                  {releaseNotes.assetCount != null && releaseNotes.assetCount > 0 && (
                    <span className="text-xs text-text-muted">
                      {releaseNotes.assetCount} asset{releaseNotes.assetCount !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                {releaseNotes.body ? (
                  <pre className="text-xs text-text-secondary whitespace-pre-wrap font-sans bg-surface-elevated/50 border border-border/50 rounded-lg px-3 py-2 max-h-48 overflow-y-auto leading-relaxed">
                    {releaseNotes.body}
                  </pre>
                ) : (
                  <p className="text-xs text-text-muted italic">No release notes provided.</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Security Advisories */}
        {['npm', 'pypi', 'cargo', 'github'].includes(prov) && (
          <div className="mt-3 pt-3 border-t border-border/50">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Security</span>
              {!security && !securityLoading && (
                <button onClick={() => onFetchSecurity(item.id)} className="text-xs text-accent hover:underline">
                  Check advisories
                </button>
              )}
              {security?.total != null && security.total > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-danger/15 text-danger border border-danger/30">
                  {security.total} advisory{security.total !== 1 ? 'ies' : ''}
                </span>
              )}
              {security?.total === 0 && (
                <span className="text-xs text-success">✓ No known vulnerabilities</span>
              )}
            </div>
            {securityLoading && <p className="text-xs text-text-secondary">Querying osv.dev…</p>}
            {security && !security.supported && <p className="text-xs text-text-muted">{security.reason}</p>}
            {security?.error && <p className="text-xs text-danger">{security.error}</p>}
            {security?.supported && security.advisories.length > 0 && (
              <div className="space-y-1.5">
                {security.advisories.map((adv) => (
                  <div key={adv.id} className="px-3 py-2 rounded-lg bg-danger/5 border border-danger/20 text-xs">
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-0.5">
                          <span className="font-mono font-semibold text-danger">{adv.cveId ?? adv.id}</span>
                          {adv.cvss && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-danger/15 text-danger border border-danger/30">
                              CVSS {adv.cvss.substring(0, 4)}
                            </span>
                          )}
                          {adv.fixedIn && <span className="text-success">Fixed in {adv.fixedIn}</span>}
                        </div>
                        {adv.summary && <p className="text-text-secondary truncate">{adv.summary}</p>}
                      </div>
                      <a
                        href={adv.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-accent hover:underline shrink-0 flex items-center gap-1"
                      >
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}

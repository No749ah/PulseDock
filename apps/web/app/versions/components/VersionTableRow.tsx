'use client';

import { Fragment } from 'react';
import { ChevronUp, ChevronDown, CheckCircle2, ArrowUpCircle, ExternalLink, Play, Bell, Edit, Trash2 } from 'lucide-react';
import { Button } from '../../components/Button';
import { TableRow, TableCell } from '../../components/Table';
import { VersionDiff, extractVersionsFromMessage } from '../../components/VersionDiff';
import { secondsToHuman } from './utils';
import { VersionExpandedRow } from './VersionExpandedRow';
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

interface VersionTableRowProps {
  item: VersionItem;
  isExpanded: boolean;
  runs: MonitorRun[];
  runsLoading: boolean;
  releaseNotes: ReleaseNotesData | undefined;
  releaseNotesLoading: boolean;
  security: SecurityData | undefined;
  securityLoading: boolean;
  monitorDetails: Record<string, MonitorDetails>;
  runningId: string | null;
  visibleCols: Record<string, boolean>;
  onToggleDetails: (id: string) => void;
  onRunNow: (id: string) => void;
  onOpenAlertPanel: (item: VersionItem) => void;
  onEdit: (item: VersionItem) => void;
  onDelete: (id: string) => void;
  onFetchReleaseNotes: (id: string) => void;
  onFetchSecurity: (id: string) => void;
}

const PROVIDER_LABELS: Record<string, string> = {
  github: 'GitHub', gitlab: 'GitLab', docker: 'Docker',
  apt: 'APT', npm: 'npm', pypi: 'PyPI',
  cargo: 'Cargo', maven: 'Maven', helm: 'Helm',
};

export function VersionTableRow({
  item, isExpanded, runs, runsLoading,
  releaseNotes, releaseNotesLoading, security, securityLoading,
  monitorDetails, runningId, visibleCols,
  onToggleDetails, onRunNow, onOpenAlertPanel, onEdit, onDelete,
  onFetchReleaseNotes, onFetchSecurity,
}: VersionTableRowProps) {
  const cfg = (monitorDetails[item.id]?.config ?? {}) as Record<string, unknown>;
  const prov = String(cfg.provider ?? (item.type === 'DOCKER_IMAGE' ? 'docker' : 'github')).toLowerCase();

  const { from, to } = extractVersionsFromMessage(item.latestMessage);
  const hasUpdate = item.level !== 'green';

  let changelogUrl: string | null = null;
  if (hasUpdate && to && item.target) {
    const ghMatch = item.target.match(/^([^/]+\/[^/]+)$/);
    if (ghMatch) changelogUrl = `https://github.com/${ghMatch[1]}/releases`;
  }

  return (
    <Fragment>
      <TableRow>
        {/* Name */}
        <TableCell className={visibleCols.name ? '' : 'hidden'}>
          <button
            className="text-accent hover:underline flex items-center gap-1 text-left"
            onClick={() => onToggleDetails(item.id)}
          >
            {isExpanded ? <ChevronUp className="w-3 h-3 shrink-0" /> : <ChevronDown className="w-3 h-3 shrink-0" />}
            <span className="truncate max-w-[120px] sm:max-w-none">{item.name}</span>
          </button>
        </TableCell>

        {/* Type */}
        <TableCell className={visibleCols.type ? 'hidden sm:table-cell' : 'hidden'}>
          <span className="text-xs text-text-secondary">{PROVIDER_LABELS[prov] ?? item.type}</span>
        </TableCell>

        {/* Target */}
        <TableCell className={visibleCols.target ? 'hidden md:table-cell' : 'hidden'}>
          <span className="block max-w-[160px] truncate text-xs font-mono text-text-secondary" title={item.target}>
            {item.target}
          </span>
        </TableCell>

        {/* Current */}
        <TableCell className={visibleCols.current ? 'hidden sm:table-cell' : 'hidden'}>
          {item.currentVersion ? <span className="font-mono text-sm">{item.currentVersion}</span> : '—'}
        </TableCell>

        {/* Latest */}
        <TableCell className={`max-w-[200px] sm:max-w-[320px]${visibleCols.latest ? '' : ' hidden'}`}>
          {from && to && from !== to ? (
            <VersionDiff from={from} to={to} />
          ) : (
            <span className="text-xs text-text-secondary break-all">{item.latestMessage}</span>
          )}
        </TableCell>

        {/* Status */}
        <TableCell className={visibleCols.status ? '' : 'hidden'}>
          {item.level === 'green' ? (
            <div className="flex items-center gap-1.5 text-success">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              <span className="text-xs font-medium">Up to date</span>
            </div>
          ) : (
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
          )}
        </TableCell>

        {/* Last checked */}
        <TableCell className={visibleCols.lastChecked ? 'hidden lg:table-cell' : 'hidden'}>
          {item.checkedAt ? new Date(item.checkedAt).toLocaleString() : 'Never'}
        </TableCell>

        {/* Interval */}
        <TableCell className={visibleCols.interval ? 'hidden lg:table-cell' : 'hidden'}>
          {secondsToHuman(item.intervalSec)}
        </TableCell>

        {/* Action */}
        <TableCell className={visibleCols.action ? '' : 'hidden'}>
          <div className="flex items-center gap-1">
            <Button
              variant="secondary"
              size="sm"
              loading={runningId === item.id}
              onClick={() => onRunNow(item.id)}
            >
              <span className="flex items-center gap-1">
                <Play className="w-3 h-3" /> Run
              </span>
            </Button>
            <button
              className="relative p-1.5 rounded-lg text-text-secondary hover:text-accent hover:bg-surface-elevated transition-colors"
              onClick={() => onOpenAlertPanel(item)}
              aria-label="Alert channels"
              title="Manage alert channels"
            >
              <Bell className="w-4 h-4" />
              {item.alertChannels && item.alertChannels.length > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-accent rounded-full" />
              )}
            </button>
            <button
              className="p-1.5 rounded-lg text-accent hover:bg-surface-elevated transition-colors"
              onClick={() => onEdit(item)}
              aria-label="Edit"
            >
              <Edit className="w-4 h-4" />
            </button>
            <button
              className="p-1.5 rounded-lg text-danger hover:bg-surface-elevated transition-colors"
              onClick={() => onDelete(item.id)}
              aria-label="Delete"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </TableCell>
      </TableRow>

      {isExpanded && (
        <VersionExpandedRow
          item={item}
          runs={runs}
          runsLoading={runsLoading}
          releaseNotes={releaseNotes}
          releaseNotesLoading={releaseNotesLoading}
          security={security}
          securityLoading={securityLoading}
          monitorDetails={monitorDetails}
          onFetchReleaseNotes={onFetchReleaseNotes}
          onFetchSecurity={onFetchSecurity}
        />
      )}
    </Fragment>
  );
}

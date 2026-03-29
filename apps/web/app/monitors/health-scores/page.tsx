'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Activity,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  TrendingDown,
  Zap,
  Medal,
  Info,
} from 'lucide-react';
import { AppFrame } from '../../../components/app-frame';
import { Card } from '../../components/Card';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Table, TableHead, TableBody, TableRow, TableCell } from '../../components/Table';
import { SortableHeader } from '../../components/SortableTable';
import { getUser } from '../../../components/auth';
import { api } from '../../../lib/api';
import { useToast } from '../../../components/ui/toast';
import { useTableSort } from '../../../lib/useTableSort';
import { formatMonitorType } from '../../components/timeUtils';

type SortableKey = 'monitorName' | 'score' | 'uptimePct24h' | 'totalChecks24h' | 'activeIncidents';

type Grade = 'A' | 'B' | 'C' | 'D' | 'F';

interface LeaderboardItem {
  monitorId: string;
  monitorName: string;
  monitorType: string;
  score: number | null;
  grade: Grade | null;
  uptimePct24h: number | null;
  totalChecks24h: number;
  activeIncidents: number;
  isFlapping: boolean;
  slaTarget: number | null;
  slaCompliant: boolean | null;
  hints: string[];
}

interface LeaderboardData {
  items: LeaderboardItem[];
  summary: {
    totalMonitors: number;
    noDataCount: number;
    gradeDistribution: Record<Grade, number>;
    avgScore: number | null;
  };
}

const GRADE_COLORS: Record<Grade, string> = {
  A: 'text-green-400 bg-green-500/10 border-green-500/30',
  B: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
  C: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30',
  D: 'text-orange-400 bg-orange-500/10 border-orange-500/30',
  F: 'text-red-400 bg-red-500/10 border-red-500/30',
};

const GRADE_BAR: Record<Grade, string> = {
  A: 'bg-green-500',
  B: 'bg-emerald-500',
  C: 'bg-yellow-500',
  D: 'bg-orange-500',
  F: 'bg-red-500',
};

function GradeBadge({ grade }: { grade: Grade | null }) {
  if (!grade) return <span className="text-xs text-text-muted">No data</span>;
  return (
    <span className={`inline-flex items-center justify-center w-8 h-8 rounded-lg border text-sm font-bold ${GRADE_COLORS[grade]}`}>
      {grade}
    </span>
  );
}

function ScoreBar({ score }: { score: number | null }) {
  if (score === null) return <div className="w-full h-1.5 bg-surface rounded-full" />;
  const pct = Math.max(0, Math.min(100, score));
  const grade: Grade = pct >= 90 ? 'A' : pct >= 75 ? 'B' : pct >= 60 ? 'C' : pct >= 40 ? 'D' : 'F';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-surface rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${GRADE_BAR[grade]}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono text-text-secondary w-8 text-right">{score}</span>
    </div>
  );
}

export default function HealthScoresPage() {
  const router = useRouter();
  const { error: toastError } = useToast();
  const [data, setData] = useState<LeaderboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [gradeFilter, setGradeFilter] = useState<Grade | 'all' | 'no-data'>('all');
  const [search, setSearch] = useState('');

  const { sort, toggle: handleSort, sorted: sortFn } = useTableSort<SortableKey>('score', 'desc');
  const sorted = sortFn(data?.items ?? [], (item) => item[sort.key ?? 'score']);

  useEffect(() => {
    const user = getUser();
    if (!user) { router.push('/login'); return; }
    setLoading(true);
    api<LeaderboardData>('/v1/monitors/health-scores/leaderboard', user.id)
      .then(setData)
      .catch(() => toastError('Failed to load health scores'))
      .finally(() => setLoading(false));
  }, [router, toastError]);

  const filteredItems = sorted.filter((item) => {
    if (gradeFilter === 'no-data') return item.score === null;
    if (gradeFilter !== 'all') return item.grade === gradeFilter;
    return true;
  }).filter((item) =>
    !search || item.monitorName.toLowerCase().includes(search.toLowerCase()),
  );

  const summary = data?.summary;

  if (loading) {
    return (
      <AppFrame title="Health Score Leaderboard">
        <div className="flex items-center justify-center py-20 text-text-muted text-sm">
          <RefreshCw className="w-4 h-4 animate-spin mr-2" /> Loading health scores…
        </div>
      </AppFrame>
    );
  }

  if (!data || data.items.length === 0) {
    return (
      <AppFrame title="Health Score Leaderboard">
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Medal className="w-12 h-12 text-text-muted mb-4" />
          <h2 className="text-lg font-semibold text-text-primary mb-2">No monitors yet</h2>
          <p className="text-sm text-text-muted mb-6">Create monitors to see their health scores here.</p>
          <Link href="/monitors" className="px-4 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-accent/90 transition-colors">
            Go to Monitors
          </Link>
        </div>
      </AppFrame>
    );
  }

  return (
    <AppFrame title="Health Score Leaderboard">
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Health Score Leaderboard</h1>
            <p className="text-sm text-text-muted mt-1">Monitor reliability scores based on uptime, incidents, latency, and SLA compliance</p>
          </div>
          <button
            onClick={() => {
              const user = getUser();
              if (!user) return;
              setLoading(true);
              api<LeaderboardData>('/v1/monitors/health-scores/leaderboard', user.id)
                .then(setData)
                .catch(() => toastError('Failed to reload'))
                .finally(() => setLoading(false));
            }}
            className="p-2 rounded-lg border border-border text-text-muted hover:text-text-primary hover:bg-surface transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* Summary cards */}
        {summary && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <Card className="p-4 col-span-2 sm:col-span-3 lg:col-span-2">
              <div className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">Fleet Avg Score</div>
              <div className="flex items-end gap-2">
                <span className="text-3xl font-bold text-text-primary">{summary.avgScore ?? '—'}</span>
                {summary.avgScore !== null && (
                  <span className={`text-sm font-bold mb-1 ${GRADE_COLORS[summary.avgScore >= 90 ? 'A' : summary.avgScore >= 75 ? 'B' : summary.avgScore >= 60 ? 'C' : summary.avgScore >= 40 ? 'D' : 'F']}`}>
                    Grade {summary.avgScore >= 90 ? 'A' : summary.avgScore >= 75 ? 'B' : summary.avgScore >= 60 ? 'C' : summary.avgScore >= 40 ? 'D' : 'F'}
                  </span>
                )}
              </div>
              <div className="text-xs text-text-muted mt-1">{summary.totalMonitors} monitors tracked</div>
            </Card>

            {(['A', 'B', 'C', 'D', 'F'] as Grade[]).map((grade) => (
              <button
                key={grade}
                onClick={() => setGradeFilter(gradeFilter === grade ? 'all' : grade)}
                className={`p-4 rounded-xl border transition-colors text-left ${gradeFilter === grade ? GRADE_COLORS[grade] + ' border-current' : 'border-border bg-surface-elevated hover:border-accent/30'}`}
              >
                <div className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-1">Grade {grade}</div>
                <div className={`text-2xl font-bold ${gradeFilter === grade ? '' : 'text-text-primary'}`}>{summary.gradeDistribution[grade]}</div>
              </button>
            ))}
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            placeholder="Search monitors…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="px-3 py-2 text-sm bg-surface border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent/60 w-64"
          />
          {gradeFilter !== 'all' && (
            <button
              onClick={() => setGradeFilter('all')}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-accent/10 text-accent border border-accent/20 hover:bg-accent/20 transition-colors"
            >
              Clear filter
            </button>
          )}
          <span className="text-xs text-text-muted ml-auto">{filteredItems.length} monitor{filteredItems.length !== 1 ? 's' : ''}</span>
        </div>

        {/* Table */}
        <Card className="overflow-hidden">
          <Table>
            <TableHead>
              <TableRow>
                <SortableHeader sortKey="monitorName" sort={sort} onSort={handleSort} className="w-48">
                  Monitor
                </SortableHeader>
                <SortableHeader sortKey="score" sort={sort} onSort={handleSort} className="w-40">
                  Score
                </SortableHeader>
                <th className="px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider text-center w-16">Grade</th>
                <SortableHeader sortKey="uptimePct24h" sort={sort} onSort={handleSort} className="w-28">
                  Uptime 24h
                </SortableHeader>
                <SortableHeader sortKey="totalChecks24h" sort={sort} onSort={handleSort} className="w-24">
                  Checks
                </SortableHeader>
                <SortableHeader sortKey="activeIncidents" sort={sort} onSort={handleSort} className="w-24">
                  Incidents
                </SortableHeader>
                <th className="px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider w-24">SLA</th>
                <th className="px-4 py-3 w-10" />
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredItems.map((item) => {
                const isExpanded = expandedId === item.monitorId;
                return (
                  <>
                    <TableRow
                      key={item.monitorId}
                      onClick={() => setExpandedId(isExpanded ? null : item.monitorId)}
                      className="cursor-pointer hover:bg-surface/50 transition-colors"
                    >
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {item.isFlapping && (
                            <Zap className="w-3 h-3 text-amber-400 shrink-0" title="Flapping" />
                          )}
                          <div>
                            <Link
                              href={`/monitors/${item.monitorId}`}
                              onClick={(e) => e.stopPropagation()}
                              className="text-sm font-medium text-text-primary hover:text-accent transition-colors"
                            >
                              {item.monitorName}
                            </Link>
                            <div className="text-xs text-text-muted">{formatMonitorType(item.monitorType)}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <ScoreBar score={item.score} />
                      </TableCell>
                      <TableCell className="text-center">
                        <GradeBadge grade={item.grade} />
                      </TableCell>
                      <TableCell>
                        {item.uptimePct24h !== null ? (
                          <span className={`text-sm font-semibold ${item.uptimePct24h >= 99.9 ? 'text-green-400' : item.uptimePct24h >= 99 ? 'text-yellow-400' : 'text-red-400'}`}>
                            {item.uptimePct24h.toFixed(2)}%
                          </span>
                        ) : (
                          <span className="text-xs text-text-muted">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-text-secondary">{item.totalChecks24h.toLocaleString()}</span>
                      </TableCell>
                      <TableCell>
                        {item.activeIncidents > 0 ? (
                          <span className="inline-flex items-center gap-1 text-sm font-semibold text-red-400">
                            <AlertCircle className="w-3.5 h-3.5" />
                            {item.activeIncidents}
                          </span>
                        ) : (
                          <span className="text-sm text-green-400">
                            <CheckCircle2 className="w-3.5 h-3.5 inline" />
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {item.slaTarget !== null ? (
                          <span className={`text-xs font-semibold ${item.slaCompliant === true ? 'text-green-400' : item.slaCompliant === false ? 'text-red-400' : 'text-text-muted'}`}>
                            {item.slaCompliant === true ? '✓ Met' : item.slaCompliant === false ? '✗ Breach' : '—'}
                          </span>
                        ) : (
                          <span className="text-xs text-text-muted">None</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {isExpanded
                          ? <ChevronDown className="w-4 h-4 text-text-muted" />
                          : <ChevronRight className="w-4 h-4 text-text-muted" />
                        }
                      </TableCell>
                    </TableRow>
                    {isExpanded && (
                      <tr key={`${item.monitorId}-expanded`} className="bg-surface/30">
                        <td colSpan={8} className="px-6 py-4">
                          <div className="space-y-2">
                            <div className="flex items-center gap-2 mb-3">
                              <Info className="w-3.5 h-3.5 text-accent" />
                              <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Improvement Hints</span>
                            </div>
                            {item.hints.map((hint, i) => (
                              <div key={i} className="flex items-start gap-2.5 p-3 bg-surface rounded-lg border border-border">
                                <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${item.score !== null && item.score >= 90 ? 'bg-green-400' : item.score !== null && item.score >= 75 ? 'bg-yellow-400' : 'bg-red-400'}`} />
                                <p className="text-sm text-text-secondary">{hint}</p>
                              </div>
                            ))}
                            <div className="pt-2">
                              <Link
                                href={`/monitors/${item.monitorId}`}
                                className="text-xs font-medium text-accent hover:underline"
                              >
                                View monitor detail →
                              </Link>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </TableBody>
          </Table>
        </Card>

        {/* Score methodology */}
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-4 h-4 text-accent" />
            <h3 className="text-sm font-semibold text-text-primary">Score Methodology</h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Uptime (24h)', points: '50 pts', desc: '% of checks passing × 50' },
              { label: 'Latency', points: '30 pts', desc: 'Healthy p95 response time' },
              { label: 'Incidents', points: '20 pts', desc: '−10 per active incident' },
              { label: 'Flapping', points: '−15 pts', desc: 'Penalty when flap detected' },
            ].map((item) => (
              <div key={item.label} className="p-3 bg-surface rounded-lg border border-border">
                <div className="text-xs font-semibold text-text-primary mb-0.5">{item.label}</div>
                <div className="text-sm font-bold text-accent">{item.points}</div>
                <div className="text-xs text-text-muted mt-1">{item.desc}</div>
              </div>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-5 gap-2">
            {(['A', 'B', 'C', 'D', 'F'] as Grade[]).map((g, i) => {
              const ranges = ['90–100', '75–89', '60–74', '40–59', '0–39'];
              return (
                <div key={g} className={`p-2 rounded-lg border text-center ${GRADE_COLORS[g]}`}>
                  <div className="text-sm font-bold">{g}</div>
                  <div className="text-xs opacity-80">{ranges[i]}</div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </AppFrame>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ShieldCheck,
  ShieldAlert,
  Shield,
  ShieldX,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ExternalLink,
  RefreshCw,
  Search,
  Info,
} from 'lucide-react';
import { AppFrame } from '../../../components/app-frame';
import { Card } from '../../components/Card';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '../../components/Table';
import { FadeIn } from '../../components/FadeIn';
import { getUser } from '../../../components/auth';
import { api } from '../../../lib/api';
import { useToast } from '../../../components/ui/toast';
import Link from 'next/link';

// ─── Types ────────────────────────────────────────────────────────────────────

interface HeaderCoverage {
  name: string;
  presentCount: number;
  totalCount: number;
  coveragePct: number;
  severity: string;
}

interface MonitorRow {
  monitorId: string;
  name: string;
  target: string;
  folderId: string | null;
  folderName: string | null;
  enabled: boolean;
  grade: string | null;
  score: number | null;
  checkedAt: string | null;
  headers: Array<{ name: string; present: boolean; severity: string }>;
}

interface SecuritySummary {
  total: number;
  gradeA: number;
  gradeB: number;
  gradeC: number;
  gradeD: number;
  gradeF: number;
  noData: number;
  avgScore: number | null;
  headerCoverage: HeaderCoverage[];
  monitors: MonitorRow[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function gradeColor(grade: string | null): string {
  if (!grade) return 'text-text-muted';
  switch (grade.toUpperCase()) {
    case 'A': return 'text-success';
    case 'B': return 'text-success/80';
    case 'C': return 'text-warning';
    case 'D': return 'text-warning/80';
    case 'F': return 'text-danger';
    default: return 'text-text-muted';
  }
}

function gradeBg(grade: string | null): string {
  if (!grade) return 'bg-surface-elevated border-border';
  switch (grade.toUpperCase()) {
    case 'A': return 'bg-success/10 border-success/30';
    case 'B': return 'bg-success/5 border-success/20';
    case 'C': return 'bg-warning/10 border-warning/30';
    case 'D': return 'bg-warning/5 border-warning/20';
    case 'F': return 'bg-danger/10 border-danger/30';
    default: return 'bg-surface-elevated border-border';
  }
}

function gradeIcon(grade: string | null) {
  if (!grade) return <Shield className="w-4 h-4 text-text-muted" />;
  switch (grade.toUpperCase()) {
    case 'A': return <ShieldCheck className="w-4 h-4 text-success" />;
    case 'B': return <ShieldCheck className="w-4 h-4 text-success/70" />;
    case 'C': return <ShieldAlert className="w-4 h-4 text-warning" />;
    case 'D': return <ShieldAlert className="w-4 h-4 text-warning/70" />;
    case 'F': return <ShieldX className="w-4 h-4 text-danger" />;
    default: return <Shield className="w-4 h-4 text-text-muted" />;
  }
}

function gradeBadgeVariant(grade: string | null): 'success' | 'warning' | 'danger' | 'default' {
  if (!grade) return 'default';
  switch (grade.toUpperCase()) {
    case 'A': case 'B': return 'success';
    case 'C': case 'D': return 'warning';
    case 'F': return 'danger';
    default: return 'default';
  }
}

function coveragePctColor(pct: number): string {
  if (pct >= 80) return 'text-success';
  if (pct >= 50) return 'text-warning';
  return 'text-danger';
}

function coverageBarColor(pct: number): string {
  if (pct >= 80) return 'bg-success';
  if (pct >= 50) return 'bg-warning';
  return 'bg-danger';
}

function severityBadge(severity: string) {
  if (severity === 'critical') return <Badge variant="danger">Critical</Badge>;
  if (severity === 'warning') return <Badge variant="warning">Warning</Badge>;
  return <Badge variant="default">Info</Badge>;
}

function relativeTime(iso: string | null): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 2) return 'just now';
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// Score bar: 0–100 visual
function ScoreBar({ score }: { score: number | null }) {
  if (score === null) return <span className="text-xs text-text-muted">—</span>;
  const pct = score;
  const color = pct >= 80 ? 'bg-success' : pct >= 50 ? 'bg-warning' : 'bg-danger';
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-1.5 rounded-full bg-surface-elevated overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs font-mono tabular-nums ${pct >= 80 ? 'text-success' : pct >= 50 ? 'text-warning' : 'text-danger'}`}>{pct}</span>
    </div>
  );
}

// Header presence mini-grid
function HeaderMiniGrid({ headers }: { headers: Array<{ name: string; present: boolean; severity: string }> }) {
  if (!headers.length) return <span className="text-xs text-text-muted">No audit data</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {headers.map((h) => (
        <div
          key={h.name}
          title={`${h.name}: ${h.present ? 'Present' : 'Missing'}`}
          className={`w-2.5 h-2.5 rounded-sm ${h.present ? 'bg-success' : h.severity === 'critical' ? 'bg-danger' : 'bg-warning'}`}
        />
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SecurityHeadersPage() {
  const router = useRouter();
  const { error: toastError } = useToast();
  const [data, setData] = useState<SecuritySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [gradeFilter, setGradeFilter] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const user = await getUser(router);
      if (!user) return;
      const res = await api<SecuritySummary>('/v1/monitors/security-headers');
      setData(res);
    } catch {
      toastError('Failed to load security headers data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const filteredMonitors = (data?.monitors ?? []).filter((m) => {
    const matchSearch = !search || m.name.toLowerCase().includes(search.toLowerCase()) || (m.target ?? '').toLowerCase().includes(search.toLowerCase());
    const matchGrade = gradeFilter === 'all' || (gradeFilter === 'no-data' ? m.grade === null : m.grade?.toUpperCase() === gradeFilter);
    return matchSearch && matchGrade;
  });

  // Grade distribution bar width
  const total = data?.total ?? 0;
  const gradeBar = (count: number) => total > 0 ? `${Math.round((count / total) * 100)}%` : '0%';

  return (
    <AppFrame title="Security Headers">
      <div className="space-y-6">
        {/* Header */}
        <FadeIn>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-accent/10">
                <Shield className="w-5 h-5 text-accent" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-text-primary">Security Headers Fleet</h1>
                <p className="text-sm text-text-muted mt-0.5">HTTP security header audit across all HTTP &amp; Browser monitors</p>
              </div>
            </div>
            <Button variant="secondary" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </FadeIn>

        {/* Summary Stats */}
        <FadeIn delay={0.05}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="p-4">
              <div className="text-xs text-text-muted mb-1">Total Monitored</div>
              <div className="text-2xl font-bold text-text-primary">{loading ? '—' : (data?.total ?? 0)}</div>
              <div className="text-xs text-text-muted mt-1">HTTP/Browser monitors</div>
            </Card>
            <Card className="p-4">
              <div className="text-xs text-text-muted mb-1">Fleet Avg Score</div>
              <div className={`text-2xl font-bold ${data?.avgScore != null ? (data.avgScore >= 80 ? 'text-success' : data.avgScore >= 50 ? 'text-warning' : 'text-danger') : 'text-text-muted'}`}>
                {loading ? '—' : data?.avgScore != null ? data.avgScore : '—'}
              </div>
              <div className="text-xs text-text-muted mt-1">out of 100</div>
            </Card>
            <Card className="p-4">
              <div className="text-xs text-text-muted mb-1">Grade A</div>
              <div className="text-2xl font-bold text-success">{loading ? '—' : (data?.gradeA ?? 0)}</div>
              <div className="text-xs text-text-muted mt-1">Excellent security</div>
            </Card>
            <Card className="p-4">
              <div className="text-xs text-text-muted mb-1">Grade F / No Data</div>
              <div className={`text-2xl font-bold ${(data?.gradeF ?? 0) > 0 || (data?.noData ?? 0) > 0 ? 'text-danger' : 'text-text-muted'}`}>
                {loading ? '—' : ((data?.gradeF ?? 0) + (data?.noData ?? 0))}
              </div>
              <div className="text-xs text-text-muted mt-1">Need attention</div>
            </Card>
          </div>
        </FadeIn>

        {/* Grade Distribution */}
        {!loading && data && data.total > 0 && (
          <FadeIn delay={0.1}>
            <Card className="p-4">
              <h2 className="text-sm font-semibold text-text-primary mb-3">Grade Distribution</h2>
              <div className="space-y-2">
                {[
                  { grade: 'A', count: data.gradeA, color: 'bg-success' },
                  { grade: 'B', count: data.gradeB, color: 'bg-success/60' },
                  { grade: 'C', count: data.gradeC, color: 'bg-warning' },
                  { grade: 'D', count: data.gradeD, color: 'bg-warning/60' },
                  { grade: 'F', count: data.gradeF, color: 'bg-danger' },
                  { grade: 'No Data', count: data.noData, color: 'bg-border' },
                ].map(({ grade, count, color }) => (
                  <div key={grade} className="flex items-center gap-3">
                    <div className="w-12 text-xs font-mono text-text-secondary text-right shrink-0">{grade}</div>
                    <div className="flex-1 h-5 rounded bg-surface-elevated overflow-hidden">
                      <div className={`h-full rounded ${color} transition-all duration-500`} style={{ width: gradeBar(count) }} />
                    </div>
                    <div className="w-8 text-xs text-text-muted tabular-nums text-right shrink-0">{count}</div>
                  </div>
                ))}
              </div>
            </Card>
          </FadeIn>
        )}

        {/* Header Coverage */}
        {!loading && data && data.headerCoverage.length > 0 && (
          <FadeIn delay={0.15}>
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-4">
                <h2 className="text-sm font-semibold text-text-primary">Header Coverage by Type</h2>
                <div className="flex items-center gap-1.5 text-xs text-text-muted">
                  <Info className="w-3 h-3" />
                  Fleet-wide presence rate per security header
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {data.headerCoverage.map((h) => (
                  <div key={h.name} className="flex items-center gap-3 p-3 rounded-xl bg-surface-elevated border border-border">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium text-text-primary truncate">{h.name}</span>
                        {severityBadge(h.severity)}
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-background overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${coverageBarColor(h.coveragePct)}`}
                          style={{ width: `${h.coveragePct}%` }}
                        />
                      </div>
                    </div>
                    <div className={`text-sm font-bold tabular-nums shrink-0 ${coveragePctColor(h.coveragePct)}`}>
                      {h.coveragePct}%
                    </div>
                    <div className="text-xs text-text-muted shrink-0 hidden sm:block">
                      {h.presentCount}/{h.totalCount}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </FadeIn>
        )}

        {/* Monitor Table */}
        <FadeIn delay={0.2}>
          <Card className="overflow-hidden">
            {/* Toolbar */}
            <div className="flex items-center gap-3 p-4 border-b border-border flex-wrap">
              <div className="relative flex-1 min-w-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search monitors…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-border bg-surface text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>
              <div className="flex items-center gap-1.5">
                {['all', 'A', 'B', 'C', 'D', 'F', 'no-data'].map((g) => (
                  <button
                    key={g}
                    onClick={() => setGradeFilter(g)}
                    className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${gradeFilter === g ? 'bg-accent text-white border-accent' : 'border-border text-text-muted hover:text-text-primary hover:bg-surface-elevated'}`}
                  >
                    {g === 'all' ? 'All' : g === 'no-data' ? 'No Data' : `Grade ${g}`}
                  </button>
                ))}
              </div>
              <div className="text-xs text-text-muted shrink-0">{filteredMonitors.length} monitor{filteredMonitors.length !== 1 ? 's' : ''}</div>
            </div>

            {loading ? (
              <div className="p-12 text-center">
                <RefreshCw className="w-6 h-6 text-accent animate-spin mx-auto mb-3" />
                <p className="text-sm text-text-muted">Loading security data…</p>
              </div>
            ) : filteredMonitors.length === 0 ? (
              <div className="p-12 text-center">
                <Shield className="w-10 h-10 text-text-muted mx-auto mb-3" />
                <p className="text-sm font-medium text-text-primary mb-1">
                  {data?.total === 0 ? 'No HTTP/Browser monitors found' : 'No monitors match your filters'}
                </p>
                <p className="text-xs text-text-muted">
                  {data?.total === 0
                    ? 'Create an HTTP or Browser monitor with security header auditing enabled to see results here.'
                    : 'Try adjusting your search or grade filter.'}
                </p>
              </div>
            ) : (
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeader>Monitor</TableHeader>
                    <TableHeader className="hidden sm:table-cell">Grade</TableHeader>
                    <TableHeader className="hidden md:table-cell">Score</TableHeader>
                    <TableHeader className="hidden lg:table-cell">Header Map</TableHeader>
                    <TableHeader className="hidden md:table-cell">Checked</TableHeader>
                    <TableHeader />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredMonitors.map((m) => (
                    <>
                      <TableRow
                        key={m.monitorId}
                        onClick={() => setExpandedId(expandedId === m.monitorId ? null : m.monitorId)}
                        className="cursor-pointer hover:bg-surface-elevated/50 transition-colors"
                      >
                        <TableCell>
                          <div className="flex items-center gap-2.5">
                            {gradeIcon(m.grade)}
                            <div className="min-w-0">
                              <div className={`text-sm font-medium truncate max-w-xs ${m.enabled ? 'text-text-primary' : 'text-text-muted'}`}>{m.name}</div>
                              {m.target && (
                                <div className="text-xs text-text-muted truncate max-w-xs">{m.target}</div>
                              )}
                              {m.folderName && (
                                <div className="text-xs text-text-muted/60">{m.folderName}</div>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          {m.grade ? (
                            <Badge variant={gradeBadgeVariant(m.grade)}>Grade {m.grade}</Badge>
                          ) : (
                            <Badge variant="default">No audit</Badge>
                          )}
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <ScoreBar score={m.score} />
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          <HeaderMiniGrid headers={m.headers} />
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <span className="text-xs text-text-muted">{relativeTime(m.checkedAt)}</span>
                        </TableCell>
                        <TableCell>
                          <Link
                            href={`/monitors/${m.monitorId}?tab=security`}
                            onClick={(e) => e.stopPropagation()}
                            className="p-1.5 rounded-lg hover:bg-surface-elevated text-text-muted hover:text-text-primary transition-colors inline-flex"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </Link>
                        </TableCell>
                      </TableRow>

                      {/* Expanded header detail */}
                      {expandedId === m.monitorId && m.headers.length > 0 && (
                        <TableRow key={`${m.monitorId}-detail`}>
                          <TableCell colSpan={6} className="bg-surface-elevated/30 p-0">
                            <div className="px-4 py-3">
                              <div className="flex items-center gap-2 mb-3">
                                <span className="text-xs font-semibold text-text-primary">Header Audit Detail</span>
                                <div className={`flex items-center gap-1 px-2 py-0.5 rounded-lg border text-xs font-bold ${gradeBg(m.grade)} ${gradeColor(m.grade)}`}>
                                  {m.grade ?? 'N/A'}
                                  {m.score !== null && <span className="ml-1 opacity-70">({m.score}/100)</span>}
                                </div>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                                {m.headers.map((h) => (
                                  <div
                                    key={h.name}
                                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${h.present ? 'border-success/20 bg-success/5' : h.severity === 'critical' ? 'border-danger/20 bg-danger/5' : 'border-warning/20 bg-warning/5'}`}
                                  >
                                    {h.present
                                      ? <CheckCircle2 className="w-3.5 h-3.5 text-success shrink-0" />
                                      : h.severity === 'critical'
                                        ? <XCircle className="w-3.5 h-3.5 text-danger shrink-0" />
                                        : <AlertTriangle className="w-3.5 h-3.5 text-warning shrink-0" />
                                    }
                                    <span className="text-xs text-text-primary truncate">{h.name}</span>
                                    {!h.present && (
                                      <span className={`text-[10px] shrink-0 ${h.severity === 'critical' ? 'text-danger' : 'text-warning'}`}>Missing</span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </FadeIn>

        {/* Enablement hint */}
        {!loading && data && data.noData > 0 && data.total > 0 && (
          <FadeIn delay={0.25}>
            <div className="flex items-start gap-3 p-4 rounded-xl border border-accent/20 bg-accent/5">
              <Info className="w-4 h-4 text-accent mt-0.5 shrink-0" />
              <div>
                <div className="text-sm font-medium text-text-primary mb-1">{data.noData} monitor{data.noData !== 1 ? 's' : ''} without audit data</div>
                <div className="text-xs text-text-muted">
                  Security header auditing must be enabled per monitor (Advanced Settings → Security Headers Audit). Once enabled, audit data is collected on the next successful check.
                </div>
              </div>
            </div>
          </FadeIn>
        )}
      </div>
    </AppFrame>
  );
}

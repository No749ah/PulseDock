'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ShieldCheck,
  ShieldAlert,
  Shield,
  RefreshCw,
  ExternalLink,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Minus,
  Search,
  Download,
  Folder,
} from 'lucide-react';
import { AppFrame } from '../../components/app-frame';
import { Card } from '../components/Card';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '../components/Table';
import { FadeIn } from '../components/FadeIn';
import { getUser } from '../../components/auth';
import { api } from '../../lib/api';
import { useToast } from '../../components/ui/toast';
import Link from 'next/link';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CertEntry {
  monitorId: string;
  name: string;
  target: string;
  type: string;
  enabled: boolean;
  folderId: string | null;
  folderName: string | null;
  status: string;
  daysRemaining: number | null;
  expiresAt: string | null;
  lastCheckedAt: string | null;
  lastMessage: string;
  level: string;
}

interface SslSummary {
  total: number;
  expired: number;
  critical: number;
  warning: number;
  healthy: number;
  certs: CertEntry[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function daysLabel(days: number | null): string {
  if (days === null) return '—';
  if (days < 0) return `Expired ${Math.abs(days)}d ago`;
  if (days === 0) return 'Expires today';
  return `${days}d`;
}

function expiryBadgeVariant(days: number | null, type: string): 'danger' | 'warning' | 'success' | 'default' {
  if (type !== 'SSL_CERT') return 'default';
  if (days === null) return 'default';
  if (days < 0 || days <= 0) return 'danger';
  if (days < 10) return 'danger';
  if (days <= 30) return 'warning';
  return 'success';
}

function levelBadge(level: string) {
  if (level === 'green') return <Badge variant="success">OK</Badge>;
  if (level === 'yellow') return <Badge variant="warning">Warning</Badge>;
  if (level === 'red') return <Badge variant="danger">Critical</Badge>;
  return <Badge variant="default">Unknown</Badge>;
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

function DaysBar({ days }: { days: number | null }) {
  if (days === null) return <div className="text-xs text-text-muted">—</div>;
  const max = 90;
  const pct = days < 0 ? 0 : Math.min(days / max, 1) * 100;
  const color =
    days < 0 ? 'bg-danger'
    : days < 10 ? 'bg-danger'
    : days <= 30 ? 'bg-warning'
    : 'bg-success';
  return (
    <div className="flex items-center gap-2 min-w-[80px]">
      <div className="flex-1 h-1.5 rounded-full bg-surface-elevated overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs font-mono tabular-nums ${days < 0 ? 'text-danger' : days < 10 ? 'text-danger' : days <= 30 ? 'text-warning' : 'text-success'}`}>
        {daysLabel(days)}
      </span>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function SslInventoryPage() {
  const router = useRouter();
  const toastCtx = useToast();
  const toast = toastCtx?.toast;

  const [summary, setSummary] = useState<SslSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'SSL_CERT' | 'HTTP' | 'BROWSER'>('all');
  const [levelFilter, setLevelFilter] = useState<'all' | 'red' | 'yellow' | 'green'>('all');

  async function load(showRefreshing = false) {
    const u = getUser();
    if (!u) { router.push('/login'); return; }
    if (showRefreshing) setRefreshing(true);
    try {
      const data = await api<SslSummary>('/v1/monitors/ssl-summary', u.id);
      setSummary(data);
    } catch {
      toast?.({ type: 'error', title: 'Failed to load certificate inventory' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleExport() {
    if (!summary) return;
    const rows = [
      ['Name', 'Target', 'Type', 'Status', 'Days Remaining', 'Expires At', 'Last Checked', 'Folder'],
      ...filtered.map((c) => [
        c.name,
        c.target,
        c.type,
        c.status,
        c.daysRemaining ?? '',
        c.expiresAt ?? '',
        c.lastCheckedAt ?? '',
        c.folderName ?? '',
      ]),
    ];
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ssl-inventory.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  const certs = summary?.certs ?? [];
  const filtered = certs.filter((c) => {
    const matchesQuery = !query || c.name.toLowerCase().includes(query.toLowerCase()) || c.target.toLowerCase().includes(query.toLowerCase());
    const matchesType = typeFilter === 'all' || c.type === typeFilter;
    const matchesLevel = levelFilter === 'all' || c.level === levelFilter;
    return matchesQuery && matchesType && matchesLevel;
  });

  // ─── Stat cards data ──────────────────────────────────────────────────────
  const statCards = [
    {
      label: 'Total',
      value: summary?.total ?? 0,
      icon: Shield,
      color: 'text-text-secondary',
      bg: 'bg-surface-elevated',
    },
    {
      label: 'Expired',
      value: summary?.expired ?? 0,
      icon: XCircle,
      color: 'text-danger',
      bg: 'bg-danger/10',
      highlight: (summary?.expired ?? 0) > 0,
    },
    {
      label: 'Critical (<10d)',
      value: summary?.critical ?? 0,
      icon: AlertTriangle,
      color: 'text-danger',
      bg: 'bg-danger/10',
      highlight: (summary?.critical ?? 0) > 0,
    },
    {
      label: 'Warning (≤30d)',
      value: summary?.warning ?? 0,
      icon: ShieldAlert,
      color: 'text-warning',
      bg: 'bg-warning/10',
      highlight: (summary?.warning ?? 0) > 0,
    },
    {
      label: 'Healthy (>30d)',
      value: summary?.healthy ?? 0,
      icon: CheckCircle2,
      color: 'text-success',
      bg: 'bg-success/10',
    },
  ];

  if (loading) {
    return (
      <AppFrame breadcrumbs={[{ label: 'SSL Certificates' }]}>
        <div className="flex items-center justify-center min-h-[300px]">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-accent border-t-transparent" />
        </div>
      </AppFrame>
    );
  }

  return (
    <AppFrame breadcrumbs={[{ label: 'SSL Certificates' }]}>
      <FadeIn>
        <div className="space-y-6 max-w-7xl mx-auto">
          {/* ─── Header ──────────────────────────────────────────────────────── */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
                <ShieldCheck className="w-6 h-6 text-accent" />
                SSL Certificate Inventory
              </h1>
              <p className="text-sm text-text-secondary mt-1">
                Certificate expiry overview for all SSL, HTTP, and Browser monitors
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => load(true)}
                disabled={refreshing}
                className="flex items-center gap-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleExport}
                disabled={!summary || filtered.length === 0}
                className="flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                Export CSV
              </Button>
              <Link href="/monitors?type=SSL_CERT">
                <Button variant="primary" size="sm" className="flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5" />
                  Add SSL Monitor
                </Button>
              </Link>
            </div>
          </div>

          {/* ─── Stat cards ──────────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {statCards.map((card) => (
              <Card
                key={card.label}
                className={`p-4 flex items-center gap-3 ${card.highlight ? 'ring-1 ring-danger/30' : ''}`}
              >
                <div className={`w-8 h-8 rounded-lg ${card.bg} flex items-center justify-center flex-shrink-0`}>
                  <card.icon className={`w-4 h-4 ${card.color}`} />
                </div>
                <div>
                  <div className={`text-xl font-bold ${card.color}`}>{card.value}</div>
                  <div className="text-xs text-text-muted leading-tight">{card.label}</div>
                </div>
              </Card>
            ))}
          </div>

          {/* ─── Alert banners ───────────────────────────────────────────────── */}
          {(summary?.expired ?? 0) > 0 && (
            <div className="flex items-start gap-3 p-4 rounded-xl bg-danger/10 border border-danger/20 text-danger text-sm">
              <XCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>
                <strong>{summary!.expired} certificate{summary!.expired > 1 ? 's' : ''} expired.</strong> Renew immediately to avoid service disruption.
              </span>
            </div>
          )}
          {(summary?.expired ?? 0) === 0 && (summary?.critical ?? 0) > 0 && (
            <div className="flex items-start gap-3 p-4 rounded-xl bg-danger/10 border border-danger/20 text-danger text-sm">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>
                <strong>{summary!.critical} certificate{summary!.critical > 1 ? 's expire' : ' expires'} within 10 days.</strong> Schedule renewal now.
              </span>
            </div>
          )}

          {/* ─── Filters ─────────────────────────────────────────────────────── */}
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
              <input
                type="text"
                placeholder="Search by name or target…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-lg bg-surface border border-border text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
              className="px-3 py-2 rounded-lg bg-surface border border-border text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
            >
              <option value="all">All types</option>
              <option value="SSL_CERT">SSL Cert only</option>
              <option value="HTTP">HTTP only</option>
              <option value="BROWSER">Browser only</option>
            </select>
            <select
              value={levelFilter}
              onChange={(e) => setLevelFilter(e.target.value as typeof levelFilter)}
              className="px-3 py-2 rounded-lg bg-surface border border-border text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
            >
              <option value="all">All statuses</option>
              <option value="red">Critical / Expired</option>
              <option value="yellow">Warning</option>
              <option value="green">Healthy</option>
            </select>
          </div>

          {/* ─── Table ───────────────────────────────────────────────────────── */}
          {filtered.length === 0 ? (
            <Card className="p-10 text-center">
              <ShieldCheck className="w-10 h-10 text-text-muted mx-auto mb-3" />
              {certs.length === 0 ? (
                <>
                  <p className="text-text-secondary font-medium">No SSL or HTTP monitors yet</p>
                  <p className="text-sm text-text-muted mt-1">
                    Add an <strong>SSL Cert</strong> monitor to track certificate expiry, or an <strong>HTTP</strong> monitor for a live cert inspection.
                  </p>
                  <Link href="/monitors">
                    <Button variant="primary" size="sm" className="mt-4">Add monitor →</Button>
                  </Link>
                </>
              ) : (
                <>
                  <p className="text-text-secondary font-medium">No results</p>
                  <p className="text-sm text-text-muted mt-1">Adjust your filters or search query.</p>
                </>
              )}
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeader>Monitor</TableHeader>
                    <TableHeader className="hidden md:table-cell">Target</TableHeader>
                    <TableHeader className="hidden sm:table-cell">Type</TableHeader>
                    <TableHeader>Expiry</TableHeader>
                    <TableHeader className="hidden lg:table-cell">Expires At</TableHeader>
                    <TableHeader>Status</TableHeader>
                    <TableHeader className="hidden lg:table-cell">Last Checked</TableHeader>
                    <TableHeader className="hidden xl:table-cell">Folder</TableHeader>
                    <TableHeader className="w-10"></TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filtered.map((cert) => {
                    const variant = expiryBadgeVariant(cert.daysRemaining, cert.type);
                    return (
                      <TableRow key={cert.monitorId} className="hover:bg-surface-elevated/40 transition-colors">
                        <TableCell>
                          <div className="flex items-center gap-2.5">
                            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                              cert.level === 'green' ? 'bg-success' :
                              cert.level === 'yellow' ? 'bg-warning' :
                              cert.level === 'red' ? 'bg-danger' :
                              'bg-text-muted'
                            }`} />
                            <span className="font-medium text-text-primary text-sm truncate max-w-[180px]">{cert.name}</span>
                            {!cert.enabled && (
                              <Badge variant="default" className="text-xs">Paused</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <span className="text-xs text-text-secondary font-mono truncate max-w-[200px] block">
                            {cert.target}
                          </span>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <Badge variant={cert.type === 'SSL_CERT' ? 'default' : 'secondary'}>
                            {cert.type === 'SSL_CERT' ? 'SSL Cert' : cert.type === 'HTTP' ? 'HTTP' : 'Browser'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {cert.type === 'SSL_CERT' ? (
                            <div className="flex items-center gap-2">
                              <DaysBar days={cert.daysRemaining} />
                              {variant !== 'default' && (
                                <Badge variant={variant} className="hidden sm:inline-flex">
                                  {variant === 'danger' ? (cert.daysRemaining !== null && cert.daysRemaining < 0 ? 'Expired' : 'Critical') : 'Warning'}
                                </Badge>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-text-muted">
                              {cert.level === 'red' ? (
                                <span className="text-danger flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Check failed</span>
                              ) : cert.level === 'yellow' ? (
                                <span className="text-warning flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Degraded</span>
                              ) : cert.level === 'green' ? (
                                <span className="text-success flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> OK</span>
                              ) : (
                                <span className="flex items-center gap-1"><Minus className="w-3 h-3" /> No data</span>
                              )}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          <span className="text-xs text-text-secondary tabular-nums">
                            {cert.expiresAt ?? (cert.type === 'HTTP' ? <span className="text-text-muted italic">Live check</span> : '—')}
                          </span>
                        </TableCell>
                        <TableCell>
                          {levelBadge(cert.level)}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          <div className="flex items-center gap-1.5 text-xs text-text-muted">
                            <Clock className="w-3 h-3 flex-shrink-0" />
                            {relativeTime(cert.lastCheckedAt)}
                          </div>
                        </TableCell>
                        <TableCell className="hidden xl:table-cell">
                          {cert.folderName ? (
                            <div className="flex items-center gap-1 text-xs text-text-muted">
                              <Folder className="w-3 h-3" />
                              {cert.folderName}
                            </div>
                          ) : (
                            <span className="text-xs text-text-muted">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Link href={`/monitors/${cert.monitorId}`} title="View monitor">
                            <Button variant="ghost" size="sm" className="w-7 h-7 p-0 flex items-center justify-center">
                              <ExternalLink className="w-3.5 h-3.5" />
                            </Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <div className="px-4 py-2.5 border-t border-border bg-surface-elevated/20 text-xs text-text-muted">
                {filtered.length} of {certs.length} certificate{certs.length !== 1 ? 's' : ''}
                {query || typeFilter !== 'all' || levelFilter !== 'all' ? ' (filtered)' : ''}
              </div>
            </Card>
          )}

          {/* ─── Info footer ─────────────────────────────────────────────────── */}
          <div className="text-xs text-text-muted space-y-1">
            <p>
              <strong className="text-text-secondary">SSL_CERT monitors</strong> — dedicated certificate expiry checks. Days remaining parsed from last check run.
            </p>
            <p>
              <strong className="text-text-secondary">HTTP / Browser monitors</strong> — uptime monitors with certificate inspection available via the{' '}
              <span className="font-mono">Certificate</span> tab on the monitor detail page.
            </p>
            <p>
              Certificates expiring within <strong className="text-danger">10 days</strong> are Critical.
              Within <strong className="text-warning">30 days</strong> are Warning.
              Beyond 30 days are <strong className="text-success">Healthy</strong>.
            </p>
          </div>
        </div>
      </FadeIn>
    </AppFrame>
  );
}

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Clock,
  FileText,
  Filter,
  RefreshCw,
  Siren,
  StickyNote,
  Zap,
} from 'lucide-react';
import { AppFrame } from '../../components/app-frame';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { FadeIn } from '../components/FadeIn';
import { getUser } from '../../components/auth';
import { api } from '../../lib/api';

// ─── Types ───────────────────────────────────────────────────────────────────

type CheckItem = {
  kind: 'check';
  id: string;
  ts: string;
  monitorId: string;
  monitorName: string;
  monitorType: string;
  level: 'green' | 'yellow' | 'red';
  ok: boolean;
  status: number;
  latencyMs: number | null;
  message: string;
};

type EventItem = {
  kind: 'event';
  id: string;
  ts: string;
  monitorId: string;
  monitorName: string;
  monitorType: string;
  eventType: string;
  message: string;
};

type IncidentItem = {
  kind: 'incident';
  id: string;
  ts: string;
  title: string;
  status: string;
  severity: string;
  resolvedAt: string | null;
  monitors: Array<{ id: string; name: string }>;
};

type FeedItem = CheckItem | EventItem | IncidentItem;

interface FeedResponse {
  items: FeedItem[];
  nextCursor: string | null;
  total: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function relativeTime(ts: string): string {
  const delta = Date.now() - new Date(ts).getTime();
  if (delta < 60_000) return 'just now';
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`;
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h ago`;
  return `${Math.floor(delta / 86_400_000)}d ago`;
}

function levelColor(level: string) {
  if (level === 'green') return 'text-green-400';
  if (level === 'yellow') return 'text-yellow-400';
  return 'text-red-400';
}

function levelBg(level: string) {
  if (level === 'green') return 'bg-green-500/10 border-green-500/20';
  if (level === 'yellow') return 'bg-yellow-500/10 border-yellow-500/20';
  return 'bg-red-500/10 border-red-500/20';
}

function severityColor(s: string) {
  if (s === 'CRITICAL') return 'text-red-400';
  if (s === 'HIGH') return 'text-orange-400';
  if (s === 'MEDIUM') return 'text-yellow-400';
  return 'text-blue-400';
}

function eventTypeIcon(et: string) {
  if (et === 'deploy') return <Zap size={14} className="text-blue-400" />;
  if (et === 'incident') return <AlertCircle size={14} className="text-red-400" />;
  if (et === 'maintenance') return <Clock size={14} className="text-yellow-400" />;
  if (et === 'config') return <FileText size={14} className="text-purple-400" />;
  return <StickyNote size={14} className="text-text-secondary" />;
}

// ─── Feed Item Components ─────────────────────────────────────────────────────

function CheckFeedItem({ item }: { item: CheckItem }) {
  const router = useRouter();
  return (
    <div
      className={`flex items-start gap-3 px-4 py-3 rounded-xl border cursor-pointer hover:opacity-80 transition-opacity ${levelBg(item.level)}`}
      onClick={() => router.push(`/monitors/${item.monitorId}`)}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && router.push(`/monitors/${item.monitorId}`)}
      aria-label={`${item.monitorName} — ${item.message}`}
    >
      <div className="mt-0.5 flex-shrink-0">
        {item.level === 'green'
          ? <CheckCircle2 size={16} className="text-green-400" />
          : item.level === 'yellow'
          ? <AlertTriangle size={16} className="text-yellow-400" />
          : <AlertCircle size={16} className="text-red-400" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-text-primary truncate">{item.monitorName}</span>
          <Badge variant={item.level === 'green' ? 'success' : item.level === 'yellow' ? 'warning' : 'danger'} size="sm">
            {item.level === 'green' ? 'Recovered' : item.level === 'yellow' ? 'Degraded' : 'Down'}
          </Badge>
          {item.status > 0 && (
            <span className="text-xs text-text-muted font-mono">HTTP {item.status}</span>
          )}
          {item.latencyMs != null && (
            <span className="text-xs text-text-muted font-mono">{item.latencyMs}ms</span>
          )}
        </div>
        <p className="text-xs text-text-secondary mt-0.5 truncate">{item.message}</p>
      </div>
      <time className="text-xs text-text-muted flex-shrink-0 ml-2 mt-0.5" dateTime={item.ts}>
        {relativeTime(item.ts)}
      </time>
    </div>
  );
}

function EventFeedItem({ item }: { item: EventItem }) {
  const router = useRouter();
  return (
    <div
      className="flex items-start gap-3 px-4 py-3 rounded-xl border border-border/50 bg-surface-secondary cursor-pointer hover:opacity-80 transition-opacity"
      onClick={() => router.push(`/monitors/${item.monitorId}`)}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && router.push(`/monitors/${item.monitorId}`)}
      aria-label={`${item.monitorName} — ${item.message}`}
    >
      <div className="mt-0.5 flex-shrink-0">
        {eventTypeIcon(item.eventType)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-text-primary truncate">{item.monitorName}</span>
          <Badge variant="default" size="sm">{item.eventType}</Badge>
        </div>
        <p className="text-xs text-text-secondary mt-0.5">{item.message}</p>
      </div>
      <time className="text-xs text-text-muted flex-shrink-0 ml-2 mt-0.5" dateTime={item.ts}>
        {relativeTime(item.ts)}
      </time>
    </div>
  );
}

function IncidentFeedItem({ item }: { item: IncidentItem }) {
  const router = useRouter();
  const isOpen = item.status !== 'RESOLVED';
  return (
    <div
      className={`flex items-start gap-3 px-4 py-3 rounded-xl border cursor-pointer hover:opacity-80 transition-opacity ${isOpen ? 'bg-red-500/5 border-red-500/20' : 'bg-surface-secondary border-border/50'}`}
      onClick={() => router.push('/incidents')}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && router.push('/incidents')}
      aria-label={`Incident: ${item.title}`}
    >
      <div className="mt-0.5 flex-shrink-0">
        <Siren size={16} className={isOpen ? 'text-red-400' : 'text-text-muted'} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-text-primary truncate">{item.title}</span>
          <Badge variant={isOpen ? 'danger' : 'success'} size="sm">
            {item.status.replace('_', ' ')}
          </Badge>
          <span className={`text-xs font-medium ${severityColor(item.severity)}`}>{item.severity}</span>
        </div>
        {item.monitors.length > 0 && (
          <p className="text-xs text-text-secondary mt-0.5">
            Affects: {item.monitors.map(m => m.name).join(', ')}
            {item.monitors.length === 3 ? ' + more' : ''}
          </p>
        )}
      </div>
      <time className="text-xs text-text-muted flex-shrink-0 ml-2 mt-0.5" dateTime={item.ts}>
        {relativeTime(item.ts)}
      </time>
    </div>
  );
}

function FeedItemRenderer({ item }: { item: FeedItem }) {
  if (item.kind === 'check') return <CheckFeedItem item={item} />;
  if (item.kind === 'event') return <EventFeedItem item={item} />;
  return <IncidentFeedItem item={item} />;
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ActivityPage() {
  const router = useRouter();
  const [user, setUser] = useState<{ id: string } | null>(null);
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [level, setLevel] = useState<string>('');
  const [kinds, setKinds] = useState<string[]>(['check', 'event', 'incident']);
  const [showFilters, setShowFilters] = useState(false);
  const loaderRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getUser().then(u => {
      if (!u) { router.replace('/login'); return; }
      setUser(u);
    });
  }, [router]);

  const fetchFeed = useCallback(async (reset = false) => {
    if (!user) return;
    if (reset) setLoading(true); else setLoadingMore(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (!reset && cursor) params.set('cursor', cursor);
      if (level) params.set('level', level);
      if (kinds.length < 3) params.set('kinds', kinds.join(','));
      const res = await api<FeedResponse>(`/v1/dashboard/activity?${params}`, user.id);
      setItems(prev => reset ? res.items : [...prev, ...res.items]);
      setCursor(res.nextCursor);
      setHasMore(!!res.nextCursor);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load activity feed');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [user, cursor, level, kinds]);

  // Initial load + filter changes
  useEffect(() => {
    if (user) fetchFeed(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, level, kinds.join(',')]);

  // Infinite scroll
  useEffect(() => {
    if (!loaderRef.current || !hasMore) return;
    const observer = new IntersectionObserver(entries => {
      if (entries[0]?.isIntersecting && !loadingMore) {
        fetchFeed(false);
      }
    }, { threshold: 0.1 });
    observer.observe(loaderRef.current);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMore, loadingMore, loaderRef.current]);

  const toggleKind = (k: string) => {
    setKinds(prev => prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k]);
    setCursor(null);
  };

  if (!user) return null;

  return (
    <AppFrame>
      <div className="min-h-screen bg-background">
        <div className="max-w-3xl mx-auto px-4 py-8">
          <FadeIn>
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-accent/10 flex items-center justify-center">
                  <Activity size={18} className="text-accent" />
                </div>
                <div>
                  <h1 className="text-xl font-semibold text-text-primary">Activity Feed</h1>
                  <p className="text-sm text-text-secondary">Real-time log of checks, events &amp; incidents</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowFilters(f => !f)}
                  className="gap-1.5"
                  aria-expanded={showFilters}
                >
                  <Filter size={14} />
                  Filter
                  <ChevronDown size={12} className={`transition-transform ${showFilters ? 'rotate-180' : ''}`} />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setCursor(null); fetchFeed(true); }}
                  disabled={loading}
                  aria-label="Refresh feed"
                >
                  <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                </Button>
              </div>
            </div>

            {/* Filters Panel */}
            {showFilters && (
              <div className="mb-4 p-4 rounded-xl border border-border bg-surface-secondary flex flex-wrap gap-4">
                {/* Level filter */}
                <div>
                  <p className="text-xs text-text-muted mb-2 font-medium uppercase tracking-wider">Check Level</p>
                  <div className="flex gap-1.5">
                    {['', 'red', 'yellow', 'green'].map(l => (
                      <button
                        key={l || 'all'}
                        onClick={() => { setLevel(l); setCursor(null); }}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                          level === l
                            ? 'bg-accent text-white border-accent'
                            : 'bg-surface border-border text-text-secondary hover:border-accent/50'
                        }`}
                      >
                        {l === '' ? 'All' : l === 'red' ? '🔴 Down' : l === 'yellow' ? '🟡 Degraded' : '🟢 Recovered'}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Kinds filter */}
                <div>
                  <p className="text-xs text-text-muted mb-2 font-medium uppercase tracking-wider">Include</p>
                  <div className="flex gap-1.5">
                    {[
                      { k: 'check', label: 'Checks' },
                      { k: 'event', label: 'Events' },
                      { k: 'incident', label: 'Incidents' },
                    ].map(({ k, label }) => (
                      <button
                        key={k}
                        onClick={() => toggleKind(k)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                          kinds.includes(k)
                            ? 'bg-accent text-white border-accent'
                            : 'bg-surface border-border text-text-secondary hover:border-accent/50'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Feed */}
            {error && (
              <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 mb-4">
                {error}
              </div>
            )}

            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="h-[60px] rounded-xl bg-surface-secondary animate-pulse border border-border/50" />
                ))}
              </div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <Activity size={40} className="text-text-muted mb-4 opacity-40" />
                <p className="text-text-secondary font-medium">No activity yet</p>
                <p className="text-sm text-text-muted mt-1">Check events, monitor notes, and incidents will appear here.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {items.map(item => (
                  <FeedItemRenderer key={`${item.kind}-${item.id}`} item={item} />
                ))}
                {/* Infinite scroll sentinel */}
                <div ref={loaderRef} className="h-4" />
                {loadingMore && (
                  <div className="text-center py-4">
                    <RefreshCw size={16} className="animate-spin text-text-muted mx-auto" />
                  </div>
                )}
                {!hasMore && items.length > 0 && (
                  <p className="text-center text-xs text-text-muted py-4">You've reached the beginning of the feed.</p>
                )}
              </div>
            )}
          </FadeIn>
        </div>
      </div>
    </AppFrame>
  );
}

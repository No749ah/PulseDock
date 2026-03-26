'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Search,
  Monitor,
  AlertTriangle,
  Globe,
  GitBranch,
  Loader2,
  X,
  ArrowRight,
  FileText,
} from 'lucide-react';
import { AppFrame } from '../../components/app-frame';
import Link from 'next/link';
import { api } from '../../lib/api';
import { getUser } from '../../components/auth';

type SearchItem = {
  id: string;
  type: 'monitor' | 'incident' | 'status_page' | 'version';
  title: string;
  subtitle: string;
  url: string;
  status?: string;
  statusColor?: 'green' | 'yellow' | 'red' | 'blue' | 'gray';
};

type SearchResponse = {
  query: string;
  total: number;
  monitors: SearchItem[];
  incidents: SearchItem[];
  status_pages: SearchItem[];
  versions: SearchItem[];
};

const TYPE_CONFIG = {
  monitor: { label: 'Monitors', Icon: Monitor, color: 'text-blue-400' },
  incident: { label: 'Incidents', Icon: AlertTriangle, color: 'text-orange-400' },
  status_page: { label: 'Status Pages', Icon: Globe, color: 'text-green-400' },
  version: { label: 'Versions', Icon: GitBranch, color: 'text-purple-400' },
} as const;

const STATUS_COLOR_MAP: Record<string, string> = {
  green: 'bg-success',
  yellow: 'bg-warning',
  red: 'bg-danger animate-pulse',
  blue: 'bg-blue-400',
  gray: 'bg-border',
};

function StatusDot({ color }: { color?: SearchItem['statusColor'] }) {
  if (!color || color === 'gray') return null;
  return <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_COLOR_MAP[color] ?? 'bg-border'}`} />;
}

function ResultCard({ item }: { item: SearchItem }) {
  const { Icon, color } = TYPE_CONFIG[item.type];
  return (
    <Link
      href={item.url}
      className="flex items-center gap-4 p-4 rounded-xl border border-border bg-surface hover:bg-surface-elevated hover:border-accent/40 transition-all group"
    >
      <div className={`w-10 h-10 rounded-lg bg-surface-elevated flex items-center justify-center shrink-0 group-hover:bg-accent/10 transition-colors`}>
        <Icon className={`w-5 h-5 ${color}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-text-primary truncate">{item.title}</span>
          <StatusDot color={item.statusColor} />
          {item.status && item.status !== 'UNKNOWN' && (
            <span className="text-xs text-text-muted">{item.status}</span>
          )}
        </div>
        <span className="text-xs text-text-secondary truncate block">{item.subtitle}</span>
      </div>
      <ArrowRight className="w-4 h-4 text-text-muted opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
    </Link>
  );
}

function Section({ title, items, Icon, color }: { title: string; items: SearchItem[]; Icon: React.ComponentType<{ className?: string }>; color: string }) {
  if (items.length === 0) return null;
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Icon className={`w-4 h-4 ${color}`} />
        <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">{title}</h2>
        <span className="text-xs text-text-muted">({items.length})</span>
      </div>
      <div className="grid gap-2">
        {items.map((item) => (
          <ResultCard key={`${item.type}-${item.id}`} item={item} />
        ))}
      </div>
    </div>
  );
}

export default function SearchPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('q') ?? '');
  const [debouncedQuery, setDebouncedQuery] = useState(query);
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce query → debouncedQuery
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setDebouncedQuery(query), 300);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [query]);

  // Update URL when query changes
  useEffect(() => {
    const params = new URLSearchParams();
    if (debouncedQuery) params.set('q', debouncedQuery);
    router.replace(`/search${params.toString() ? '?' + params.toString() : ''}`, { scroll: false });
  }, [debouncedQuery, router]);

  // Fetch results
  const doSearch = useCallback(async (q: string) => {
    if (!q || q.length < 2) { setResults(null); return; }
    setLoading(true);
    setError('');
    try {
      const user = getUser();
      if (!user) { router.push('/login'); return; }
      const data = await api<SearchResponse>(`/v1/search?q=${encodeURIComponent(q)}&limit=20`, user.id);
      setResults(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Search failed');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void doSearch(debouncedQuery);
  }, [debouncedQuery, doSearch]);

  // Auto-focus on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const hasResults = results && results.total > 0;
  const hasQuery = debouncedQuery.length >= 2;

  return (
    <AppFrame title="Search" subtitle="Search across monitors, incidents, status pages, and versions">
      <div className="max-w-3xl mx-auto">
        {/* Search Input */}
        <div className="relative mb-8">
          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted">
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
          </div>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search monitors, incidents, status pages…"
            className="w-full pl-12 pr-12 py-4 text-base bg-surface border border-border rounded-2xl text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-shadow shadow-sm"
            autoComplete="off"
            spellCheck={false}
          />
          {query && (
            <button
              className="absolute right-4 top-1/2 -translate-y-1/2 p-1 text-text-muted hover:text-text-primary transition-colors"
              onClick={() => { setQuery(''); inputRef.current?.focus(); }}
              aria-label="Clear search"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* State: no query */}
        {!hasQuery && !loading && (
          <div className="text-center py-16">
            <div className="w-16 h-16 rounded-2xl bg-surface-elevated flex items-center justify-center mx-auto mb-4">
              <Search className="w-8 h-8 text-text-muted" />
            </div>
            <p className="text-text-secondary font-medium mb-2">Search everything</p>
            <p className="text-sm text-text-muted">
              Type at least 2 characters to search monitors, incidents, status pages, and version checks.
            </p>
            <div className="flex items-center justify-center gap-3 mt-6 text-xs text-text-muted">
              {Object.entries(TYPE_CONFIG).map(([key, { label, Icon, color }]) => (
                <span key={key} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border bg-surface-elevated">
                  <Icon className={`w-3.5 h-3.5 ${color}`} />
                  {label}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* State: error */}
        {error && (
          <div className="text-center py-8 text-danger">
            <p className="text-sm">{error}</p>
          </div>
        )}

        {/* State: no results */}
        {hasQuery && !loading && results && !hasResults && (
          <div className="text-center py-16">
            <div className="w-16 h-16 rounded-2xl bg-surface-elevated flex items-center justify-center mx-auto mb-4">
              <FileText className="w-8 h-8 text-text-muted" />
            </div>
            <p className="text-text-secondary font-medium mb-2">No results for &ldquo;{debouncedQuery}&rdquo;</p>
            <p className="text-sm text-text-muted">Try a different search term.</p>
          </div>
        )}

        {/* Results */}
        {hasResults && (
          <div className="space-y-8">
            {/* Summary */}
            <p className="text-sm text-text-secondary">
              <span className="font-medium text-text-primary">{results.total}</span> result{results.total !== 1 ? 's' : ''} for &ldquo;{results.query}&rdquo;
            </p>

            <Section title="Monitors" items={results.monitors} Icon={TYPE_CONFIG.monitor.Icon} color={TYPE_CONFIG.monitor.color} />
            <Section title="Incidents" items={results.incidents} Icon={TYPE_CONFIG.incident.Icon} color={TYPE_CONFIG.incident.color} />
            <Section title="Status Pages" items={results.status_pages} Icon={TYPE_CONFIG.status_page.Icon} color={TYPE_CONFIG.status_page.color} />
            <Section title="Version Checks" items={results.versions} Icon={TYPE_CONFIG.version.Icon} color={TYPE_CONFIG.version.color} />
          </div>
        )}
      </div>
    </AppFrame>
  );
}

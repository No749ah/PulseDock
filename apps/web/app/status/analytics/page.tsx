'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BarChart2, RefreshCw, Eye, Globe, Clock, Layers } from 'lucide-react';
import { AppFrame } from '../../../components/app-frame';
import { Card } from '../../components/Card';
import { getUser } from '../../../components/auth';
import { api } from '../../../lib/api';
import { useToast } from '../../../components/ui/toast';

type PageAnalytics = {
  id: string;
  title: string;
  slug: string;
  isPublished: boolean;
  viewCount: number;
  lastViewedAt: string | null;
  widgetCount: number;
  createdAt: string;
};

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function StatusPageAnalyticsPage() {
  const router = useRouter();
  const { error: showError } = useToast();
  const [data, setData] = useState<PageAnalytics[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const user = getUser();
    if (!user) { router.replace('/login'); return; }
    api<PageAnalytics[]>('/v1/status-pages/analytics', user.id)
      .then(setData)
      .catch(() => showError('Failed to load analytics'))
      .finally(() => setLoading(false));
  }, []);

  const totalViews = data.reduce((sum, p) => sum + p.viewCount, 0);
  const publishedPages = data.filter(p => p.isPublished).length;
  const mostViewed = data[0];

  return (
    <AppFrame title="Status Page Analytics">
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
            <BarChart2 className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Status Page Analytics</h1>
            <p className="text-sm text-zinc-400">View counts and engagement for your public status pages</p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24 text-zinc-500">
            <RefreshCw className="w-6 h-6 animate-spin mr-2" />
            Loading analytics...
          </div>
        ) : (
          <>
            {/* Summary */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Card className="p-4">
                <p className="text-xs text-zinc-400 uppercase tracking-wide flex items-center gap-1">
                  <Eye className="w-3 h-3" /> Total Views
                </p>
                <p className="text-2xl font-bold text-white mt-1">{totalViews.toLocaleString()}</p>
              </Card>
              <Card className="p-4">
                <p className="text-xs text-zinc-400 uppercase tracking-wide">Pages</p>
                <p className="text-2xl font-bold text-white mt-1">{data.length}</p>
              </Card>
              <Card className="p-4">
                <p className="text-xs text-zinc-400 uppercase tracking-wide flex items-center gap-1">
                  <Globe className="w-3 h-3 text-emerald-400" /> Published
                </p>
                <p className="text-2xl font-bold text-emerald-400 mt-1">{publishedPages}</p>
              </Card>
              <Card className="p-4">
                <p className="text-xs text-zinc-400 uppercase tracking-wide">Most Viewed</p>
                <p className="text-sm font-bold text-white mt-1 truncate" title={mostViewed?.title}>
                  {mostViewed ? `${mostViewed.title} (${mostViewed.viewCount})` : '—'}
                </p>
              </Card>
            </div>

            {/* Pages table */}
            {data.length === 0 ? (
              <Card className="p-8 text-center text-zinc-500">
                <Layers className="w-10 h-10 mx-auto mb-3 opacity-40" />
                <p className="text-sm">No status pages yet. Create one to start tracking views.</p>
              </Card>
            ) : (
              <Card className="overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800">
                      <th className="text-left px-4 py-3 text-zinc-400 font-medium">Page</th>
                      <th className="text-center px-4 py-3 text-zinc-400 font-medium">Status</th>
                      <th className="text-right px-4 py-3 text-zinc-400 font-medium">Views</th>
                      <th className="text-right px-4 py-3 text-zinc-400 font-medium">Widgets</th>
                      <th className="text-right px-4 py-3 text-zinc-400 font-medium">Last Viewed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.map(p => (
                      <tr
                        key={p.id}
                        className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors cursor-pointer"
                        onClick={() => router.push(`/status-pages/${p.id}`)}
                      >
                        <td className="px-4 py-3">
                          <p className="text-zinc-200 font-medium">{p.title}</p>
                          <p className="text-xs text-zinc-500">/{p.slug}</p>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`text-xs px-2 py-0.5 rounded ${p.isPublished ? 'bg-emerald-500/10 text-emerald-400' : 'bg-zinc-700 text-zinc-400'}`}>
                            {p.isPublished ? 'Published' : 'Draft'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="flex items-center justify-end gap-1">
                            <Eye className="w-3 h-3 text-zinc-500" />
                            <span className="text-zinc-200 font-medium">{p.viewCount.toLocaleString()}</span>
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-zinc-400">{p.widgetCount}</td>
                        <td className="px-4 py-3 text-right">
                          <span className="flex items-center justify-end gap-1 text-zinc-400">
                            <Clock className="w-3 h-3" />
                            {formatRelativeTime(p.lastViewedAt)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            )}
          </>
        )}
      </div>
    </AppFrame>
  );
}

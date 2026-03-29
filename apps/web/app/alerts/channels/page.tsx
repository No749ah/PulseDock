'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Bell,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  HelpCircle,
  Play,
  Loader2,
} from 'lucide-react';
import { AppFrame } from '../../../components/app-frame';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { getUser } from '../../../components/auth';
import { api } from '../../../lib/api';
import { useToast } from '../../../components/ui/toast';

type HealthStatus = 'healthy' | 'degraded' | 'failing' | 'untested';

interface ChannelHealth {
  channelId: string;
  name: string;
  type: string;
  enabled: boolean;
  totalDeliveries: number;
  successCount: number;
  failedCount: number;
  successRate: number;
  lastDeliveryAt: string | null;
  lastSuccessAt: string | null;
  lastErrorMessage: string | null;
  last24hCount: number;
  healthStatus: HealthStatus;
}

const STATUS_CONFIG: Record<HealthStatus, { icon: React.ReactNode; color: string; bg: string; label: string }> = {
  healthy:  { icon: <CheckCircle2 className="w-4 h-4" />, color: 'text-emerald-400', bg: 'bg-emerald-500/10', label: 'Healthy' },
  degraded: { icon: <AlertTriangle className="w-4 h-4" />, color: 'text-yellow-400', bg: 'bg-yellow-500/10', label: 'Degraded' },
  failing:  { icon: <XCircle className="w-4 h-4" />, color: 'text-red-400', bg: 'bg-red-500/10', label: 'Failing' },
  untested: { icon: <HelpCircle className="w-4 h-4" />, color: 'text-zinc-400', bg: 'bg-zinc-500/10', label: 'Untested' },
};

function relativeTime(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

export default function AlertChannelsHealthPage() {
  const router = useRouter();
  const { error: showError, success: showSuccess } = useToast();
  const [channels, setChannels] = useState<ChannelHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [testingAll, setTestingAll] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);

  const loadHealth = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<ChannelHealth[]>('/v1/alert-channels/channels/health');
      setChannels(data ?? []);
    } catch {
      showError('Failed to load channel health');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const user = getUser();
    if (!user) { router.replace('/login'); return; }
    loadHealth();
  }, []);

  async function testChannel(channelId: string) {
    setTestingId(channelId);
    try {
      await api('/v1/alert-channels/test', undefined, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId }),
      });
      showSuccess('Test notification sent');
      await loadHealth();
    } catch {
      showError('Test notification failed');
    } finally {
      setTestingId(null);
    }
  }

  async function testAll() {
    setTestingAll(true);
    try {
      const data = await api<{ results: Array<{ channelId: string; name: string; ok: boolean; error: string | null }> }>(
        '/v1/alert-channels/test-all', undefined, { method: 'POST' }
      );
      const results = data?.results ?? (data as unknown as Array<{ channelId: string; name: string; ok: boolean; error: string | null }>);
      const arr = Array.isArray(results) ? results : [];
      const ok = arr.filter(r => r.ok).length;
      const fail = arr.filter(r => !r.ok).length;
      if (fail === 0) {
        showSuccess(`All ${ok} channel(s) passed`);
      } else {
        showError(`${fail} channel(s) failed, ${ok} passed`);
      }
      await loadHealth();
    } catch {
      showError('Batch test failed');
    } finally {
      setTestingAll(false);
    }
  }

  const healthy = channels.filter(c => c.healthStatus === 'healthy').length;
  const degraded = channels.filter(c => c.healthStatus === 'degraded').length;
  const failing = channels.filter(c => c.healthStatus === 'failing').length;
  const untested = channels.filter(c => c.healthStatus === 'untested').length;

  return (
    <AppFrame title="Channel Health">
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Channel Health</h1>
              <p className="text-sm text-zinc-400">Delivery status for all alert channels — last 7 days</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={loadHealth} disabled={loading}>
              <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button variant="primary" size="sm" onClick={testAll} disabled={testingAll || channels.length === 0}>
              {testingAll ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Play className="w-4 h-4 mr-1" />}
              Test All
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24 text-zinc-500">
            <RefreshCw className="w-6 h-6 animate-spin mr-2" />
            Loading channel health...
          </div>
        ) : channels.length === 0 ? (
          <Card className="text-center py-16">
            <Bell className="w-12 h-12 mx-auto mb-4 text-zinc-600" />
            <p className="text-zinc-400 text-sm">No alert channels configured.</p>
            <p className="text-zinc-500 text-xs mt-1">Go to Alerts to create your first channel.</p>
          </Card>
        ) : (
          <>
            {/* Summary */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {([
                { displayLabel: 'Healthy', value: healthy, ...STATUS_CONFIG.healthy },
                { displayLabel: 'Degraded', value: degraded, ...STATUS_CONFIG.degraded },
                { displayLabel: 'Failing', value: failing, ...STATUS_CONFIG.failing },
                { displayLabel: 'Untested', value: untested, ...STATUS_CONFIG.untested },
              ] as const).map(stat => (
                <Card key={stat.displayLabel} className={`p-4 ${stat.bg}`}>
                  <div className={`flex items-center gap-2 ${stat.color}`}>
                    {stat.icon}
                    <span className="text-xs uppercase tracking-wide font-medium">{stat.displayLabel}</span>
                  </div>
                  <p className={`text-3xl font-bold mt-1 ${stat.color}`}>{stat.value}</p>
                </Card>
              ))}
            </div>

            {/* Channel list */}
            <Card className="overflow-hidden">
              <div className="px-4 py-3 border-b border-zinc-800">
                <h3 className="text-sm font-semibold text-zinc-300">Channel Status</h3>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="text-left px-4 py-3 text-zinc-400 font-medium">Channel</th>
                    <th className="text-center px-4 py-3 text-zinc-400 font-medium">Status</th>
                    <th className="text-right px-4 py-3 text-zinc-400 font-medium hidden sm:table-cell">7d Deliveries</th>
                    <th className="text-right px-4 py-3 text-zinc-400 font-medium hidden sm:table-cell">Success Rate</th>
                    <th className="text-right px-4 py-3 text-zinc-400 font-medium hidden md:table-cell">Last Delivery</th>
                    <th className="text-right px-4 py-3 text-zinc-400 font-medium hidden md:table-cell">Last Error</th>
                    <th className="text-right px-4 py-3 text-zinc-400 font-medium">Test</th>
                  </tr>
                </thead>
                <tbody>
                  {channels.map(c => {
                    const cfg = STATUS_CONFIG[c.healthStatus];
                    return (
                      <tr key={c.channelId} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-medium text-zinc-200">{c.name}</div>
                          <div className="text-xs text-zinc-500 capitalize">{c.type}</div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.color}`}>
                            {cfg.icon}
                            {cfg.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-zinc-300 hidden sm:table-cell">
                          <span className="font-mono">{c.totalDeliveries}</span>
                          {c.last24hCount > 0 && (
                            <span className="text-xs text-zinc-500 ml-1">({c.last24hCount} today)</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right hidden sm:table-cell">
                          {c.totalDeliveries === 0 ? (
                            <span className="text-zinc-500 text-xs">—</span>
                          ) : (
                            <div className="flex items-center justify-end gap-2">
                              <div className="w-16 bg-zinc-800 rounded-full h-1.5">
                                <div
                                  className={`h-1.5 rounded-full ${c.successRate >= 95 ? 'bg-emerald-500' : c.successRate >= 70 ? 'bg-yellow-400' : 'bg-red-500'}`}
                                  style={{ width: `${c.successRate}%` }}
                                />
                              </div>
                              <span className={`font-mono text-xs ${c.successRate >= 95 ? 'text-emerald-400' : c.successRate >= 70 ? 'text-yellow-400' : 'text-red-400'}`}>
                                {c.successRate}%
                              </span>
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-zinc-400 text-xs hidden md:table-cell">
                          {relativeTime(c.lastDeliveryAt)}
                        </td>
                        <td className="px-4 py-3 text-right hidden md:table-cell">
                          {c.lastErrorMessage ? (
                            <span className="text-xs text-red-400 max-w-32 truncate block text-right" title={c.lastErrorMessage}>
                              {c.lastErrorMessage.substring(0, 30)}{c.lastErrorMessage.length > 30 ? '…' : ''}
                            </span>
                          ) : (
                            <span className="text-zinc-600 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => testChannel(c.channelId)}
                            disabled={testingId === c.channelId}
                            title="Send test notification"
                          >
                            {testingId === c.channelId ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Play className="w-3.5 h-3.5" />
                            )}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>

            {/* Failed channels detail */}
            {channels.some(c => c.healthStatus === 'failing' && c.lastErrorMessage) && (
              <Card className="p-4 border border-red-500/20 bg-red-500/5">
                <h3 className="text-sm font-semibold text-red-400 mb-3 flex items-center gap-2">
                  <XCircle className="w-4 h-4" />
                  Failing Channels — Recent Errors
                </h3>
                <div className="space-y-2">
                  {channels.filter(c => c.healthStatus === 'failing' && c.lastErrorMessage).map(c => (
                    <div key={c.channelId} className="text-xs">
                      <span className="text-zinc-300 font-medium">{c.name}</span>
                      <span className="text-zinc-500 mx-2">—</span>
                      <span className="text-red-300">{c.lastErrorMessage}</span>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </>
        )}
      </div>
    </AppFrame>
  );
}

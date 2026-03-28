"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { GitMerge, Loader2, Info, AlertTriangle, TrendingUp, RefreshCw } from "lucide-react";
import { AppFrame } from "../../../components/app-frame";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { Badge } from "../../components/Badge";
import { getUser } from "../../../components/auth";
import { api } from "../../../lib/api";
import { useToast } from "../../../components/ui/toast";

interface CorrelationMonitor {
  id: string;
  name: string;
  type: string;
}

interface CorrelationPair {
  aId: string;
  bId: string;
  similarity: number;
  sharedWindows: number;
  aWindows: number;
  bWindows: number;
}

interface CorrelationGroup {
  monitorIds: string[];
  avgSimilarity: number;
  label: string;
}

interface CorrelationData {
  monitors: CorrelationMonitor[];
  pairs: CorrelationPair[];
  groups: CorrelationGroup[];
}

const PERIODS = [
  { label: "24h", days: 1 },
  { label: "7d", days: 7 },
  { label: "14d", days: 14 },
  { label: "30d", days: 30 },
];

function similarityColor(sim: number): string {
  if (sim >= 0.7) return "bg-red-500/20 text-red-400 border-red-500/30";
  if (sim >= 0.4) return "bg-amber-500/20 text-amber-400 border-amber-500/30";
  if (sim >= 0.2) return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
  return "bg-blue-500/20 text-blue-400 border-blue-500/30";
}

function similarityLabel(sim: number): string {
  if (sim >= 0.7) return "High";
  if (sim >= 0.4) return "Medium";
  if (sim >= 0.2) return "Low";
  return "Weak";
}

function SimilarityBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = value >= 0.7 ? "bg-red-500" : value >= 0.4 ? "bg-amber-500" : value >= 0.2 ? "bg-yellow-500" : "bg-blue-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-white/50 w-8 text-right">{pct}%</span>
    </div>
  );
}

export default function MonitorCorrelationPage() {
  const router = useRouter();
  const { error: toastError } = useToast();
  const [data, setData] = useState<CorrelationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(7);

  const load = useCallback(async (d: number) => {
    const user = await getUser();
    if (!user) { router.push("/login"); return; }
    setLoading(true);
    try {
      const res = await api<CorrelationData>(`/monitors/correlation?days=${d}`);
      setData(res);
    } catch {
      toastError("Failed to load correlation data");
    } finally {
      setLoading(false);
    }
  }, [router, toastError]);

  useEffect(() => { load(days); }, [days, load]);

  const monitorMap = new Map((data?.monitors ?? []).map(m => [m.id, m]));

  const statsCards = [
    { label: "Monitors Analyzed", value: data?.monitors.length ?? 0, icon: GitMerge },
    { label: "Correlated Pairs", value: data?.pairs.length ?? 0, icon: TrendingUp },
    { label: "Failure Clusters", value: data?.groups.length ?? 0, icon: AlertTriangle },
    {
      label: "Avg Similarity",
      value: data?.pairs.length
        ? `${Math.round((data.pairs.reduce((s, p) => s + p.similarity, 0) / data.pairs.length) * 100)}%`
        : "—",
      icon: Info,
    },
  ];

  return (
    <AppFrame>
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <GitMerge className="w-6 h-6 text-violet-400" />
              Failure Correlation
            </h1>
            <p className="text-white/50 text-sm mt-1">
              Monitors that fail together — identifies root cause candidates and cascading failure patterns.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Period selector */}
            <div className="flex bg-white/5 rounded-lg p-1 gap-1">
              {PERIODS.map(p => (
                <button
                  key={p.days}
                  onClick={() => setDays(p.days)}
                  className={`px-3 py-1 text-sm rounded-md transition-colors ${days === p.days ? "bg-violet-600 text-white" : "text-white/60 hover:text-white"}`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <Button variant="ghost" size="sm" onClick={() => load(days)} disabled={loading}>
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {statsCards.map(card => (
            <Card key={card.label} className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <card.icon className="w-4 h-4 text-violet-400" />
                <span className="text-xs text-white/50">{card.label}</span>
              </div>
              <div className="text-2xl font-bold text-white">
                {loading ? <Loader2 className="w-5 h-5 animate-spin text-white/30" /> : card.value}
              </div>
            </Card>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center items-center h-40">
            <Loader2 className="w-8 h-8 animate-spin text-violet-400" />
          </div>
        ) : !data || data.pairs.length === 0 ? (
          <Card className="p-12 text-center">
            <GitMerge className="w-12 h-12 text-white/20 mx-auto mb-4" />
            <p className="text-white/50 text-lg font-medium">No correlated failures found</p>
            <p className="text-white/30 text-sm mt-2">
              {data?.monitors.length === 0
                ? "No monitors found for your account."
                : `None of your ${data?.monitors.length} monitors have had correlated failures in the last ${days === 1 ? "24 hours" : `${days} days`}.`}
            </p>
          </Card>
        ) : (
          <>
            {/* Failure clusters */}
            {data.groups.length > 0 && (
              <Card className="p-5">
                <h2 className="text-sm font-semibold text-white/70 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  Failure Clusters
                  <span className="text-white/30 font-normal normal-case text-xs">(≥40% similarity)</span>
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {data.groups.map((group, i) => (
                    <div key={i} className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-amber-400">Cluster {i + 1}</span>
                        <Badge className="bg-amber-500/20 text-amber-400 text-xs">
                          {Math.round(group.avgSimilarity * 100)}% avg
                        </Badge>
                      </div>
                      <div className="space-y-1.5">
                        {group.monitorIds.map(id => {
                          const m = monitorMap.get(id);
                          return (
                            <button
                              key={id}
                              onClick={() => router.push(`/monitors/${id}`)}
                              className="flex items-center gap-2 w-full text-left hover:bg-white/5 rounded px-1 py-0.5 transition-colors"
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
                              <span className="text-sm text-white truncate">{m?.name ?? id}</span>
                              <span className="text-xs text-white/30 ml-auto">{m?.type}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Correlated pairs table */}
            <Card className="overflow-hidden">
              <div className="p-5 border-b border-white/5">
                <h2 className="text-sm font-semibold text-white/70 uppercase tracking-wider flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-violet-400" />
                  All Correlated Pairs
                  <span className="text-white/30 font-normal normal-case text-xs">(Jaccard similarity &gt;10%)</span>
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/5">
                      <th className="text-left p-4 text-white/50 font-medium">Monitor A</th>
                      <th className="text-left p-4 text-white/50 font-medium">Monitor B</th>
                      <th className="text-left p-4 text-white/50 font-medium w-40">Similarity</th>
                      <th className="text-right p-4 text-white/50 font-medium">Shared Windows</th>
                      <th className="text-right p-4 text-white/50 font-medium hidden md:table-cell">A Failures</th>
                      <th className="text-right p-4 text-white/50 font-medium hidden md:table-cell">B Failures</th>
                      <th className="text-center p-4 text-white/50 font-medium">Level</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.pairs.map((pair, i) => {
                      const a = monitorMap.get(pair.aId);
                      const b = monitorMap.get(pair.bId);
                      return (
                        <tr key={i} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                          <td className="p-4">
                            <button
                              onClick={() => router.push(`/monitors/${pair.aId}`)}
                              className="text-left hover:text-violet-400 transition-colors"
                            >
                              <div className="text-white font-medium truncate max-w-[180px]">{a?.name ?? pair.aId}</div>
                              <div className="text-xs text-white/30">{a?.type}</div>
                            </button>
                          </td>
                          <td className="p-4">
                            <button
                              onClick={() => router.push(`/monitors/${pair.bId}`)}
                              className="text-left hover:text-violet-400 transition-colors"
                            >
                              <div className="text-white font-medium truncate max-w-[180px]">{b?.name ?? pair.bId}</div>
                              <div className="text-xs text-white/30">{b?.type}</div>
                            </button>
                          </td>
                          <td className="p-4 w-40">
                            <SimilarityBar value={pair.similarity} />
                          </td>
                          <td className="p-4 text-right text-white/70">{pair.sharedWindows}</td>
                          <td className="p-4 text-right text-white/50 hidden md:table-cell">{pair.aWindows}</td>
                          <td className="p-4 text-right text-white/50 hidden md:table-cell">{pair.bWindows}</td>
                          <td className="p-4 text-center">
                            <Badge className={`text-xs border ${similarityColor(pair.similarity)}`}>
                              {similarityLabel(pair.similarity)}
                            </Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* Explanation */}
            <div className="flex items-start gap-3 p-4 rounded-lg bg-blue-500/5 border border-blue-500/20 text-sm text-blue-300">
              <Info className="w-4 h-4 mt-0.5 flex-shrink-0 text-blue-400" />
              <div>
                <strong>How it works:</strong> PulseDock groups check failures into 5-minute windows and computes Jaccard similarity
                for each monitor pair. A similarity of 1.0 means the two monitors always fail at the same time.
                High correlation suggests a shared root cause (same server, network segment, upstream dependency, or deployment).
              </div>
            </div>
          </>
        )}
      </div>
    </AppFrame>
  );
}

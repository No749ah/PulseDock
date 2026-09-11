'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AppFrame } from '../../../components/app-frame';
import { api } from '../../../lib/api';
import {
  Activity,
  AlertTriangle,
  Award,
  BarChart2,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Circle,
  Clock,
  Shield,
  TrendingDown,
  TrendingUp,
  Minus,
  XCircle,
  Zap,
} from 'lucide-react';

interface FleetReport {
  generatedAt: string;
  fleetScore: number;
  fleetGrade: string;
  summary: {
    total: number;
    enabled: number;
    up: number;
    degraded: number;
    down: number;
    noData: number;
  };
  reliabilityTiers: {
    tier: string;
    label: string;
    count: number;
    color: string;
    monitors: { id: string; name: string; uptimePct: number; score: number; grade: string }[];
  }[];
  atRisk: {
    id: string;
    name: string;
    reason: string;
    severity: 'critical' | 'high' | 'medium';
    uptimePct: number;
    score: number;
  }[];
  incidentVelocity: {
    last7d: number;
    last30d: number;
    trend: 'improving' | 'stable' | 'worsening';
    weeklyBreakdown: { week: string; count: number }[];
  };
  typeDistribution: { type: string; count: number; avgUptime: number }[];
  coverageGaps: {
    noAlertChannel: number;
    noSlaTarget: number;
    noDescription: number;
    totalGapScore: number;
  };
  topPerformers: { id: string; name: string; uptimePct: number; grade: string }[];
  worstPerformers: { id: string; name: string; uptimePct: number; grade: string }[];
}

function GradeCircle({ grade, score, size = 'lg' }: { grade: string; score: number; size?: 'sm' | 'lg' }) {
  const color =
    grade === 'A' ? 'text-green-400 border-green-400' :
    grade === 'B' ? 'text-blue-400 border-blue-400' :
    grade === 'C' ? 'text-yellow-400 border-yellow-400' :
    grade === 'D' ? 'text-orange-400 border-orange-400' :
    'text-red-400 border-red-400';
  const dim = size === 'lg' ? 'w-24 h-24 text-3xl' : 'w-8 h-8 text-sm';
  return (
    <div className={`rounded-full border-4 ${color} ${dim} flex flex-col items-center justify-center font-bold`}>
      <span>{grade}</span>
      {size === 'lg' && <span className="text-xs font-normal opacity-70">{score}/100</span>}
    </div>
  );
}

function SeverityBadge({ severity }: { severity: 'critical' | 'high' | 'medium' }) {
  const cls =
    severity === 'critical' ? 'bg-red-500/20 text-red-400 border-red-500/30' :
    severity === 'high' ? 'bg-orange-500/20 text-orange-400 border-orange-500/30' :
    'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium border ${cls} uppercase`}>
      {severity}
    </span>
  );
}

function TierBar({ tiers }: { tiers: FleetReport['reliabilityTiers'] }) {
  const total = tiers.reduce((a, t) => a + t.count, 0);
  if (total === 0) return <div className="text-white/40 text-sm">No data</div>;
  const colors: Record<string, string> = {
    green: 'bg-green-500',
    blue: 'bg-blue-500',
    yellow: 'bg-yellow-500',
    orange: 'bg-orange-500',
    red: 'bg-red-500',
  };
  return (
    <div className="flex w-full h-3 rounded-full overflow-hidden gap-0.5">
      {tiers.filter(t => t.count > 0).map(t => (
        <div
          key={t.tier}
          className={`${colors[t.color]} h-full`}
          style={{ width: `${(t.count / total) * 100}%` }}
          title={`${t.label}: ${t.count}`}
        />
      ))}
    </div>
  );
}

function IncidentSparkline({ breakdown }: { breakdown: { week: string; count: number }[] }) {
  const max = Math.max(...breakdown.map(b => b.count), 1);
  return (
    <div className="flex items-end gap-1 h-12">
      {breakdown.map((b, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1">
          <div
            className="w-full bg-purple-500/60 rounded-t"
            style={{ height: `${(b.count / max) * 40}px`, minHeight: b.count > 0 ? '4px' : '2px' }}
            title={`${b.week}: ${b.count} incidents`}
          />
          <span className="text-[10px] text-white/40">{b.week}</span>
        </div>
      ))}
    </div>
  );
}

function TierSection({ tier }: { tier: FleetReport['reliabilityTiers'][0] }) {
  const [open, setOpen] = useState(false);
  const colors: Record<string, string> = {
    green: 'text-green-400',
    blue: 'text-blue-400',
    yellow: 'text-yellow-400',
    orange: 'text-orange-400',
    red: 'text-red-400',
  };
  return (
    <div className="border border-white/10 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-3">
          <Circle className={`w-3 h-3 fill-current ${colors[tier.color]}`} />
          <span className="text-sm font-medium text-white">{tier.label}</span>
          <span className={`text-sm font-bold ${colors[tier.color]}`}>{tier.count}</span>
        </div>
        {tier.count > 0 && (
          open ? <ChevronDown className="w-4 h-4 text-white/40" /> : <ChevronRight className="w-4 h-4 text-white/40" />
        )}
      </button>
      {open && tier.monitors.length > 0 && (
        <div className="border-t border-white/10 divide-y divide-white/5">
          {tier.monitors.map(m => (
            <Link
              key={m.id}
              href={`/monitors/${m.id}`}
              className="flex items-center justify-between px-4 py-2 hover:bg-white/5 text-sm"
            >
              <span className="text-white/80">{m.name}</span>
              <div className="flex items-center gap-3">
                <span className="text-white/50">{m.uptimePct.toFixed(2)}%</span>
                <span className={`text-xs font-bold ${colors[tier.color]}`}>{m.grade}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default function FleetHealthPage() {
  const [report, setReport] = useState<FleetReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<FleetReport>('/v1/monitors/fleet-report')
      .then(setReport)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <AppFrame title="Fleet Health Report">
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-white/20 border-t-white/80 rounded-full animate-spin" />
        </div>
      </AppFrame>
    );
  }

  if (error || !report) {
    return (
      <AppFrame title="Fleet Health Report">
        <div className="flex flex-col items-center justify-center h-64 gap-3 text-white/50">
          <XCircle className="w-10 h-10" />
          <p>{error ?? 'Failed to load fleet report'}</p>
        </div>
      </AppFrame>
    );
  }

  const { summary, fleetScore, fleetGrade, reliabilityTiers, atRisk, incidentVelocity, typeDistribution, coverageGaps, topPerformers, worstPerformers } = report;

  const trendIcon =
    incidentVelocity.trend === 'improving' ? <TrendingDown className="w-4 h-4 text-green-400" /> :
    incidentVelocity.trend === 'worsening' ? <TrendingUp className="w-4 h-4 text-red-400" /> :
    <Minus className="w-4 h-4 text-white/50" />;

  const trendColor =
    incidentVelocity.trend === 'improving' ? 'text-green-400' :
    incidentVelocity.trend === 'worsening' ? 'text-red-400' :
    'text-white/50';

  const uptimeColor = (pct: number) =>
    pct >= 99.9 ? 'text-green-400' :
    pct >= 99 ? 'text-blue-400' :
    pct >= 95 ? 'text-yellow-400' :
    pct >= 90 ? 'text-orange-400' :
    'text-red-400';

  const coverageColor = (pct: number) =>
    pct <= 10 ? 'text-green-400' : pct <= 25 ? 'text-yellow-400' : 'text-red-400';

  return (
    <AppFrame title="Fleet Health Report">
      <div className="space-y-6 max-w-6xl mx-auto">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <Shield className="w-6 h-6 text-blue-400" />
              Fleet Health Report
            </h1>
            <p className="text-white/50 text-sm mt-1">
              Executive overview of {summary.total} monitors — generated {new Date(report.generatedAt).toLocaleString()}
            </p>
          </div>
        </div>

        {/* Top row: Fleet Score + Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
          {/* Fleet Score */}
          <div className="col-span-2 lg:col-span-2 bg-white/5 border border-white/10 rounded-xl p-6 flex items-center gap-6">
            <GradeCircle grade={fleetGrade} score={fleetScore} size="lg" />
            <div>
              <p className="text-white/50 text-sm">Fleet Score</p>
              <p className="text-3xl font-bold text-white">{fleetScore}<span className="text-base font-normal text-white/40">/100</span></p>
              <p className="text-white/50 text-xs mt-1">Based on last 30 days</p>
            </div>
          </div>

          {/* Summary stat cards */}
          {[
            { label: 'Total', value: summary.total, icon: <Activity className="w-4 h-4" />, color: 'text-white' },
            { label: 'Up', value: summary.up, icon: <CheckCircle className="w-4 h-4" />, color: 'text-green-400' },
            { label: 'Degraded', value: summary.degraded, icon: <AlertTriangle className="w-4 h-4" />, color: 'text-yellow-400' },
            { label: 'Down', value: summary.down, icon: <XCircle className="w-4 h-4" />, color: 'text-red-400' },
          ].map(s => (
            <div key={s.label} className="bg-white/5 border border-white/10 rounded-xl p-4">
              <div className={`flex items-center gap-1.5 ${s.color} mb-1`}>
                {s.icon}
                <span className="text-xs font-medium">{s.label}</span>
              </div>
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Reliability tiers */}
        <div className="bg-white/5 border border-white/10 rounded-xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <BarChart2 className="w-4 h-4 text-white/60" />
            <h2 className="font-semibold text-white">Reliability Tiers</h2>
          </div>
          <TierBar tiers={reliabilityTiers} />
          <div className="flex flex-wrap gap-3 mt-3 mb-5">
            {reliabilityTiers.map(t => (
              <span key={t.tier} className="text-xs text-white/50 flex items-center gap-1">
                <span className={`w-2 h-2 rounded-full inline-block bg-${t.color}-500`} />
                {t.label}: <strong className="text-white/70">{t.count}</strong>
              </span>
            ))}
          </div>
          <div className="space-y-2">
            {reliabilityTiers.filter(t => t.count > 0).map(t => (
              <TierSection key={t.tier} tier={t} />
            ))}
          </div>
        </div>

        {/* At-risk monitors + Incident velocity */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* At-risk */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle className="w-4 h-4 text-orange-400" />
              <h2 className="font-semibold text-white">At-Risk Monitors</h2>
              <span className="ml-auto text-xs text-white/40">{atRisk.length} monitors</span>
            </div>
            {atRisk.length === 0 ? (
              <div className="flex flex-col items-center py-8 text-white/40">
                <CheckCircle className="w-8 h-8 text-green-400 mb-2" />
                <p className="text-sm">All monitors above 99.9% uptime</p>
              </div>
            ) : (
              <div className="space-y-2">
                {atRisk.map(m => (
                  <Link
                    key={m.id}
                    href={`/monitors/${m.id}`}
                    className="flex items-center justify-between p-3 rounded-lg border border-white/10 hover:bg-white/5 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white truncate">{m.name}</p>
                      <p className="text-xs text-white/50">{m.reason}</p>
                    </div>
                    <div className="flex items-center gap-2 ml-3 shrink-0">
                      <span className={`text-xs font-mono ${uptimeColor(m.uptimePct)}`}>
                        {m.uptimePct.toFixed(2)}%
                      </span>
                      <SeverityBadge severity={m.severity} />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Incident velocity */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <Zap className="w-4 h-4 text-purple-400" />
              <h2 className="font-semibold text-white">Incident Velocity</h2>
              <div className={`ml-auto flex items-center gap-1 text-xs font-medium ${trendColor}`}>
                {trendIcon}
                {incidentVelocity.trend}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 mb-5">
              <div className="bg-white/5 rounded-lg p-3">
                <p className="text-xs text-white/50">Last 7 days</p>
                <p className="text-2xl font-bold text-white">{incidentVelocity.last7d}</p>
              </div>
              <div className="bg-white/5 rounded-lg p-3">
                <p className="text-xs text-white/50">Last 30 days</p>
                <p className="text-2xl font-bold text-white">{incidentVelocity.last30d}</p>
              </div>
            </div>
            <p className="text-xs text-white/40 mb-2">Weekly breakdown</p>
            <IncidentSparkline breakdown={incidentVelocity.weeklyBreakdown} />
          </div>
        </div>

        {/* Type distribution + Coverage gaps */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Type distribution */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <Activity className="w-4 h-4 text-blue-400" />
              <h2 className="font-semibold text-white">Monitor Types</h2>
            </div>
            {typeDistribution.length === 0 ? (
              <p className="text-white/40 text-sm py-4 text-center">No monitors</p>
            ) : (
              <div className="space-y-2">
                {typeDistribution.map(t => {
                  const maxCount = typeDistribution[0].count;
                  return (
                    <div key={t.type} className="flex items-center gap-3">
                      <span className="text-xs font-mono text-white/60 w-28 truncate">{t.type}</span>
                      <div className="flex-1 bg-white/10 rounded-full h-2 overflow-hidden">
                        <div
                          className="h-full bg-blue-500/60 rounded-full"
                          style={{ width: `${(t.count / maxCount) * 100}%` }}
                        />
                      </div>
                      <span className="text-xs text-white/50 w-6 text-right">{t.count}</span>
                      <span className={`text-xs w-14 text-right ${uptimeColor(t.avgUptime)}`}>
                        {t.avgUptime.toFixed(1)}%
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Coverage gaps */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <Shield className="w-4 h-4 text-yellow-400" />
              <h2 className="font-semibold text-white">Coverage Gaps</h2>
              <span className={`ml-auto text-sm font-bold ${coverageColor(coverageGaps.totalGapScore)}`}>
                {coverageGaps.totalGapScore}% gap
              </span>
            </div>
            <div className="space-y-3">
              {[
                { label: 'No Alert Channel', value: coverageGaps.noAlertChannel, icon: '🔕', desc: 'Will miss failures' },
                { label: 'No SLA Target', value: coverageGaps.noSlaTarget, icon: '📊', desc: 'No uptime commitment' },
                { label: 'No Description', value: coverageGaps.noDescription, icon: '📝', desc: 'Undocumented' },
              ].map(g => (
                <div key={g.label} className="flex items-center gap-3">
                  <span className="text-lg">{g.icon}</span>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-white/80">{g.label}</span>
                      <span className={`text-sm font-bold ${g.value > 0 ? 'text-orange-400' : 'text-green-400'}`}>
                        {g.value}
                      </span>
                    </div>
                    <p className="text-xs text-white/40">{g.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Top/Worst performers */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          <div className="bg-white/5 border border-white/10 rounded-xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <Award className="w-4 h-4 text-green-400" />
              <h2 className="font-semibold text-white">Top Performers</h2>
            </div>
            {topPerformers.length === 0 ? (
              <p className="text-white/40 text-sm py-4 text-center">No data yet</p>
            ) : (
              <div className="space-y-2">
                {topPerformers.map((m, i) => (
                  <Link key={m.id} href={`/monitors/${m.id}`} className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 transition-colors">
                    <span className="text-xs font-bold text-white/30 w-5 text-right">{i + 1}</span>
                    <span className="flex-1 text-sm text-white/80 truncate">{m.name}</span>
                    <span className={`text-xs font-mono ${uptimeColor(m.uptimePct)}`}>{m.uptimePct.toFixed(3)}%</span>
                    <span className="text-xs font-bold text-green-400">{m.grade}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white/5 border border-white/10 rounded-xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <Clock className="w-4 h-4 text-red-400" />
              <h2 className="font-semibold text-white">Needs Attention</h2>
            </div>
            {worstPerformers.length === 0 ? (
              <p className="text-white/40 text-sm py-4 text-center">No data yet</p>
            ) : (
              <div className="space-y-2">
                {worstPerformers.map((m, i) => (
                  <Link key={m.id} href={`/monitors/${m.id}`} className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 transition-colors">
                    <span className="text-xs font-bold text-white/30 w-5 text-right">{i + 1}</span>
                    <span className="flex-1 text-sm text-white/80 truncate">{m.name}</span>
                    <span className={`text-xs font-mono ${uptimeColor(m.uptimePct)}`}>{m.uptimePct.toFixed(3)}%</span>
                    <span className={`text-xs font-bold ${m.grade === 'F' ? 'text-red-400' : 'text-orange-400'}`}>{m.grade}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <p className="text-xs text-white/30 text-center pb-4">
          Report based on 30-day rolling window · {summary.enabled} of {summary.total} monitors enabled
        </p>
      </div>
    </AppFrame>
  );
}

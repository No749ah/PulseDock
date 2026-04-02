"use client";

import { Activity, TrendingUp, CheckCircle2, AlertCircle } from "lucide-react";
import { Card } from "../../components/Card";
import { StaggerList } from "../../components/StaggerList";
import { CountUp } from "../../components/CountUp";
import type { DashboardStats } from "../hooks/useDashboard";

interface UptimeSectionProps {
  stats: DashboardStats;
}

export function UptimeSection({ stats }: UptimeSectionProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Activity className="w-4 h-4 text-text-secondary" />
        <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wide">Uptime Monitoring</h2>
        <span className="text-xs text-text-secondary opacity-60">HTTP · TCP · SSL · Heartbeat</span>
      </div>
      <div data-tour="stats-row">
        <StaggerList className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-text-secondary text-sm mb-1">Monitors</p>
                <p className="text-3xl font-bold text-text-primary">
                  <CountUp value={`${stats.uptimeMonitors}`} duration={800} />
                </p>
              </div>
              <div className="p-3 rounded-xl bg-accent/10">
                <Activity className="w-6 h-6 text-accent" />
              </div>
            </div>
          </Card>
          <Card>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-text-secondary text-sm mb-1">Uptime</p>
                <p className="text-3xl font-bold text-text-primary">
                  <CountUp value={`${stats.uptimePct}%`} duration={1200} />
                </p>
              </div>
              <div className="p-3 rounded-xl bg-accent/10">
                <TrendingUp className="w-6 h-6 text-accent" />
              </div>
            </div>
          </Card>
          <Card>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-text-secondary text-sm mb-1">Operational</p>
                <p className="text-3xl font-bold text-success">
                  <CountUp value={`${stats.uptimeGreen}`} duration={900} />
                </p>
              </div>
              <div className="p-3 rounded-xl bg-success/10">
                <CheckCircle2 className="w-6 h-6 text-success" />
              </div>
            </div>
          </Card>
          <Card>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-text-secondary text-sm mb-1">Down / Degraded</p>
                <p className="text-3xl font-bold text-danger">
                  <CountUp value={`${stats.uptimeRed + stats.uptimeYellow}`} duration={800} />
                </p>
              </div>
              <div className={`p-3 rounded-xl ${stats.uptimeRed + stats.uptimeYellow > 0 ? "bg-danger/10" : "bg-surface-elevated"}`}>
                <AlertCircle className={`w-6 h-6 ${stats.uptimeRed + stats.uptimeYellow > 0 ? "text-danger" : "text-text-secondary"}`} />
              </div>
            </div>
          </Card>
        </StaggerList>
      </div>
    </div>
  );
}

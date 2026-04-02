"use client";

import { AlertTriangle, Shield } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import type { SloSummary } from "../hooks/useDashboard";

interface Props {
  sloSummary: SloSummary;
}

export function SloSection({ sloSummary }: Props) {
  const router = useRouter();
  const { summary, monitors } = sloSummary;

  if (summary.total === 0) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-text-primary flex items-center gap-2">
            <Shield className="w-5 h-5 text-accent" />
            SLO Health
          </h2>
          <p className="text-text-secondary text-sm mt-1">
            {summary.total} monitor{summary.total !== 1 ? "s" : ""} with SLA targets
          </p>
        </div>
        <Button variant="secondary" size="lg" onClick={() => router.push("/monitors")}>
          Manage SLOs →
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card className="p-4 text-center">
          <div className="text-3xl font-bold text-green-400">{summary.ok}</div>
          <div className="text-xs text-text-muted mt-1">Meeting SLO</div>
        </Card>
        <Card className="p-4 text-center">
          <div className="text-3xl font-bold text-yellow-400">{summary.warning}</div>
          <div className="text-xs text-text-muted mt-1">At Risk</div>
        </Card>
        <Card className="p-4 text-center">
          <div className="text-3xl font-bold text-red-400">{summary.breached}</div>
          <div className="text-xs text-text-muted mt-1">Breached</div>
        </Card>
      </div>

      <Card>
        <div className="divide-y divide-border">
          {monitors.map((m) => (
            <div
              key={m.monitorId}
              className="flex items-center justify-between px-4 py-3 hover:bg-surface-elevated/40 transition-colors cursor-pointer"
              onClick={() => router.push(`/monitors/${m.monitorId}`)}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${
                  m.status === "ok" ? "bg-green-400" : m.status === "warning" ? "bg-yellow-400" : "bg-red-400"
                }`} />
                <div className="min-w-0">
                  <div className="text-sm font-medium text-text-primary truncate">{m.name}</div>
                  <div className="text-xs text-text-muted">Target: {m.slaTarget}% · {m.periodDays}d window</div>
                </div>
              </div>
              <div className="flex items-center gap-4 shrink-0 ml-3">
                <div className="text-right hidden sm:block">
                  <div className={`text-sm font-bold tabular-nums ${m.actualUptime >= m.slaTarget ? "text-green-400" : "text-red-400"}`}>
                    {m.actualUptime.toFixed(2)}%
                  </div>
                  <div className="text-xs text-text-muted">actual</div>
                </div>
                <div className="hidden md:block text-right">
                  <div className="text-sm text-text-secondary tabular-nums">{m.budgetRemainingPct.toFixed(0)}%</div>
                  <div className="text-xs text-text-muted">budget left</div>
                </div>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
                  m.status === "ok" ? "bg-green-500/10 text-green-400 border-green-500/20" :
                  m.status === "warning" ? "bg-yellow-500/10 text-yellow-400 border-yellow-500/20" :
                  "bg-red-500/10 text-red-400 border-red-500/20"
                }`}>
                  {m.status === "ok" ? "OK" : m.status === "warning" ? "AT RISK" : "BREACHED"}
                </span>
                {m.hasLatencySli && (
                  <span title="Latency SLI configured">
                    <AlertTriangle className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

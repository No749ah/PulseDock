"use client";

import React from "react";
import { Card } from "../../../../components/Card";
import { relativeTime } from "../../../../components/timeUtils";

interface LinkedIncident {
  id: string;
  title: string;
  status: string;
  severity: string;
  autoCreated: boolean;
  createdAt: string;
  resolvedAt: string | null;
  durationSec: number | null;
}

interface Props {
  linkedIncidents: LinkedIncident[] | null;
}

export function LinkedIncidentsCard({ linkedIncidents }: Props) {
  if (!linkedIncidents || linkedIncidents.length === 0) return null;

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">Linked Incidents</h2>
        <a href="/incidents" className="text-xs text-accent hover:underline">View all →</a>
      </div>
      <div className="space-y-2">
        {linkedIncidents.slice(0, 5).map((inc) => (
          <a
            key={inc.id}
            href="/incidents"
            className="flex items-start justify-between gap-2 px-3 py-2 rounded-lg bg-surface-elevated/50 border border-border hover:border-border-strong hover:bg-surface-elevated transition-colors group"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${inc.status === "RESOLVED" ? "bg-success" : "bg-danger animate-pulse"}`} />
                <span className="text-xs font-medium text-text-primary truncate">{inc.title}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-text-muted">
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                  inc.severity === "CRITICAL" ? "bg-danger/15 text-danger" :
                  inc.severity === "HIGH" ? "bg-orange-500/15 text-orange-400" :
                  inc.severity === "MEDIUM" ? "bg-warning/15 text-warning" :
                  "bg-surface text-text-muted border border-border"
                }`}>{inc.severity}</span>
                <span>{inc.status === "RESOLVED" ? "Resolved" : "Open"}</span>
                {inc.autoCreated && <span className="text-text-muted">· auto</span>}
                {inc.durationSec !== null && (
                  <span>· {inc.durationSec < 60 ? `${inc.durationSec}s` : inc.durationSec < 3600 ? `${Math.round(inc.durationSec / 60)}m` : `${(inc.durationSec / 3600).toFixed(1)}h`}</span>
                )}
              </div>
            </div>
            <span className="text-xs text-text-muted whitespace-nowrap pt-0.5">{relativeTime(inc.createdAt)}</span>
          </a>
        ))}
        {linkedIncidents.length > 5 && (
          <p className="text-xs text-text-muted text-center py-1">+ {linkedIncidents.length - 5} more</p>
        )}
      </div>
    </Card>
  );
}

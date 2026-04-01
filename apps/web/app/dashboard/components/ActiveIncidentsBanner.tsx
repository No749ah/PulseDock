"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { FadeIn } from "../../components/FadeIn";
import type { ActiveIncident } from "../hooks/useDashboard";

interface ActiveIncidentsBannerProps {
  incidents: ActiveIncident[];
}

export function ActiveIncidentsBanner({ incidents }: ActiveIncidentsBannerProps) {
  if (incidents.length === 0) return null;
  return (
    <FadeIn>
      <div className="rounded-xl border border-danger/30 bg-danger/5 overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-danger/20 bg-danger/10">
          <AlertTriangle className="w-4 h-4 text-danger shrink-0" />
          <span className="text-sm font-semibold text-danger">
            {incidents.length} Active Incident{incidents.length !== 1 ? "s" : ""}
          </span>
        </div>
        <div className="divide-y divide-border/50">
          {incidents.map((inc) => (
            <Link
              key={inc.id}
              href={`/incidents/${inc.id}`}
              className="flex items-center gap-4 px-4 py-3 hover:bg-surface-elevated/50 transition-colors group"
            >
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${
                inc.severity === "CRITICAL" ? "bg-danger/20 text-danger" :
                inc.severity === "HIGH" ? "bg-warning/20 text-warning" :
                "bg-surface-elevated text-text-secondary"
              }`}>{inc.severity}</span>
              <span className="text-sm font-medium text-text-primary flex-1 truncate group-hover:text-accent transition-colors">
                {inc.title}
              </span>
              <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${
                inc.status === "INVESTIGATING" ? "bg-danger/10 text-danger" :
                inc.status === "IDENTIFIED" ? "bg-warning/10 text-warning" :
                "bg-success/10 text-success"
              }`}>{inc.status}</span>
              {inc.monitors.length > 0 && (
                <span className="text-xs text-text-secondary shrink-0 hidden sm:block">
                  {inc.monitors.map((m) => m.name).join(", ")}
                </span>
              )}
            </Link>
          ))}
        </div>
      </div>
    </FadeIn>
  );
}

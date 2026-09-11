"use client";

import { GitBranch, PackageCheck } from "lucide-react";
import { Card } from "../../components/Card";
import { StaggerList } from "../../components/StaggerList";
import { CountUp } from "../../components/CountUp";
import type { DashboardStats } from "../hooks/useDashboard";

interface VersionSectionProps {
  stats: DashboardStats;
}

export function VersionSection({ stats }: VersionSectionProps) {
  if (stats.versionMonitors === 0) return null;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <GitBranch className="w-4 h-4 text-text-secondary" />
        <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wide">Version Tracking</h2>
        <span className="text-xs text-text-secondary opacity-60">Git releases · Docker images</span>
      </div>
      <StaggerList className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-text-secondary text-sm mb-1">Tracked</p>
              <p className="text-3xl font-bold text-text-primary">
                <CountUp value={`${stats.versionMonitors}`} duration={800} />
              </p>
            </div>
            <div className="p-3 rounded-xl bg-accent/10">
              <GitBranch className="w-6 h-6 text-accent" />
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-text-secondary text-sm mb-1">Up to Date</p>
              <p className="text-3xl font-bold text-success">
                <CountUp value={`${stats.versionUpToDate}`} duration={900} />
              </p>
            </div>
            <div className="p-3 rounded-xl bg-success/10">
              <PackageCheck className="w-6 h-6 text-success" />
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-text-secondary text-sm mb-1">Updates Available</p>
              <p className="text-3xl font-bold text-warning">
                <CountUp value={`${stats.versionUpdateAvailable + stats.versionMajorBehind}`} duration={800} />
              </p>
              {stats.versionMajorBehind > 0 && (
                <p className="text-xs text-danger mt-1">
                  {stats.versionMajorBehind} major version{stats.versionMajorBehind !== 1 ? "s" : ""} behind
                </p>
              )}
            </div>
            <div className={`p-3 rounded-xl ${stats.versionUpdateAvailable + stats.versionMajorBehind > 0 ? "bg-warning/10" : "bg-surface-elevated"}`}>
              <GitBranch className={`w-6 h-6 ${stats.versionUpdateAvailable + stats.versionMajorBehind > 0 ? "text-warning" : "text-text-secondary"}`} />
            </div>
          </div>
        </Card>
      </StaggerList>
    </div>
  );
}

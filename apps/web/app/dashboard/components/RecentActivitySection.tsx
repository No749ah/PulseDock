"use client";

import { AlertCircle, CheckCircle2, Clock } from "lucide-react";
import { Badge } from "../../components/Badge";
import { Card } from "../../components/Card";
import { relativeTime } from "../../components/timeUtils";
import type { MonitorRun } from "../hooks/useDashboard";

interface Props {
  uptimeRuns: MonitorRun[];
}

export function RecentActivitySection({ uptimeRuns }: Props) {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-text-primary">Recent Activity</h2>
      {uptimeRuns.length === 0 ? (
        <Card className="text-center py-12">
          <div className="p-4 rounded-2xl bg-surface-elevated inline-block mb-4">
            <Clock className="w-10 h-10 text-text-secondary opacity-50" />
          </div>
          <p className="text-text-primary font-medium mb-1">No activity yet</p>
          <p className="text-text-secondary text-sm">Monitor runs will appear here once checks start running</p>
        </Card>
      ) : (
        <Card>
          <div className="space-y-1">
            {uptimeRuns.slice(0, 5).map((run) => (
              <div
                key={run.id}
                className="flex items-center justify-between py-3 px-3 rounded-lg hover:bg-surface-elevated/50 transition-colors border-b border-border last:border-b-0"
              >
                <div className="flex items-center gap-3">
                  {run.ok ? (
                    <div className="p-1.5 rounded-full bg-success/10">
                      <CheckCircle2 className="w-4 h-4 text-success" />
                    </div>
                  ) : (
                    <div className="p-1.5 rounded-full bg-danger/10">
                      <AlertCircle className="w-4 h-4 text-danger" />
                    </div>
                  )}
                  <div>
                    <p className="font-medium text-text-primary">{run.message}</p>
                    <p className="text-text-secondary text-xs">{relativeTime(run.checkedAt)}</p>
                  </div>
                </div>
                <Badge variant={run.ok ? "success" : "danger"}>{String(run.statusCode)}</Badge>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

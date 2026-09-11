"use client";

import { useState } from "react";
import { Activity, Download } from "lucide-react";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { type AuditLogEntry } from "./shared";

interface ActivityLogCardProps {
  auditLog: AuditLogEntry[];
  userId: string;
  toastSuccess: (msg: string) => void;
  toastError: (msg: string) => void;
}

export function ActivityLogCard({ auditLog, userId, toastSuccess, toastError }: ActivityLogCardProps) {
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditExpanded, setAuditExpanded] = useState(false);

  const handleExportAuditLog = async (format: "csv" | "json") => {
    if (!userId) return;
    try {
      setAuditLoading(true);
      const token = typeof window !== "undefined" ? localStorage.getItem(`pd_token_${userId}`) ?? "" : "";
      const res = await fetch(`/api/v1/auth/audit-log/export?format=${format}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
      toastSuccess("Audit log exported");
    } catch (e) {
      toastError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setAuditLoading(false);
    }
  };

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-surface-elevated">
            <Activity className="w-5 h-5 text-text-secondary" />
          </div>
          <h2 className="text-xl font-bold text-text-primary">Activity Log</h2>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleExportAuditLog("csv")}
            disabled={auditLoading}
            className="flex items-center gap-1.5 text-text-secondary hover:text-text-primary"
          >
            <Download className="w-4 h-4" />
            CSV
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleExportAuditLog("json")}
            disabled={auditLoading}
            className="flex items-center gap-1.5 text-text-secondary hover:text-text-primary"
          >
            <Download className="w-4 h-4" />
            JSON
          </Button>
        </div>
      </div>

      {auditLog.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-text-secondary text-sm">No activity recorded yet</p>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {(auditExpanded ? auditLog : auditLog.slice(0, 8)).map((entry) => (
              <div
                key={entry.id}
                className="flex items-start justify-between px-3 py-2.5 rounded-lg bg-surface-elevated/50 border border-border"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-text-primary font-mono">{entry.action}</p>
                  <p className="text-[11px] text-text-secondary mt-0.5">
                    {new Date(entry.createdAt).toLocaleString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
          {auditLog.length > 8 && (
            <button
              onClick={() => setAuditExpanded((v) => !v)}
              className="mt-3 text-xs text-accent hover:text-accent/80 transition-colors"
            >
              {auditExpanded ? "Show less" : `Show all ${auditLog.length} entries`}
            </button>
          )}
        </>
      )}
    </Card>
  );
}

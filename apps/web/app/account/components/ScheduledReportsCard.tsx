"use client";

import { useState } from "react";
import { Calendar } from "lucide-react";
import { api } from "../../../lib/api";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { type ScheduledReport } from "./shared";

interface ScheduledReportsCardProps {
  scheduledReport: ScheduledReport | null;
  reportLoaded: boolean;
  userId: string;
  toastSuccess: (msg: string) => void;
  toastError: (msg: string) => void;
}

export function ScheduledReportsCard({ scheduledReport, reportLoaded, userId, toastSuccess, toastError }: ScheduledReportsCardProps) {
  const [reportSaving, setReportSaving] = useState(false);
  const [reportForm, setReportForm] = useState<{ enabled: boolean; frequency: string; dayOfWeek: number; hourUtc: number }>({
    enabled: scheduledReport?.enabled ?? true,
    frequency: scheduledReport?.frequency ?? "weekly",
    dayOfWeek: scheduledReport?.dayOfWeek ?? 1,
    hourUtc: scheduledReport?.hourUtc ?? 8,
  });

  const handleSaveReport = async () => {
    if (!userId) return;
    try {
      setReportSaving(true);
      await api<ScheduledReport>("/v1/reports", userId, {
        method: "PUT",
        body: JSON.stringify(reportForm),
      });
      toastSuccess("Report settings saved");
    } catch (e) {
      toastError(e instanceof Error ? e.message : "Failed to save report settings");
    } finally {
      setReportSaving(false);
    }
  };

  return (
    <Card>
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2.5 rounded-xl bg-surface-elevated">
          <Calendar className="w-5 h-5 text-text-secondary" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-text-primary">Scheduled Reports</h2>
          <p className="text-sm text-text-secondary mt-0.5">Receive automatic uptime digests via email</p>
        </div>
        {reportSaving && (
          <span className="ml-auto flex items-center gap-1.5 text-xs text-text-secondary">
            <span className="animate-spin rounded-full h-3 w-3 border-2 border-accent border-t-transparent" />
            Saving…
          </span>
        )}
      </div>

      {!reportLoaded ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 rounded-lg bg-surface-elevated/50 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-5">
          {/* Enable toggle */}
          <div className="flex items-center justify-between px-4 py-3 rounded-lg bg-surface-elevated/50 border border-border">
            <div>
              <p className="text-sm font-medium text-text-primary">Enable scheduled reports</p>
              <p className="text-xs text-text-secondary mt-0.5">Send regular uptime digests to your email</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={reportForm.enabled}
              onClick={() => setReportForm((f) => ({ ...f, enabled: !f.enabled }))}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                reportForm.enabled ? "bg-accent" : "bg-surface-elevated border border-border"
              }`}
            >
              <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-md transform transition-transform ${reportForm.enabled ? "translate-x-5" : "translate-x-0"}`} />
            </button>
          </div>

          {reportForm.enabled && (
            <>
              {/* Frequency */}
              <div>
                <p className="text-sm font-medium text-text-secondary mb-3 uppercase tracking-wide">Frequency</p>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { value: "daily", label: "Daily", desc: "One email per day" },
                    { value: "weekly", label: "Weekly", desc: "One email per week" },
                  ].map(({ value, label, desc }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setReportForm((f) => ({ ...f, frequency: value }))}
                      className={`flex flex-col items-start gap-1 px-4 py-3 rounded-lg border text-left transition-colors ${
                        reportForm.frequency === value
                          ? "border-accent bg-accent/10 text-accent"
                          : "border-border bg-surface-elevated/50 text-text-secondary hover:border-accent/50"
                      }`}
                    >
                      <span className="font-medium text-sm">{label}</span>
                      <span className="text-xs opacity-70">{desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Day of week (weekly only) */}
                {reportForm.frequency === "weekly" && (
                  <div>
                    <label className="block text-xs font-medium text-text-secondary mb-1.5 uppercase tracking-wide">Day of Week</label>
                    <select
                      value={reportForm.dayOfWeek}
                      onChange={(e) => setReportForm((f) => ({ ...f, dayOfWeek: Number(e.target.value) }))}
                      className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
                    >
                      {["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((day, i) => (
                        <option key={i} value={i}>{day}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Time (UTC) */}
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1.5 uppercase tracking-wide">Send Time (UTC)</label>
                  <select
                    value={reportForm.hourUtc}
                    onChange={(e) => setReportForm((f) => ({ ...f, hourUtc: Number(e.target.value) }))}
                    className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
                  >
                    {Array.from({ length: 24 }, (_, i) => (
                      <option key={i} value={i}>{String(i).padStart(2, "0")}:00 UTC</option>
                    ))}
                  </select>
                </div>
              </div>
            </>
          )}

          {/* Last sent info */}
          {scheduledReport?.lastSentAt && (
            <p className="text-xs text-text-secondary">
              Last report sent:{" "}
              <span className="text-text-primary">{new Date(scheduledReport.lastSentAt).toLocaleString()}</span>
            </p>
          )}
          {scheduledReport && !scheduledReport.lastSentAt && (
            <p className="text-xs text-text-secondary">No reports sent yet — first report will arrive at the next scheduled time.</p>
          )}

          <div className="flex justify-end pt-2">
            <Button onClick={handleSaveReport} disabled={reportSaving}>
              {reportSaving ? "Saving…" : "Save Report Settings"}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

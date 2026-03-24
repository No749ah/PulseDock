"use client";

import { useRef, useState } from "react";
import { api } from "../../../lib/api";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { useToast } from "../../../components/ui/toast";

export function BackupRestoreCard() {
  const { success: toastSuccess, error: toastError } = useToast();
  const [exporting, setExporting] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restoreResult, setRestoreResult] = useState<{
    folders: { created: number; skipped: number };
    tags: { created: number; skipped: number };
    monitors: { created: number; skipped: number; errors: string[] };
    alertChannels: { created: number; skipped: number };
    statusPages: { created: number; skipped: number };
    settings: { updated: boolean };
  } | null>(null);
  const [showResult, setShowResult] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleExport() {
    setExporting(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/v1/settings/backup", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `pulsedock-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toastError("Export failed — try again");
    } finally {
      setExporting(false);
    }
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setRestoring(true);
    setRestoreResult(null);
    try {
      const text = await file.text();
      const doc = JSON.parse(text);
      const result = await api<typeof restoreResult>("/v1/settings/backup/restore", undefined, {
        method: "POST",

        body: JSON.stringify(doc),
      });
      setRestoreResult(result);
      setShowResult(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Restore failed";
      toastError(msg);
    } finally {
      setRestoring(false);
      // Reset file input
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <Card className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
          <svg className="w-5 h-5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
          </svg>
        </div>
        <div>
          <h2 className="text-xl font-bold text-text-primary">Backup &amp; Restore</h2>
          <p className="text-sm text-text-secondary mt-0.5">Export all your data or restore from a previous backup</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        {/* Export */}
        <div className="rounded-xl border border-border bg-surface-secondary p-4">
          <p className="text-sm font-semibold text-text-primary mb-1">Export Backup</p>
          <p className="text-xs text-text-secondary mb-3">
            Downloads all monitors, folders, tags, alert channels, and status pages as a portable JSON file.
          </p>
          <Button
            variant="primary"
            onClick={handleExport}
            disabled={exporting}
            className="w-full"
          >
            {exporting ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Exporting…
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download Backup
              </>
            )}
          </Button>
        </div>

        {/* Restore */}
        <div className="rounded-xl border border-border bg-surface-secondary p-4">
          <p className="text-sm font-semibold text-text-primary mb-1">Restore from Backup</p>
          <p className="text-xs text-text-secondary mb-3">
            Import from a previously exported JSON backup. Existing items are skipped — no duplicates created.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={handleFileSelect}
          />
          <Button
            variant="secondary"
            onClick={() => fileInputRef.current?.click()}
            disabled={restoring}
            className="w-full"
          >
            {restoring ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Restoring…
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l4-4m0 0l4 4m-4-4v12" />
                </svg>
                Select Backup File
              </>
            )}
          </Button>
        </div>
      </div>

      <p className="text-xs text-text-secondary/60">
        ⚠️ Backup excludes raw check history and audit logs. Status pages are always restored as unpublished.
      </p>

      {/* Restore Result Modal */}
      {showResult && restoreResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-surface border border-border rounded-2xl shadow-2xl max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-text-primary mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Restore Complete
            </h3>
            <div className="space-y-2 mb-4">
              {([
                ["Folders", restoreResult.folders],
                ["Tags", restoreResult.tags],
                ["Monitors", restoreResult.monitors],
                ["Alert Channels", restoreResult.alertChannels],
                ["Status Pages", restoreResult.statusPages],
              ] as const).map(([label, stats]) => (
                <div key={label} className="flex justify-between text-sm">
                  <span className="text-text-secondary">{label}</span>
                  <span className="text-text-primary font-medium">
                    <span className="text-success">{(stats as { created: number }).created} created</span>
                    {" · "}
                    <span className="text-text-secondary/60">{(stats as { skipped: number }).skipped} skipped</span>
                  </span>
                </div>
              ))}
            </div>
            {restoreResult.monitors.errors.length > 0 && (
              <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 mb-4">
                <p className="text-xs font-semibold text-danger mb-1">Monitor errors ({restoreResult.monitors.errors.length})</p>
                <ul className="text-xs text-danger/80 space-y-0.5">
                  {restoreResult.monitors.errors.slice(0, 5).map((e, i) => (
                    <li key={i} className="truncate">{e}</li>
                  ))}
                  {restoreResult.monitors.errors.length > 5 && (
                    <li className="text-danger">…and {restoreResult.monitors.errors.length - 5} more</li>
                  )}
                </ul>
              </div>
            )}
            <Button variant="primary" onClick={() => setShowResult(false)} className="w-full">
              Done
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

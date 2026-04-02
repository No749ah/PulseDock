"use client";

import { X, History } from "lucide-react";
import type { ApiHistoryEntry } from "./types";

interface VersionHistoryModalProps {
  apiHistory: ApiHistoryEntry[];
  apiHistoryLoading: boolean;
  restoringHistoryId: string | null;
  onClose: () => void;
  onRestore: (id: string) => void;
}

export function VersionHistoryModal({
  apiHistory,
  apiHistoryLoading,
  restoringHistoryId,
  onClose,
  onRestore,
}: VersionHistoryModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-surface shadow-2xl shadow-black/50 mx-4 max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-text-primary">Version History</h2>
            <p className="text-xs text-text-muted mt-0.5">
              Last 10 saves stored on server. One-click restore.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="overflow-y-auto p-4 space-y-2">
          {apiHistoryLoading ? (
            <div className="py-8 text-center text-sm text-text-secondary">
              <div className="animate-spin rounded-full h-6 w-6 border-2 border-accent border-t-transparent mx-auto mb-2" />
              <p>Loading history…</p>
            </div>
          ) : apiHistory.length === 0 ? (
            <div className="py-8 text-center text-sm text-text-secondary">
              <History className="h-8 w-8 mx-auto mb-2 text-text-muted/40" />
              <p>No server saves yet.</p>
              <p className="text-xs text-text-muted mt-1">
                Save your page to start tracking history.
              </p>
            </div>
          ) : (
            apiHistory.map((entry, i) => {
              const d = new Date(entry.savedAt);
              const dateLabel =
                d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
                " " +
                d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
              const widgetCount = Array.isArray(entry.layout?.widgets)
                ? entry.layout.widgets.length
                : 0;
              const isRestoring = restoringHistoryId === entry.id;
              return (
                <div
                  key={entry.id}
                  className="flex items-center justify-between rounded-xl border border-border bg-bg/60 px-4 py-3 group"
                >
                  <div>
                    <p className="text-xs font-medium text-text-primary flex items-center gap-2">
                      {i === 0 && (
                        <span className="text-[10px] rounded-full bg-accent/15 text-accent px-1.5 py-0.5 font-semibold">
                          Latest
                        </span>
                      )}
                      {entry.label ? (
                        <span className="text-[10px] text-text-muted italic">{entry.label}</span>
                      ) : null}
                      {dateLabel}
                    </p>
                    <p className="text-[10px] text-text-muted mt-0.5">
                      {widgetCount} widget{widgetCount !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <button
                    onClick={() => onRestore(entry.id)}
                    disabled={isRestoring}
                    className="rounded-lg border border-border bg-bg px-3 py-1.5 text-xs font-medium text-text-secondary hover:border-accent/50 hover:text-accent transition opacity-0 group-hover:opacity-100 disabled:opacity-50"
                  >
                    {isRestoring ? "Restoring…" : "Restore"}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

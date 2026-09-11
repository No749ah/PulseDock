"use client";

import { useEffect, useState } from "react";
import { Database, Info, Save } from "lucide-react";
import { api } from "../../../lib/api";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";

const RETENTION_OPTIONS = [
  { value: 7, label: "7 days" },
  { value: 30, label: "30 days" },
  { value: 90, label: "90 days" },
  { value: 365, label: "1 year" },
] as const;

interface StorageStats {
  rawRunsTotal: number;
  rollupBucketsTotal: number;
  oldestRawRunAt: string | null;
  newestRawRunAt: string | null;
}

export function DataRetentionCard({ onSave }: { onSave: () => void }) {
  const [showForm, setShowForm] = useState(false);
  const [selected, setSelected] = useState<7 | 30 | 90 | 365>(90);
  const [rollupEnabled, setRollupEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [currentDays, setCurrentDays] = useState<number>(90);
  const [storageStats, setStorageStats] = useState<StorageStats | null>(null);

  useEffect(() => {
    api<{ retentionDays: number; rollupEnabled: boolean }>("/v1/settings/retention")
      .then((data) => {
        const days = data.retentionDays as 7 | 30 | 90 | 365;
        setSelected(days);
        setCurrentDays(days);
        setRollupEnabled(data.rollupEnabled ?? true);
      })
      .catch(() => {/* silently fall back to defaults */});

    api<StorageStats>("/v1/settings/storage")
      .then(setStorageStats)
      .catch(() => {/* storage stats non-critical */});
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api<{ retentionDays: number }>("/v1/settings/retention", undefined, {
        method: "PUT",

        body: JSON.stringify({ retentionDays: selected, rollupEnabled }),
      });
      setCurrentDays(selected);
      setShowForm(false);
      onSave();
    } catch {
      setCurrentDays(selected);
      setShowForm(false);
      onSave();
    } finally {
      setSaving(false);
    }
  };

  const currentLabel = RETENTION_OPTIONS.find((o) => o.value === currentDays)?.label ?? `${currentDays} days`;

  return (
    <Card>
      <div className="flex items-center gap-3 mb-5">
        <div className="p-2.5 rounded-xl bg-surface-elevated">
          <Database className="w-5 h-5 text-text-secondary" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-text-primary">Data Retention</h2>
          <p className="text-sm text-text-secondary mt-0.5">Control how long historical check data is stored</p>
        </div>
      </div>

      {/* Storage stats */}
      {storageStats && (
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="p-3 rounded-lg bg-surface-elevated/50 border border-border">
            <p className="text-xs text-text-secondary mb-1">Raw Check Records</p>
            <p className="text-lg font-bold text-text-primary">{storageStats.rawRunsTotal.toLocaleString()}</p>
            {storageStats.oldestRawRunAt && (
              <p className="text-[10px] text-text-muted mt-0.5">
                Oldest: {new Date(storageStats.oldestRawRunAt).toLocaleDateString()}
              </p>
            )}
          </div>
          <div className="p-3 rounded-lg bg-surface-elevated/50 border border-border">
            <p className="text-xs text-text-secondary mb-1">Daily Rollup Buckets</p>
            <p className="text-lg font-bold text-text-primary">{storageStats.rollupBucketsTotal.toLocaleString()}</p>
            <p className="text-[10px] text-text-muted mt-0.5">Aggregated historical data</p>
          </div>
        </div>
      )}

      <div className="flex items-start gap-3 p-4 rounded-lg bg-surface-elevated/50 border border-border mb-4">
        <Info className="w-4 h-4 text-accent shrink-0 mt-0.5" />
        <p className="text-sm text-text-secondary">
          Raw check history is retained for <span className="text-text-primary font-medium">{currentLabel}</span>.{" "}
          {rollupEnabled
            ? "Data older than 7 days is aggregated into daily summaries before deletion."
            : "Older data is deleted without aggregation."}
        </p>
      </div>

      {!showForm ? (
        <Button variant="secondary" onClick={() => setShowForm(true)} className="flex items-center gap-2">
          Configure
        </Button>
      ) : (
        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium text-text-secondary mb-3">Retention Period</p>
            <div className="flex flex-wrap gap-2">
              {RETENTION_OPTIONS.map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => setSelected(value)}
                  className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    selected === value
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-border bg-surface-elevated text-text-secondary hover:border-accent/50 hover:text-text-primary"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Rollup toggle */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-surface-elevated/50 border border-border">
            <div>
              <p className="text-sm font-medium text-text-primary">Aggregate old data</p>
              <p className="text-xs text-text-secondary mt-0.5">
                Roll up data older than 7 days into daily summaries. Reduces storage while preserving trends.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={rollupEnabled}
              onClick={() => setRollupEnabled((v) => !v)}
              className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${
                rollupEnabled ? "bg-accent" : "bg-surface-hover"
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                  rollupEnabled ? "translate-x-[18px]" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>

          <div className="flex items-center gap-3">
            <Button onClick={handleSave} disabled={saving} className="flex items-center gap-2">
              {saving ? (
                <>
                  <span className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                  Saving…
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Save
                </>
              )}
            </Button>
            <Button variant="secondary" onClick={() => setShowForm(false)} disabled={saving}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

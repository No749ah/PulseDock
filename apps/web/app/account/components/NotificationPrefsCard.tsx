"use client";

import { useState } from "react";
import { Bell, Clock } from "lucide-react";
import { api } from "../../../lib/api";
import { Card } from "../../components/Card";
import { type NotificationPreference } from "./shared";

interface NotificationPrefsCardProps {
  notifPrefs: NotificationPreference | null;
  userId: string;
  onPrefsChange: (prefs: NotificationPreference) => void;
  toastError: (msg: string) => void;
}

export function NotificationPrefsCard({ notifPrefs, userId, onPrefsChange, toastError }: NotificationPrefsCardProps) {
  const [notifSaving, setNotifSaving] = useState(false);

  const handleUpdateNotifPrefs = async (patch: Partial<NotificationPreference>) => {
    if (!userId || !notifPrefs) return;
    const optimistic = { ...notifPrefs, ...patch };
    onPrefsChange(optimistic);
    try {
      setNotifSaving(true);
      const updated = await api<NotificationPreference>("/v1/notification-preferences", userId, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      onPrefsChange(updated);
    } catch (e) {
      onPrefsChange(notifPrefs); // rollback
      toastError(e instanceof Error ? e.message : "Failed to save preferences");
    } finally {
      setNotifSaving(false);
    }
  };

  return (
    <Card>
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2.5 rounded-xl bg-surface-elevated">
          <Bell className="w-5 h-5 text-text-secondary" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-text-primary">Notification Preferences</h2>
          <p className="text-sm text-text-secondary mt-0.5">Control when and how you receive alert notifications</p>
        </div>
        {notifSaving && (
          <span className="ml-auto flex items-center gap-1.5 text-xs text-text-secondary">
            <span className="animate-spin rounded-full h-3 w-3 border-2 border-accent border-t-transparent" />
            Saving…
          </span>
        )}
      </div>

      {!notifPrefs ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 rounded-lg bg-surface-elevated/50 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Alert event toggles */}
          <div>
            <p className="text-sm font-medium text-text-secondary mb-3 uppercase tracking-wide">Alert Events</p>
            <div className="space-y-3">
              {[
                { key: "notifyOnDown" as const, label: "Monitor goes down", desc: "Trigger alerts when a monitor reports a failure" },
                { key: "notifyOnRecovery" as const, label: "Monitor recovers", desc: "Trigger alerts when a monitor comes back up" },
                { key: "notifyOnDegraded" as const, label: "Monitor degraded", desc: "Trigger alerts for slow / warning-level checks" },
              ].map(({ key, label, desc }) => (
                <div key={key} className="flex items-center justify-between px-4 py-3 rounded-lg bg-surface-elevated/50 border border-border">
                  <div>
                    <p className="text-sm font-medium text-text-primary">{label}</p>
                    <p className="text-xs text-text-secondary mt-0.5">{desc}</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={notifPrefs[key]}
                    onClick={() => handleUpdateNotifPrefs({ [key]: !notifPrefs[key] })}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                      notifPrefs[key] ? "bg-accent" : "bg-surface-elevated border border-border"
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-md transform transition-transform ${
                        notifPrefs[key] ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Frequency */}
          <div>
            <p className="text-sm font-medium text-text-secondary mb-3 uppercase tracking-wide">Delivery Frequency</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { value: "instant", label: "Instant", desc: "Send immediately when triggered" },
                { value: "hourly_digest", label: "Hourly Digest", desc: "Batch into hourly summaries" },
                { value: "daily_digest", label: "Daily Digest", desc: "One summary email per day" },
              ].map(({ value, label, desc }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => handleUpdateNotifPrefs({ frequency: value })}
                  className={`flex flex-col items-start gap-1 px-4 py-3 rounded-lg border text-left transition-colors ${
                    notifPrefs.frequency === value
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

          {/* Quiet Hours */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-text-secondary" />
                <p className="text-sm font-medium text-text-secondary uppercase tracking-wide">Quiet Hours</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={notifPrefs.quietHoursEnabled}
                onClick={() => handleUpdateNotifPrefs({ quietHoursEnabled: !notifPrefs.quietHoursEnabled })}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                  notifPrefs.quietHoursEnabled ? "bg-accent" : "bg-surface-elevated border border-border"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-md transform transition-transform ${
                    notifPrefs.quietHoursEnabled ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
            {notifPrefs.quietHoursEnabled && (
              <div className="flex items-center gap-4 px-4 py-3 rounded-lg bg-surface-elevated/50 border border-border">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-text-secondary mb-1">Start (UTC hour)</label>
                  <select
                    value={notifPrefs.quietHoursStart}
                    onChange={(e) => handleUpdateNotifPrefs({ quietHoursStart: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
                  >
                    {Array.from({ length: 24 }, (_, i) => (
                      <option key={i} value={i}>{String(i).padStart(2, "0")}:00</option>
                    ))}
                  </select>
                </div>
                <span className="text-text-secondary text-sm pt-4">to</span>
                <div className="flex-1">
                  <label className="block text-xs font-medium text-text-secondary mb-1">End (UTC hour)</label>
                  <select
                    value={notifPrefs.quietHoursEnd}
                    onChange={(e) => handleUpdateNotifPrefs({ quietHoursEnd: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
                  >
                    {Array.from({ length: 24 }, (_, i) => (
                      <option key={i} value={i}>{String(i).padStart(2, "0")}:00</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
            {notifPrefs.quietHoursEnabled && (
              <p className="text-xs text-text-secondary mt-2">
                Notifications will be suppressed between{" "}
                <strong className="text-text-primary">
                  {String(notifPrefs.quietHoursStart).padStart(2, "0")}:00
                </strong>{" "}
                and{" "}
                <strong className="text-text-primary">
                  {String(notifPrefs.quietHoursEnd).padStart(2, "0")}:00 UTC
                </strong>
              </p>
            )}
          </div>
        </div>
      )}

      {/* Alert Storm Protection */}
      <div className="pt-4 border-t border-border">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-text-primary">Alert Storm Protection</p>
            <p className="text-xs text-text-secondary mt-0.5">
              Suppress alerts when too many fire in a short window. Prevents notification floods during major incidents.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={notifPrefs!.alertStormProtection ?? false}
            onClick={() => handleUpdateNotifPrefs({ alertStormProtection: !(notifPrefs!.alertStormProtection ?? false) })}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
              (notifPrefs!.alertStormProtection ?? false) ? "bg-accent" : "bg-surface-elevated border border-border"
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ${
                (notifPrefs!.alertStormProtection ?? false) ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>
        {(notifPrefs!.alertStormProtection ?? false) && (
          <div className="mt-3 flex items-center gap-3">
            <label className="text-xs font-medium text-text-secondary whitespace-nowrap">Max alerts per 10 minutes:</label>
            <input
              type="number"
              min={1}
              max={100}
              value={notifPrefs!.alertStormThreshold ?? 10}
              onChange={(e) => handleUpdateNotifPrefs({ alertStormThreshold: Math.max(1, Math.min(100, Number(e.target.value))) })}
              className="w-20 px-3 py-1.5 text-sm rounded-xl border border-border bg-surface text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <p className="text-xs text-text-muted">
              Alerts beyond this limit are suppressed for 10 min.
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}

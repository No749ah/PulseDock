'use client';

import React, { useState } from "react";
import { Bell, BellOff, AlertCircle, X, Plus } from "lucide-react";
import { Button } from "../../components/Button";
import type { MonitorItem, AlertChannel } from "../types";
import { CHANNEL_TYPE_COLORS, UPTIME_NOTIFY_OPTIONS, VERSION_NOTIFY_OPTIONS } from "../constants";

interface AlertPanelProps {
  monitor: MonitorItem;
  assignedChannels: AlertChannel[];
  unassignedChannels: AlertChannel[];
  allChannels: AlertChannel[];
  loading: boolean;
  error: string;
  onClose: () => void;
  onAssign: (channelId: string) => void;
  onUnassign: (channelId: string) => void;
  onUpdateNotifyOn: (channelId: string, notifyOn: string, repeatIntervalMin?: number | null) => void;
}

export function AlertPanel({
  monitor,
  assignedChannels,
  unassignedChannels,
  allChannels,
  loading,
  error,
  onClose,
  onAssign,
  onUnassign,
  onUpdateNotifyOn,
}: AlertPanelProps) {
  // Track local repeat interval state per channel
  const [repeatIntervals, setRepeatIntervals] = useState<Record<string, number>>({});

  const getRepeatInterval = (channel: AlertChannel): number => {
    if (repeatIntervals[channel.id] !== undefined) return repeatIntervals[channel.id];
    return (channel as AlertChannel & { repeatIntervalMin?: number | null }).repeatIntervalMin ?? 30;
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="alert-panel-title"
        className="relative w-full max-w-md bg-background border-l border-border shadow-2xl flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-accent/10">
              <Bell className="w-4 h-4 text-accent" />
            </div>
            <div>
              <h3 id="alert-panel-title" className="text-base font-semibold text-text-primary">Alert Channels</h3>
              <p className="text-xs text-text-secondary truncate max-w-[200px]">{monitor.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-surface-elevated transition-colors text-text-secondary hover:text-text-primary"
            aria-label="Close alert channels panel"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-danger/10 border border-danger/20">
              <AlertCircle className="w-4 h-4 text-danger mt-0.5 shrink-0" />
              <span className="text-danger text-xs">{error}</span>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-accent border-t-transparent" />
            </div>
          ) : (
            <>
              {/* Assigned channels */}
              <div>
                <h4 className="text-sm font-medium text-text-secondary uppercase tracking-wider mb-3">
                  Assigned ({assignedChannels.length})
                </h4>
                {assignedChannels.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 rounded-xl border border-dashed border-border text-center">
                    <BellOff className="w-8 h-8 text-text-secondary opacity-40 mb-2" />
                    <p className="text-sm text-text-secondary">No channels assigned</p>
                    <p className="text-xs text-text-secondary opacity-60 mt-1">
                      Add channels below to receive alerts
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {assignedChannels.map((channel) => {
                      const isVersion = monitor.type === "GIT_RELEASE" || monitor.type === "DOCKER_IMAGE";
                      const options = isVersion ? VERSION_NOTIFY_OPTIONS : UPTIME_NOTIFY_OPTIONS;
                      const currentNotifyOn = channel.notifyOn ?? (isVersion ? "VERSION_ANY" : "ON_CHANGE");
                      const isRepeatMode = currentNotifyOn === "REPEAT_EVERY_N";
                      const repeatMin = getRepeatInterval(channel);

                      return (
                        <div key={channel.id} className="rounded-lg bg-surface-elevated border border-border/50 overflow-hidden">
                          <div className="flex items-center justify-between px-3 pt-3 pb-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className={`text-[11px] font-bold uppercase tracking-wide ${CHANNEL_TYPE_COLORS[channel.type] ?? "text-text-secondary"}`}>
                                {channel.type}
                              </span>
                              <span className="text-sm text-text-primary truncate">{channel.name}</span>
                            </div>
                            <button
                              onClick={() => onUnassign(channel.id)}
                              className="ml-2 p-1 rounded hover:bg-danger/10 text-text-secondary hover:text-danger transition-colors shrink-0"
                              title="Remove"
                              aria-label={`Remove ${channel.name}`}
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                          <div className="px-3 pb-3 space-y-2">
                            <div>
                              <label className="block text-[10px] text-text-secondary uppercase tracking-wide mb-1">Notify when</label>
                              <select
                                value={currentNotifyOn}
                                onChange={(e) => {
                                  const newVal = e.target.value;
                                  if (newVal === "REPEAT_EVERY_N") {
                                    onUpdateNotifyOn(channel.id, newVal, repeatMin);
                                  } else {
                                    onUpdateNotifyOn(channel.id, newVal, null);
                                  }
                                }}
                                className="w-full text-xs bg-bg border border-border rounded-lg px-2 py-1.5 text-text-primary focus:outline-none focus:border-accent"
                              >
                                {options.map((o) => (
                                  <option key={o.value} value={o.value}>{o.label}</option>
                                ))}
                              </select>
                            </div>
                            {isRepeatMode && (
                              <div className="flex items-center gap-2">
                                <label className="text-[10px] text-text-secondary uppercase tracking-wide whitespace-nowrap">
                                  Interval (min)
                                </label>
                                <input
                                  type="number"
                                  min={1}
                                  max={1440}
                                  value={repeatMin}
                                  onChange={(e) => {
                                    const val = Math.min(1440, Math.max(1, parseInt(e.target.value) || 30));
                                    setRepeatIntervals((prev) => ({ ...prev, [channel.id]: val }));
                                  }}
                                  onBlur={() => {
                                    onUpdateNotifyOn(channel.id, "REPEAT_EVERY_N", repeatMin);
                                  }}
                                  className="w-20 text-xs bg-bg border border-border rounded px-2 py-1 text-text-primary focus:outline-none focus:border-accent"
                                />
                                <span className="text-[10px] text-text-secondary">
                                  Re-alerts every {repeatMin} min while down
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Available channels to add */}
              {unassignedChannels.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-text-secondary uppercase tracking-wider mb-3">
                    Available
                  </h4>
                  <div className="space-y-2">
                    {unassignedChannels.map((channel) => (
                      <div
                        key={channel.id}
                        className="flex items-center justify-between p-3 rounded-lg bg-surface border border-border/50 hover:border-accent/30 transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className={`text-xs font-semibold uppercase tracking-wide ${CHANNEL_TYPE_COLORS[channel.type] ?? "text-text-secondary"}`}>
                            {channel.type}
                          </span>
                          <span className="text-sm text-text-primary truncate">{channel.name}</span>
                        </div>
                        <button
                          onClick={() => onAssign(channel.id)}
                          className="ml-3 p-1.5 rounded-md bg-accent/10 hover:bg-accent/20 text-accent transition-colors shrink-0"
                          title="Add"
                          aria-label={`Add ${channel.name} to this monitor`}
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {allChannels.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-sm text-text-secondary">No alert channels configured.</p>
                  <p className="text-xs text-text-secondary opacity-60 mt-1">
                    Create channels on the Alerts page first.
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        <div className="px-6 py-4 border-t border-border">
          <Button
            variant="secondary"
            className="w-full"
            onClick={onClose}
          >
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}

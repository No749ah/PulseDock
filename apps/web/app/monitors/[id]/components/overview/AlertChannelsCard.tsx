"use client";

import React from "react";
import { Card } from "../../../../components/Card";
import type { AlertChannelInfo } from "../types";
import { TYPE_COLORS, NOTIFY_LABELS } from "./alertChannelsCardHelpers";

interface Props {
  alertChannels: AlertChannelInfo[];
  onAlertChannelNotifyChange: (channelId: string, notifyOn: string) => Promise<void>;
}

export function AlertChannelsCard({ alertChannels, onAlertChannelNotifyChange }: Props) {
  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">Alert Channels</h2>
        <a href="/alerts" className="text-xs text-accent hover:underline">Manage →</a>
      </div>
      {alertChannels.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <p className="text-sm text-text-secondary">No alert channels assigned</p>
          <a href="/alerts" className="text-xs text-accent hover:underline">Add an alert channel →</a>
        </div>
      ) : (
        <div className="space-y-2">
          {alertChannels.map((ac) => {
            const colorClass = TYPE_COLORS[ac.alertChannel.type] ?? "text-text-secondary bg-surface-elevated border-border";
            return (
              <div key={ac.alertChannelId} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-surface-elevated border border-border">
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border uppercase ${colorClass} shrink-0`}>
                  {ac.alertChannel.type}
                </span>
                <span className="text-sm text-text-primary flex-1 truncate">{ac.alertChannel.name}</span>
                <select
                  value={ac.notifyOn}
                  onChange={async (e) => { await onAlertChannelNotifyChange(ac.alertChannelId, e.target.value); }}
                  className="text-xs text-text-muted bg-transparent border-0 cursor-pointer focus:outline-none focus:ring-1 focus:ring-accent rounded"
                  title="Change notification trigger"
                >
                  {Object.entries(NOTIFY_LABELS).map(([val, lbl]) => (
                    <option key={val} value={val}>{lbl}</option>
                  ))}
                </select>
                {ac.escalationPolicy && (
                  <span
                    className="text-[10px] text-purple-400 bg-purple-400/10 border border-purple-400/20 rounded-full px-1.5 py-0.5 shrink-0"
                    title={`Escalation: ${ac.escalationPolicy.name}`}
                  >
                    ↗ {ac.escalationPolicy.name}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

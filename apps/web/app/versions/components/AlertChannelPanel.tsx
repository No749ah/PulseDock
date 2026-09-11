'use client';

import { X, Plus } from 'lucide-react';
import type { VersionItem, AlertChannelFull } from './types';
import { CHANNEL_TYPE_COLORS, VERSION_NOTIFY_OPTIONS } from './utils';

interface AlertChannelPanelProps {
  monitor: VersionItem;
  assignedChannels: AlertChannelFull[];
  allChannels: AlertChannelFull[];
  loading: boolean;
  error: string;
  onClose: () => void;
  onAssign: (channelId: string) => void;
  onUnassign: (channelId: string) => void;
  onUpdateNotifyOn: (channelId: string, notifyOn: string) => void;
}

export function AlertChannelPanel({
  monitor, assignedChannels, allChannels,
  loading, error,
  onClose, onAssign, onUnassign, onUpdateNotifyOn,
}: AlertChannelPanelProps) {
  const availableChannels = allChannels.filter((c) => !assignedChannels.some((a) => a.id === c.id));

  return (
    <div className="fixed inset-0 z-40 flex justify-end" onClick={onClose}>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative z-50 w-full max-w-sm bg-bg border-l border-border h-full flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div>
            <h3 className="font-semibold text-text-primary">Alert Channels</h3>
            <p className="text-xs text-text-secondary mt-0.5 truncate max-w-[200px]">{monitor.name}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-surface-elevated text-text-secondary transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {error && (
            <div className="px-3 py-2 rounded-lg bg-danger/10 border border-danger/20 text-danger text-sm">
              {error}
            </div>
          )}
          {loading ? (
            <p className="text-sm text-text-secondary">Loading…</p>
          ) : (
            <>
              {/* Assigned channels */}
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-widest text-text-secondary mb-3">
                  Assigned Channels
                </h4>
                {assignedChannels.length === 0 ? (
                  <p className="text-sm text-text-secondary italic">No channels assigned yet.</p>
                ) : (
                  <div className="space-y-2">
                    {assignedChannels.map((channel) => (
                      <div
                        key={channel.id}
                        className="rounded-lg bg-surface-elevated border border-border/50 overflow-hidden"
                      >
                        <div className="flex items-center justify-between px-3 pt-3 pb-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className={`text-[11px] font-bold uppercase tracking-wide ${CHANNEL_TYPE_COLORS[channel.type] ?? 'text-text-secondary'}`}
                            >
                              {channel.type}
                            </span>
                            <span className="text-sm text-text-primary truncate">{channel.name}</span>
                          </div>
                          <button
                            onClick={() => onUnassign(channel.id)}
                            className="ml-2 p-1 rounded hover:bg-danger/10 text-text-secondary hover:text-danger transition-colors shrink-0"
                            aria-label={`Remove ${channel.name}`}
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                        <div className="px-3 pb-3">
                          <label className="block text-[10px] text-text-secondary uppercase tracking-wide mb-1">
                            Notify when
                          </label>
                          <select
                            value={channel.notifyOn ?? 'VERSION_ANY'}
                            onChange={(e) => onUpdateNotifyOn(channel.id, e.target.value)}
                            className="w-full text-xs bg-bg border border-border rounded-lg px-2 py-1.5 text-text-primary focus:outline-none focus:border-accent"
                          >
                            {VERSION_NOTIFY_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Available channels */}
              {availableChannels.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-widest text-text-secondary mb-3">
                    Add Channel
                  </h4>
                  <div className="space-y-2">
                    {availableChannels.map((channel) => (
                      <div
                        key={channel.id}
                        className="flex items-center justify-between p-3 rounded-lg bg-surface-elevated border border-border/50 hover:border-accent/40 transition-colors"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className={`text-[11px] font-bold uppercase tracking-wide ${CHANNEL_TYPE_COLORS[channel.type] ?? 'text-text-secondary'}`}
                          >
                            {channel.type}
                          </span>
                          <span className="text-sm text-text-primary truncate">{channel.name}</span>
                        </div>
                        <button
                          onClick={() => onAssign(channel.id)}
                          className="ml-2 p-1.5 rounded-lg bg-accent/10 hover:bg-accent/20 text-accent transition-colors shrink-0"
                          aria-label={`Assign ${channel.name}`}
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

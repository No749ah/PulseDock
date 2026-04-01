"use client";

import React from "react";
import { Bookmark, Plus, X } from "lucide-react";
import { Card } from "../../../../components/Card";
import { Button } from "../../../../components/Button";
import { relativeTime } from "../../../../components/timeUtils";
import type { MonitorEvent } from "../types";

interface Props {
  events: MonitorEvent[];
  newEventMsg: string;
  onNewEventMsgChange: (v: string) => void;
  newEventType: "deploy" | "note" | "incident" | "maintenance" | "config";
  onNewEventTypeChange: (v: "deploy" | "note" | "incident" | "maintenance" | "config") => void;
  addingEvent: boolean;
  eventError: string;
  onAddEvent: () => Promise<void>;
  onDeleteEvent: (id: string) => Promise<void>;
}

const EVENT_TYPE_COLORS: Record<string, string> = {
  deploy: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  note: "bg-surface-elevated text-text-muted border-border",
  incident: "bg-red-500/15 text-red-400 border-red-500/30",
  maintenance: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  config: "bg-purple-500/15 text-purple-400 border-purple-500/30",
};

export function EventsTimelineCard({
  events,
  newEventMsg,
  onNewEventMsgChange,
  newEventType,
  onNewEventTypeChange,
  addingEvent,
  eventError,
  onAddEvent,
  onDeleteEvent,
}: Props) {
  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-2">
          <Bookmark className="w-4 h-4" />
          Timeline Annotations
        </h2>
        <span className="text-xs text-text-muted">{events.length} event{events.length !== 1 ? "s" : ""}</span>
      </div>
      <div className="flex gap-2 items-start">
        <select
          value={newEventType}
          onChange={(e) => onNewEventTypeChange(e.target.value as "deploy" | "note" | "incident" | "maintenance" | "config")}
          className="text-xs rounded-lg border border-border bg-surface px-2 py-1.5 text-text-secondary focus:outline-none focus:ring-1 focus:ring-accent"
        >
          <option value="note">Note</option>
          <option value="deploy">Deploy</option>
          <option value="incident">Incident</option>
          <option value="maintenance">Maintenance</option>
          <option value="config">Config</option>
        </select>
        <input
          type="text"
          value={newEventMsg}
          onChange={(e) => onNewEventMsgChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void onAddEvent(); } }}
          placeholder="Add annotation… (e.g. Deployed v2.3.1)"
          className="flex-1 text-sm rounded-lg border border-border bg-surface px-3 py-1.5 text-text-primary placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
        />
        <Button
          size="sm"
          variant="primary"
          onClick={() => void onAddEvent()}
          disabled={addingEvent || !newEventMsg.trim()}
          className="flex items-center gap-1.5"
        >
          <Plus className="w-3.5 h-3.5" />
          {addingEvent ? "Saving…" : "Add"}
        </Button>
      </div>
      {eventError && <p className="text-xs text-danger">{eventError}</p>}
      {events.length === 0 ? (
        <p className="text-xs text-text-muted text-center py-4">No annotations yet. Mark deploys, config changes, or incidents above.</p>
      ) : (
        <div className="space-y-2">
          {events.map((ev) => {
            const cls = EVENT_TYPE_COLORS[ev.eventType] ?? EVENT_TYPE_COLORS.note;
            return (
              <div key={ev.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-surface-elevated border border-border group">
                <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium uppercase tracking-wider flex-shrink-0 ${cls}`}>
                  {ev.eventType}
                </span>
                <span className="flex-1 text-sm text-text-primary truncate">{ev.message}</span>
                <span className="text-xs text-text-muted flex-shrink-0">{relativeTime(ev.createdAt)}</span>
                <button
                  onClick={() => void onDeleteEvent(ev.id)}
                  className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-danger transition-all flex-shrink-0"
                  aria-label="Delete event"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

"use client";

import { useEffect, useState, useCallback } from "react";
import { Inbox, RefreshCw, Clock, AlertCircle, CheckCircle2, AlertTriangle, Zap, Trash2 } from "lucide-react";
import { api } from "../../../lib/api";
import { Card } from "../../components/Card";
import { Badge } from "../../components/Badge";

interface DigestQueueItem {
  id: string;
  eventType: "down" | "recovery" | "degraded" | "flapping";
  monitorId: string | null;
  monitorName: string | null;
  message: string;
  sentAt: string | null;
  createdAt: string;
}

interface DigestQueueResponse {
  pending: DigestQueueItem[];
  sent: DigestQueueItem[];
}

const EVENT_META: Record<
  DigestQueueItem["eventType"],
  { label: string; color: string; icon: React.ReactNode }
> = {
  down: {
    label: "DOWN",
    color: "text-red-400 bg-red-400/10",
    icon: <AlertCircle className="w-3.5 h-3.5" />,
  },
  recovery: {
    label: "RECOVERED",
    color: "text-green-400 bg-green-400/10",
    icon: <CheckCircle2 className="w-3.5 h-3.5" />,
  },
  degraded: {
    label: "DEGRADED",
    color: "text-yellow-400 bg-yellow-400/10",
    icon: <AlertTriangle className="w-3.5 h-3.5" />,
  },
  flapping: {
    label: "FLAPPING",
    color: "text-purple-400 bg-purple-400/10",
    icon: <Zap className="w-3.5 h-3.5" />,
  },
};

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

interface Props {
  userId: string;
  frequency: string;
}

export function DigestQueueCard({ userId, frequency }: Props) {
  const [data, setData] = useState<DigestQueueResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<"pending" | "sent">("pending");

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      else setRefreshing(true);
      try {
        const result = await api<DigestQueueResponse>(
          "/v1/notification-preferences/digest-queue",
          userId
        );
        setData(result);
      } catch {
        // non-critical — silently ignore
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [userId]
  );

  useEffect(() => {
    load();
  }, [load]);

  // Only show this card when frequency is hourly or daily digest
  if (frequency === "instant") return null;

  const items = data ? data[tab] : [];
  const pendingCount = data?.pending.length ?? 0;

  return (
    <Card>
      <div className="flex items-center gap-3 mb-5">
        <div className="p-2.5 rounded-xl bg-surface-elevated">
          <Inbox className="w-5 h-5 text-text-secondary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-text-primary">Digest Queue</h2>
            {pendingCount > 0 && (
              <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-bold bg-accent/20 text-accent">
                {pendingCount}
              </span>
            )}
          </div>
          <p className="text-sm text-text-secondary mt-0.5">
            Notifications queued for your{" "}
            <span className="text-text-primary font-medium">
              {frequency === "hourly_digest" ? "hourly" : "daily"}
            </span>{" "}
            digest email
          </p>
        </div>
        <button
          type="button"
          onClick={() => load(true)}
          disabled={refreshing}
          className="p-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors disabled:opacity-50"
          aria-label="Refresh digest queue"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 mb-4 p-1 bg-surface-elevated/50 rounded-xl">
        {(["pending", "sent"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold transition-colors ${
              tab === t
                ? "bg-surface text-text-primary shadow-sm"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            {t === "pending" ? `Pending (${data?.pending.length ?? 0})` : `Sent (${data?.sent.length ?? 0})`}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 rounded-lg bg-surface-elevated/40 animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div className="p-3 rounded-full bg-surface-elevated mb-3">
            {tab === "pending" ? (
              <CheckCircle2 className="w-5 h-5 text-green-400" />
            ) : (
              <Inbox className="w-5 h-5 text-text-muted" />
            )}
          </div>
          <p className="text-sm font-medium text-text-primary">
            {tab === "pending" ? "No pending notifications" : "No sent items yet"}
          </p>
          <p className="text-xs text-text-muted mt-1">
            {tab === "pending"
              ? "You're all caught up — no events are queued for the next digest."
              : "Digest emails will appear here once delivered."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const meta = EVENT_META[item.eventType];
            return (
              <div
                key={item.id}
                className="flex items-start gap-3 px-3 py-2.5 rounded-lg bg-surface-elevated/40 border border-border/50"
              >
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold mt-0.5 shrink-0 ${meta.color}`}
                >
                  {meta.icon}
                  {meta.label}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-primary truncate">
                    {item.monitorName ?? "Unknown monitor"}
                  </p>
                  <p className="text-xs text-text-secondary truncate">{item.message}</p>
                </div>
                <div className="flex items-center gap-1 text-xs text-text-muted shrink-0">
                  <Clock className="w-3 h-3" />
                  {formatRelative(item.sentAt ?? item.createdAt)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === "pending" && pendingCount > 0 && (
        <p className="mt-4 text-xs text-text-muted text-center">
          These will be emailed in the next{" "}
          {frequency === "hourly_digest" ? "hourly" : "daily"} digest.
          Switch to <span className="text-text-secondary font-medium">Instant</span> in preferences above to receive alerts immediately.
        </p>
      )}
    </Card>
  );
}

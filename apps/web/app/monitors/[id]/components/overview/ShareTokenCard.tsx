"use client";

import React from "react";
import { Globe, CheckCircle, X } from "lucide-react";
import { Card } from "../../../../components/Card";
import type { MonitorItem } from "../types";

interface Props {
  monitor: MonitorItem;
  shareToken: string | null;
  shareTokenLoading: boolean;
  shareTokenCopied: boolean;
  onGenerateShareToken: () => Promise<void>;
  onRevokeShareToken: () => Promise<void>;
  onCopyShareUrl: (token: string) => void;
}

export function ShareTokenCard({
  monitor,
  shareToken,
  shareTokenLoading,
  shareTokenCopied,
  onGenerateShareToken,
  onRevokeShareToken,
  onCopyShareUrl,
}: Props) {
  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-2">
          <Globe className="w-4 h-4" />
          Public Status URL
        </h2>
      </div>
      <p className="text-xs text-text-secondary">
        Generate a share token to expose this monitor&apos;s status publicly — no API key needed.
        Share a human-readable status page, embed a JSON endpoint in README files or CI/CD pipelines.
      </p>
      {monitor.shareToken ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-success/5 border border-success/20">
            <Globe className="w-3.5 h-3.5 text-success flex-shrink-0" />
            <a
              href={`/public/monitor/${monitor.shareToken}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-success hover:underline truncate flex-1 font-medium"
            >
              {`/public/monitor/${monitor.shareToken}`}
            </a>
            <span className="text-[10px] text-success/60 flex-shrink-0">Status page ↗</span>
          </div>
          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-surface-elevated border border-border font-mono text-[11px] text-text-secondary overflow-hidden">
            <span className="truncate flex-1">{`/v1/public/monitor/${monitor.shareToken}/status.json`}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onCopyShareUrl(monitor.shareToken!)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                shareTokenCopied
                  ? "bg-success/20 text-success border border-success/30"
                  : "bg-accent/10 text-accent border border-accent/20 hover:bg-accent/20"
              }`}
            >
              {shareTokenCopied ? <CheckCircle className="w-3.5 h-3.5" /> : <Globe className="w-3.5 h-3.5" />}
              {shareTokenCopied ? "Copied!" : "Copy JSON URL"}
            </button>
            <button
              onClick={onRevokeShareToken}
              disabled={shareTokenLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-danger/70 border border-danger/20 hover:bg-danger/10 transition-colors disabled:opacity-50"
            >
              <X className="w-3.5 h-3.5" />
              Revoke
            </button>
          </div>
          <p className="text-[11px] text-text-muted">
            Status page: human-readable HTML with history + sparkline. JSON: status, level, latency, 30d uptime%. Both cached 30s.
          </p>
        </div>
      ) : (
        <button
          onClick={onGenerateShareToken}
          disabled={shareTokenLoading}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium bg-surface-elevated border border-border text-text-secondary hover:text-text-primary hover:border-accent/40 transition-colors disabled:opacity-50"
        >
          <Globe className="w-3.5 h-3.5" />
          {shareTokenLoading ? "Generating…" : "Generate Share Token"}
        </button>
      )}
    </Card>
  );
}

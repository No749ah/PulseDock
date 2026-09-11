import React from "react";
import { Shield, X } from "lucide-react";
import { Button } from "../../components/Button";
import type { MonitorItem } from "../types";

interface BadgeModalProps {
  monitor: MonitorItem;
  onClose: () => void;
  onCopySuccess: (message: string) => void;
}

export function BadgeModal({ monitor, onClose, onCopySuccess }: BadgeModalProps) {
  const badgeBase = typeof window !== "undefined" ? `${window.location.origin}/api/v1/public/badge` : "/api/v1/public/badge";
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" role="dialog" aria-modal="true" aria-labelledby="badge-modal-title">
      <div className="bg-surface border border-border rounded-xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <h2 id="badge-modal-title" className="text-lg font-semibold text-text-primary flex items-center gap-2">
            <Shield className="w-5 h-5 text-accent" />
            Embed Badge — {monitor.name}
          </h2>
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary p-1 rounded" aria-label="Close badge modal">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="px-6 py-5 space-y-5 overflow-y-auto flex-1">
          <p className="text-sm text-text-secondary">
            Embed a live status badge anywhere — GitHub READMEs, documentation, or websites. Updates every 60 seconds.
          </p>
          {/* Preview */}
          <div>
            <p className="text-xs font-medium text-text-secondary uppercase tracking-wide mb-2">Preview</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/v1/public/badge/${monitor.id}.svg`}
              alt={`${monitor.name} status badge`}
              className="h-6"
            />
          </div>
          {/* Markdown */}
          <div>
            <p className="text-xs font-medium text-text-secondary uppercase tracking-wide mb-1">Markdown (GitHub README)</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs bg-surface-elevated border border-border rounded px-3 py-2 font-mono text-text-primary overflow-x-auto whitespace-nowrap">
                {`![${monitor.name}](${badgeBase}/${monitor.id}.svg)`}
              </code>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  void navigator.clipboard.writeText(`![${monitor.name}](${badgeBase}/${monitor.id}.svg)`);
                  onCopySuccess("Markdown copied!");
                }}
              >
                Copy
              </Button>
            </div>
          </div>
          {/* HTML */}
          <div>
            <p className="text-xs font-medium text-text-secondary uppercase tracking-wide mb-1">HTML</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs bg-surface-elevated border border-border rounded px-3 py-2 font-mono text-text-primary overflow-x-auto whitespace-nowrap">
                {`<img src="${badgeBase}/${monitor.id}.svg" alt="${monitor.name} status" />`}
              </code>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  void navigator.clipboard.writeText(`<img src="${badgeBase}/${monitor.id}.svg" alt="${monitor.name} status" />`);
                  onCopySuccess("HTML copied!");
                }}
              >
                Copy
              </Button>
            </div>
          </div>
          {/* Direct URL */}
          <div>
            <p className="text-xs font-medium text-text-secondary uppercase tracking-wide mb-1">Direct URL</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs bg-surface-elevated border border-border rounded px-3 py-2 font-mono text-text-primary overflow-x-auto whitespace-nowrap">
                {`${badgeBase}/${monitor.id}.svg`}
              </code>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  void navigator.clipboard.writeText(`${badgeBase}/${monitor.id}.svg`);
                  onCopySuccess("URL copied!");
                }}
              >
                Copy
              </Button>
            </div>
          </div>
          {/* Style variants */}
          <div>
            <p className="text-xs font-medium text-text-secondary uppercase tracking-wide mb-2">Style variants</p>
            <div className="flex flex-wrap gap-3">
              {(["flat", "flat-square", "for-the-badge"] as const).map((s) => (
                <div key={s} className="flex flex-col items-center gap-1">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/v1/public/badge/${monitor.id}.svg?style=${s}`}
                    alt={s}
                    className={s === "for-the-badge" ? "h-7" : "h-5"}
                  />
                  <span className="text-xs text-text-secondary">{s}</span>
                </div>
              ))}
            </div>
          </div>
          {/* iFrame embed */}
          <div className="rounded-xl border border-border bg-surface-elevated p-4 space-y-3">
            <div>
              <p className="text-xs font-semibold text-text-primary mb-1">iFrame Embed</p>
              <p className="text-xs text-text-secondary mb-3">Embed a live status widget on any webpage. Supports <code className="text-accent">?style=compact|card</code> and <code className="text-accent">?theme=dark|light</code>.</p>
              {/* iFrame preview */}
              <div className="mb-3 rounded overflow-hidden border border-border">
                <iframe
                  src={`/embed/${monitor.id}?style=compact&theme=dark`}
                  width="100%"
                  height="40"
                  style={{ border: 'none', display: 'block' }}
                  title={`${monitor.name} status widget preview`}
                />
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs bg-surface border border-border rounded px-3 py-2 font-mono text-text-primary overflow-x-auto whitespace-nowrap">
                  {`<iframe src="${origin}/embed/${monitor.id}" width="300" height="40" frameborder="0"></iframe>`}
                </code>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    void navigator.clipboard.writeText(`<iframe src="${origin}/embed/${monitor.id}" width="300" height="40" frameborder="0"></iframe>`);
                    onCopySuccess("iFrame snippet copied!");
                  }}
                >
                  Copy
                </Button>
              </div>
            </div>
            {/* Card style iFrame */}
            <div>
              <p className="text-xs font-medium text-text-secondary mb-2">Card style (120px tall, includes uptime %)</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs bg-surface border border-border rounded px-3 py-2 font-mono text-text-primary overflow-x-auto whitespace-nowrap">
                  {`<iframe src="${origin}/embed/${monitor.id}?style=card" width="300" height="120" frameborder="0"></iframe>`}
                </code>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    void navigator.clipboard.writeText(`<iframe src="${origin}/embed/${monitor.id}?style=card" width="300" height="120" frameborder="0"></iframe>`);
                    onCopySuccess("Card iFrame snippet copied!");
                  }}
                >
                  Copy
                </Button>
              </div>
            </div>
          </div>
          {/* Script tag embed */}
          <div className="rounded-xl border border-border bg-surface-elevated p-4 space-y-3">
            <div>
              <p className="text-xs font-semibold text-text-primary mb-1">Script Tag Embed</p>
              <p className="text-xs text-text-secondary mb-3">Injects a status widget inline — no iframe needed. Add the <code className="text-accent">data-pulsedock-monitor</code> attribute to any div.</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs bg-surface border border-border rounded px-3 py-2 font-mono text-text-primary overflow-x-auto whitespace-nowrap">
                  {`<div data-pulsedock-monitor="${monitor.id}" data-style="compact" data-theme="dark"></div>\n<script src="${origin}/embed.js" async></script>`}
                </code>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    void navigator.clipboard.writeText(`<div data-pulsedock-monitor="${monitor.id}" data-style="compact" data-theme="dark"></div>\n<script src="${origin}/embed.js" async></script>`);
                    onCopySuccess("Script tag snippet copied!");
                  }}
                >
                  Copy
                </Button>
              </div>
            </div>
          </div>
          {/* Floating widget embed */}
          <div className="rounded-xl border border-accent/20 bg-accent/5 p-4">
            <p className="text-xs font-semibold text-text-primary mb-1">Floating Widget</p>
            <p className="text-xs text-text-secondary mb-3">Paste into any webpage to show a live floating badge in the bottom-right corner.</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs bg-surface-elevated border border-border rounded px-3 py-2 font-mono text-text-primary overflow-x-auto whitespace-nowrap">
                {`<script src="${origin}/api/v1/public/embed/monitor/${monitor.id}.js"></script>`}
              </code>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  void navigator.clipboard.writeText(`<script src="${origin}/api/v1/public/embed/monitor/${monitor.id}.js"></script>`);
                  onCopySuccess("Script tag copied!");
                }}
              >
                Copy
              </Button>
            </div>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-border flex justify-end">
          <Button variant="secondary" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  );
}

"use client";

import React, { useState } from "react";
import { X, Zap, CheckCircle2, AlertCircle, SkipForward } from "lucide-react";
import { Button } from "../../components/Button";

interface AlertChannel {
  id: string;
  name: string;
  type: string;
}

interface Folder {
  id: string;
  name: string;
}

interface QuickAddResult {
  created: number;
  skipped: number;
  errors: Array<{ url: string; error: string }>;
}

interface QuickAddModalProps {
  folders: Folder[];
  channels: AlertChannel[];
  onClose: () => void;
  onSubmit: (payload: {
    urls: string[];
    folderId?: string;
    alertChannelIds?: string[];
    intervalSec?: number;
  }) => Promise<QuickAddResult>;
}

export function QuickAddModal({ folders, channels, onClose, onSubmit }: QuickAddModalProps) {
  const [urlsText, setUrlsText] = useState("");
  const [folderId, setFolderId] = useState("");
  const [selectedChannels, setSelectedChannels] = useState<Set<string>>(new Set());
  const [intervalSec, setIntervalSec] = useState(60);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<QuickAddResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const parsedUrls = urlsText
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const validUrls = parsedUrls.filter((u) => {
    try {
      const p = new URL(u);
      return p.protocol === "http:" || p.protocol === "https:";
    } catch {
      return false;
    }
  });

  const invalidCount = parsedUrls.length - validUrls.length;

  const toggleChannel = (id: string) => {
    setSelectedChannels((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSubmit = async () => {
    if (validUrls.length === 0) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await onSubmit({
        urls: validUrls,
        folderId: folderId || undefined,
        alertChannelIds: selectedChannels.size > 0 ? Array.from(selectedChannels) : undefined,
        intervalSec,
      });
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create monitors");
    } finally {
      setLoading(false);
    }
  };

  const channelTypeIcon = (type: string) => {
    const map: Record<string, string> = {
      discord: "🎮", slack: "💬", telegram: "✈️", email: "📧",
      webhook: "🔗", pagerduty: "🔔", opsgenie: "📟", sms: "📱", teams: "💼",
    };
    return map[type] ?? "🔔";
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-surface border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-accent" />
            <h2 className="text-lg font-semibold text-text-primary">Quick Add Monitors</h2>
          </div>
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary transition-colors" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5 overflow-y-auto flex-1">
          {/* URL textarea */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-text-primary">
                URLs <span className="text-danger">*</span>
              </label>
              {parsedUrls.length > 0 && (
                <span className="text-xs text-text-secondary">
                  {validUrls.length} valid
                  {invalidCount > 0 && <span className="text-warning ml-1">· {invalidCount} invalid</span>}
                  {validUrls.length > 50 && <span className="text-danger ml-1">· max 50</span>}
                </span>
              )}
            </div>
            <textarea
              className="w-full px-4 py-3 bg-surface-elevated border border-border rounded-xl text-sm text-text-primary placeholder-text-secondary focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent resize-none font-mono"
              rows={6}
              placeholder={"Paste one URL per line, e.g.:\nhttps://example.com\nhttps://api.example.com/health\nhttps://staging.example.com"}
              value={urlsText}
              onChange={(e) => { setUrlsText(e.target.value); setResult(null); setError(null); }}
            />
            <p className="text-xs text-text-muted">
              One HTTP/HTTPS URL per line. Up to 50 URLs. Each becomes a named HTTP monitor (name derived from hostname).
            </p>
          </div>

          {/* Check interval */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-text-primary">Check interval</label>
            <div className="flex items-center gap-2 flex-wrap">
              {[30, 60, 300, 600, 1800, 3600].map((sec) => (
                <button
                  key={sec}
                  onClick={() => setIntervalSec(sec)}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                    intervalSec === sec
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-border bg-surface-elevated text-text-secondary hover:border-accent/50 hover:text-text-primary"
                  }`}
                >
                  {sec === 30 ? "30s" : sec === 60 ? "1m" : sec === 300 ? "5m" : sec === 600 ? "10m" : sec === 1800 ? "30m" : "1h"}
                </button>
              ))}
            </div>
          </div>

          {/* Folder */}
          {folders.length > 0 && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-text-primary">Project / Folder</label>
              <select
                value={folderId}
                onChange={(e) => setFolderId(e.target.value)}
                className="w-full px-3 py-2 bg-surface-elevated border border-border rounded-xl text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
              >
                <option value="">— None —</option>
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Alert channels */}
          {channels.length > 0 && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-text-primary">Alert channels</label>
              <div className="grid grid-cols-2 gap-2 max-h-36 overflow-y-auto">
                {channels.map((ch) => {
                  const checked = selectedChannels.has(ch.id);
                  return (
                    <button
                      key={ch.id}
                      onClick={() => toggleChannel(ch.id)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-left text-xs transition-colors ${
                        checked
                          ? "border-accent bg-accent/10 text-accent"
                          : "border-border bg-surface-elevated text-text-secondary hover:border-accent/50"
                      }`}
                    >
                      <span>{channelTypeIcon(ch.type)}</span>
                      <span className="truncate font-medium">{ch.name}</span>
                    </button>
                  );
                })}
              </div>
              {selectedChannels.size > 0 && (
                <p className="text-xs text-text-muted">{selectedChannels.size} channel{selectedChannels.size !== 1 ? "s" : ""} selected</p>
              )}
            </div>
          )}

          {/* Result */}
          {result && (
            <div className="rounded-xl border p-4 space-y-2">
              {result.created > 0 && (
                <div className="flex items-center gap-2 text-success text-sm">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span className="font-medium">{result.created} monitor{result.created !== 1 ? "s" : ""} created</span>
                </div>
              )}
              {result.skipped > 0 && (
                <div className="flex items-center gap-2 text-text-secondary text-sm">
                  <SkipForward className="w-4 h-4 shrink-0" />
                  <span>{result.skipped} duplicate{result.skipped !== 1 ? "s" : ""} skipped (already monitored)</span>
                </div>
              )}
              {result.errors.length > 0 && (
                <div className="space-y-1">
                  {result.errors.map((e, i) => (
                    <div key={i} className="flex items-start gap-2 text-warning text-xs">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span><span className="font-mono">{e.url}</span>: {e.error}</span>
                    </div>
                  ))}
                </div>
              )}
              {result.created === 0 && result.skipped === 0 && result.errors.length === 0 && (
                <p className="text-sm text-text-secondary">No monitors were created.</p>
              )}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 rounded-xl bg-danger/10 border border-danger/20 px-4 py-3 text-sm text-danger">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex items-center justify-between gap-3 shrink-0">
          {result ? (
            <Button variant="secondary" onClick={onClose}>Done</Button>
          ) : (
            <>
              <Button variant="secondary" onClick={onClose} disabled={loading}>Cancel</Button>
              <Button
                onClick={handleSubmit}
                disabled={loading || validUrls.length === 0 || validUrls.length > 50}
                className="flex items-center gap-2"
              >
                <Zap className="w-4 h-4" />
                {loading
                  ? `Creating ${validUrls.length} monitor${validUrls.length !== 1 ? "s" : ""}…`
                  : `Create ${validUrls.length} monitor${validUrls.length !== 1 ? "s" : ""}`}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

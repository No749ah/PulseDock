"use client";
import React, { useState } from "react";
import { X, FileCode, Loader2, CheckSquare, Square, Plus } from "lucide-react";
import { Button } from "../../components/Button";
import { api } from "../../../lib/api";

interface SuggestedMonitor {
  name: string;
  type: "HTTP" | "TCP";
  target: string;
  reason: string;
  intervalSec: number;
}

interface ImportFromComposeModalProps {
  userId: string | undefined;
  onClose: () => void;
  onCreated: () => void;
}

export function ImportFromComposeModal({
  userId,
  onClose,
  onCreated,
}: ImportFromComposeModalProps) {
  const [composeText, setComposeText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [suggestions, setSuggestions] = useState<SuggestedMonitor[] | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const handleParse = async () => {
    if (!composeText.trim()) return;
    setParsing(true);
    setError(null);
    setSuggestions(null);
    try {
      const result = await api<SuggestedMonitor[]>(
        "/v1/monitors/import-from-compose",
        userId,
        {
          method: "POST",
          body: JSON.stringify({ compose: composeText }),
        }
      );
      setSuggestions(result);
      setSelected(new Set(result.map((_, i) => i)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to parse compose file");
    } finally {
      setParsing(false);
    }
  };

  const toggleSelect = (i: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) {
        next.delete(i);
      } else {
        next.add(i);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (!suggestions) return;
    if (selected.size === suggestions.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(suggestions.map((_, i) => i)));
    }
  };

  const handleCreateSelected = async () => {
    if (!suggestions || selected.size === 0) return;
    setCreating(true);
    setError(null);
    try {
      const toCreate = suggestions
        .filter((_, i) => selected.has(i))
        .map((s) => ({
          name: s.name,
          type: s.type,
          target: s.target,
          intervalSec: s.intervalSec,
          enabled: false,
          confirmations: 1,
          retryCount: 0,
        }));

      await api("/v1/monitors/bulk", userId, {
        method: "POST",
        body: JSON.stringify({ action: "create", monitors: toCreate }),
      });

      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create monitors");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-3xl bg-surface-base border border-border rounded-xl shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-accent/10">
              <FileCode className="w-5 h-5 text-accent" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-text-primary">Import from Docker Compose</h2>
              <p className="text-xs text-text-secondary">Paste your docker-compose.yml — we&apos;ll suggest monitors for each service</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Compose textarea */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">
              docker-compose.yml content
            </label>
            <textarea
              value={composeText}
              onChange={(e) => setComposeText(e.target.value)}
              placeholder={`version: "3"\nservices:\n  web:\n    image: nginx:latest\n    ports:\n      - "80:80"`}
              rows={10}
              className="w-full px-3 py-2.5 bg-surface-elevated border border-border rounded-lg text-sm text-text-primary font-mono placeholder-text-secondary focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent resize-y"
            />
          </div>

          {/* Error */}
          {error && (
            <div className="px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Suggestions table */}
          {suggestions !== null && (
            <div>
              {suggestions.length === 0 ? (
                <div className="text-center py-6 text-text-secondary text-sm">
                  No monitorable services found. Make sure your services have <code className="text-accent">ports:</code> mappings.
                </div>
              ) : (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-text-primary">
                      {suggestions.length} service{suggestions.length !== 1 ? "s" : ""} detected
                    </span>
                    <button
                      onClick={toggleAll}
                      className="text-xs text-accent hover:text-accent/80 transition-colors"
                    >
                      {selected.size === suggestions.length ? "Deselect all" : "Select all"}
                    </button>
                  </div>
                  <div className="rounded-lg border border-border overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-surface-elevated border-b border-border">
                          <th className="w-10 px-3 py-2.5 text-left">
                            <button onClick={toggleAll} className="text-text-secondary hover:text-text-primary">
                              {selected.size === suggestions.length ? (
                                <CheckSquare className="w-4 h-4 text-accent" />
                              ) : (
                                <Square className="w-4 h-4" />
                              )}
                            </button>
                          </th>
                          <th className="px-3 py-2.5 text-left text-text-secondary font-medium">Service</th>
                          <th className="px-3 py-2.5 text-left text-text-secondary font-medium">Type</th>
                          <th className="px-3 py-2.5 text-left text-text-secondary font-medium">Target</th>
                          <th className="px-3 py-2.5 text-left text-text-secondary font-medium hidden md:table-cell">Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {suggestions.map((s, i) => (
                          <tr
                            key={i}
                            onClick={() => toggleSelect(i)}
                            className={`border-b border-border last:border-0 cursor-pointer transition-colors ${
                              selected.has(i) ? "bg-accent/5 hover:bg-accent/10" : "hover:bg-surface-elevated"
                            }`}
                          >
                            <td className="px-3 py-2.5">
                              {selected.has(i) ? (
                                <CheckSquare className="w-4 h-4 text-accent" />
                              ) : (
                                <Square className="w-4 h-4 text-text-secondary" />
                              )}
                            </td>
                            <td className="px-3 py-2.5 font-medium text-text-primary">{s.name}</td>
                            <td className="px-3 py-2.5">
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                                  s.type === "HTTP"
                                    ? "bg-blue-500/15 text-blue-400"
                                    : "bg-purple-500/15 text-purple-400"
                                }`}
                              >
                                {s.type}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 font-mono text-xs text-text-secondary">{s.target}</td>
                            <td className="px-3 py-2.5 text-xs text-text-secondary hidden md:table-cell">{s.reason}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-xs text-text-secondary mt-2">
                    Monitors will be created as <span className="text-text-primary font-medium">disabled</span> — review targets (localhost) and enable manually.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border flex-shrink-0">
          <Button variant="ghost" onClick={onClose} disabled={parsing || creating}>
            Cancel
          </Button>
          <div className="flex items-center gap-2">
            {suggestions === null ? (
              <Button
                onClick={handleParse}
                disabled={parsing || !composeText.trim()}
                className="flex items-center gap-2"
              >
                {parsing && <Loader2 className="w-4 h-4 animate-spin" />}
                {parsing ? "Parsing…" : "Parse"}
              </Button>
            ) : (
              <>
                <Button
                  variant="secondary"
                  onClick={() => { setSuggestions(null); setError(null); }}
                  disabled={creating}
                >
                  Edit
                </Button>
                <Button
                  onClick={handleCreateSelected}
                  disabled={creating || selected.size === 0}
                  className="flex items-center gap-2"
                >
                  {creating ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Plus className="w-4 h-4" />
                  )}
                  {creating
                    ? "Creating…"
                    : `Create ${selected.size} Monitor${selected.size !== 1 ? "s" : ""}`}
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

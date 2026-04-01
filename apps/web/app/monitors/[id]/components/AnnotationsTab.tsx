"use client";

import React from "react";
import { MessageSquare, Trash2 } from "lucide-react";
import { Card } from "../../../components/Card";
import { api } from "../../../../lib/api";
import { getUser } from "../../../../components/auth";

export interface Annotation {
  id: string;
  text: string;
  color: string;
  annotatedAt: string;
  createdAt: string;
}

type AnnotationColor = "blue" | "green" | "yellow" | "red" | "purple" | "gray";

interface Props {
  monitorId: string;
  annotations: Annotation[];
  annotationsLoading: boolean;
  annotationText: string;
  annotationColor: AnnotationColor;
  annotationDate: string;
  annotationSaving: boolean;
  onAnnotationTextChange: (text: string) => void;
  onAnnotationColorChange: (color: AnnotationColor) => void;
  onAnnotationDateChange: (date: string) => void;
  onAnnotationAdded: (annotation: Annotation) => void;
  onAnnotationDeleted: (id: string) => void;
  onSavingChange: (saving: boolean) => void;
}

const COLOR_MAP: Record<string, string> = {
  blue: "bg-blue-500/10 border-blue-500/30 text-blue-400",
  green: "bg-green-500/10 border-green-500/30 text-green-400",
  yellow: "bg-yellow-500/10 border-yellow-500/30 text-yellow-400",
  red: "bg-red-500/10 border-red-500/30 text-red-400",
  purple: "bg-purple-500/10 border-purple-500/30 text-purple-400",
  gray: "bg-gray-500/10 border-gray-500/30 text-gray-400",
};

const DOT_MAP: Record<string, string> = {
  blue: "bg-blue-400",
  green: "bg-green-400",
  yellow: "bg-yellow-400",
  red: "bg-red-400",
  purple: "bg-purple-400",
  gray: "bg-gray-400",
};

export function AnnotationsTab({
  monitorId,
  annotations,
  annotationsLoading,
  annotationText,
  annotationColor,
  annotationDate,
  annotationSaving,
  onAnnotationTextChange,
  onAnnotationColorChange,
  onAnnotationDateChange,
  onAnnotationAdded,
  onAnnotationDeleted,
  onSavingChange,
}: Props) {
  const handleAdd = async () => {
    const user = getUser();
    if (!user || !annotationText.trim()) return;
    onSavingChange(true);
    try {
      const data = await api<{ annotation: Annotation }>(
        `/v1/monitors/${monitorId}/annotations`,
        user.id,
        {
          method: "POST",
          body: JSON.stringify({
            text: annotationText.trim(),
            color: annotationColor,
            annotatedAt: new Date(annotationDate).toISOString(),
          }),
        },
      );
      if (data.annotation) {
        onAnnotationAdded(data.annotation);
        onAnnotationTextChange("");
        onAnnotationDateChange(new Date().toISOString().slice(0, 16));
      }
    } catch {
      // ignore
    } finally {
      onSavingChange(false);
    }
  };

  const handleDelete = async (id: string) => {
    const user = getUser();
    if (!user) return;
    await api(`/v1/monitors/${monitorId}/annotations/${id}`, user.id, { method: "DELETE" });
    onAnnotationDeleted(id);
  };

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-2">
          <MessageSquare className="w-4 h-4" />
          Timeline Annotations
        </h2>
        <p className="text-xs text-text-muted">Mark deployments, incidents, config changes on the timeline</p>
      </div>

      <div className="border border-border rounded-xl p-4 space-y-3 bg-surface-elevated/40">
        <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Add Annotation</p>
        <div className="flex gap-3 flex-wrap">
          <input
            type="text"
            placeholder="e.g. Deployed v2.1, Config rollback..."
            value={annotationText}
            onChange={(e) => onAnnotationTextChange(e.target.value)}
            maxLength={200}
            className="flex-1 min-w-48 text-sm rounded-lg border border-border bg-surface px-3 py-2 text-text-primary placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <input
            type="datetime-local"
            value={annotationDate}
            onChange={(e) => onAnnotationDateChange(e.target.value)}
            className="text-sm rounded-lg border border-border bg-surface px-3 py-2 text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <select
            value={annotationColor}
            onChange={(e) => onAnnotationColorChange(e.target.value as AnnotationColor)}
            className="text-sm rounded-lg border border-border bg-surface px-3 py-2 text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
          >
            {(["blue", "green", "yellow", "red", "purple", "gray"] as const).map((c) => (
              <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
            ))}
          </select>
          <button
            disabled={!annotationText.trim() || annotationSaving}
            onClick={handleAdd}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-accent text-white hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
          >
            {annotationSaving ? "Adding…" : "+ Add"}
          </button>
        </div>
      </div>

      {annotationsLoading ? (
        <div className="flex items-center gap-2 py-6 justify-center text-text-muted text-sm">
          <div className="w-4 h-4 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
          Loading annotations…
        </div>
      ) : annotations.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <MessageSquare className="w-10 h-10 text-text-muted opacity-40" />
          <p className="text-sm font-medium text-text-secondary">No annotations yet</p>
          <p className="text-xs text-text-muted max-w-xs">
            Add annotations to mark significant events — deployments, config changes, incident starts — and correlate
            them with uptime/latency changes on the timeline.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {annotations.map((ann) => (
            <div
              key={ann.id}
              className={`flex items-start gap-3 p-3 rounded-xl border ${COLOR_MAP[ann.color] ?? COLOR_MAP.blue}`}
            >
              <div className={`w-2.5 h-2.5 rounded-full mt-1 shrink-0 ${DOT_MAP[ann.color] ?? "bg-blue-400"}`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-text-primary">{ann.text}</p>
                <p className="text-xs text-text-muted mt-0.5">{new Date(ann.annotatedAt).toLocaleString()}</p>
              </div>
              <button
                onClick={() => void handleDelete(ann.id)}
                className="text-text-muted hover:text-red-400 transition-colors p-1 rounded shrink-0"
                title="Delete annotation"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

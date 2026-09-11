"use client";

import React from "react";
import Link from "next/link";
import { GitBranch, Plus, Trash2, X } from "lucide-react";
import { Card } from "../../../../components/Card";
import type { MonitorItem, MonitorDependency } from "../types";

interface Props {
  id: string;
  dependencies: MonitorDependency[];
  allMonitors: MonitorItem[];
  showAddDep: boolean;
  onShowAddDepChange: (v: boolean) => void;
  addingDepId: string;
  onAddingDepIdChange: (v: string) => void;
  depLoading: boolean;
  onAddDependency: () => Promise<void>;
  onRemoveDependency: (dependsOnId: string) => Promise<void>;
}

export function DependenciesCard({
  id,
  dependencies,
  allMonitors,
  showAddDep,
  onShowAddDepChange,
  addingDepId,
  onAddingDepIdChange,
  depLoading,
  onAddDependency,
  onRemoveDependency,
}: Props) {
  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-text-secondary" />
          <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">Dependencies</h2>
        </div>
        <button
          onClick={() => onShowAddDepChange(!showAddDep)}
          className="flex items-center gap-1 text-xs text-accent hover:underline"
        >
          <Plus className="w-3 h-3" />
          Add
        </button>
      </div>
      <p className="text-xs text-text-muted">
        Alerts on this monitor are suppressed while any dependency is down. Useful when an app monitor depends on a database or infrastructure monitor.
      </p>
      {showAddDep && (
        <div className="flex gap-2">
          <select
            className="flex-1 px-3 py-2 bg-surface border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
            value={addingDepId}
            onChange={(e) => onAddingDepIdChange(e.target.value)}
          >
            <option value="">Select a monitor to depend on…</option>
            {allMonitors
              .filter((m) => m.id !== id && !dependencies.some((d) => d.dependsOnId === m.id))
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.type})
                </option>
              ))}
          </select>
          <button
            onClick={onAddDependency}
            disabled={!addingDepId || depLoading}
            className="px-3 py-2 bg-accent text-white rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-accent/90 transition-colors"
          >
            {depLoading ? "…" : "Add"}
          </button>
          <button
            onClick={() => { onShowAddDepChange(false); onAddingDepIdChange(""); }}
            className="px-2 py-2 text-text-muted hover:text-text-primary rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {dependencies.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-4 text-center">
          <p className="text-sm text-text-secondary">No dependencies configured</p>
          <p className="text-xs text-text-muted">Add a dependency to suppress false alerts during infrastructure outages</p>
        </div>
      ) : (
        <div className="space-y-2">
          {dependencies.map((dep) => (
            <div key={dep.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-surface-elevated border border-border">
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dep.dependsOn.enabled ? "bg-success" : "bg-text-muted"}`} />
              <div className="flex-1 min-w-0">
                <Link href={`/monitors/${dep.dependsOnId}`} className="text-sm text-text-primary hover:text-accent truncate block">
                  {dep.dependsOn.name}
                </Link>
                <span className="text-xs text-text-muted truncate block">{dep.dependsOn.target}</span>
              </div>
              <span className="text-xs text-text-muted bg-surface px-1.5 py-0.5 rounded border border-border flex-shrink-0">
                {dep.dependsOn.type}
              </span>
              <button
                onClick={() => onRemoveDependency(dep.dependsOnId)}
                className="text-text-muted hover:text-danger transition-colors flex-shrink-0"
                aria-label="Remove dependency"
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

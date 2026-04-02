"use client";

import { Button } from "../../components/Button";

interface Props {
  isOpen: boolean;
  monitorName?: string;
  onCancel: () => void;
  onConfirm: () => void;
  loading?: boolean;
}

export function DeleteMonitorConfirm({ isOpen, monitorName, onCancel, onConfirm, loading = false }: Props) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onCancel}>
      <div className="bg-surface border border-border rounded-xl w-full max-w-sm p-6 space-y-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-text-primary">Delete monitor</h2>
        <p className="text-sm text-text-secondary">
          Are you sure you want to delete {monitorName ? <strong>{monitorName}</strong> : "this monitor"}? This action cannot be undone.
        </p>
        <div className="flex gap-3 pt-1">
          <Button variant="secondary" size="sm" onClick={onCancel} className="flex-1">Cancel</Button>
          <Button size="sm" onClick={onConfirm} disabled={loading} className="flex-1 bg-danger hover:bg-danger/90">
            {loading ? "Deleting…" : "Delete"}
          </Button>
        </div>
      </div>
    </div>
  );
}

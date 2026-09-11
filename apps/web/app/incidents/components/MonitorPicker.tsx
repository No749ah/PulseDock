'use client';

import type { MonitorOption } from '../types';

interface MonitorPickerProps {
  monitors: MonitorOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

export function MonitorPicker({ monitors, selectedIds, onChange }: MonitorPickerProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-text-primary mb-1">
        Affected monitors <span className="text-text-secondary/60">(optional)</span>
      </label>
      {monitors.length === 0 ? (
        <p className="text-xs text-text-secondary italic">No monitors yet</p>
      ) : (
        <div className="max-h-48 overflow-y-auto space-y-0.5 border border-border rounded-lg p-2">
          {monitors.map((m) => (
            <label
              key={m.id}
              className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-surface-elevated cursor-pointer"
            >
              <input
                type="checkbox"
                className="accent-accent flex-shrink-0"
                checked={selectedIds.includes(m.id)}
                onChange={(e) =>
                  onChange(e.target.checked ? [...selectedIds, m.id] : selectedIds.filter((id) => id !== m.id))
                }
              />
              <span className="text-sm text-text-primary flex-1 truncate">{m.name}</span>
              <span className="text-xs text-text-secondary flex-shrink-0">{m.type.replace('_', ' ')}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

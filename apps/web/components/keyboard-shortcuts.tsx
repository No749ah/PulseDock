"use client";

import { useEffect, useState } from "react";
import { X, Keyboard } from "lucide-react";

interface ShortcutGroup {
  label: string;
  shortcuts: Array<{ keys: string[]; description: string }>;
}

const SHORTCUTS: ShortcutGroup[] = [
  {
    label: "Navigation",
    shortcuts: [
      { keys: ["Ctrl", "K"], description: "Open command palette" },
      { keys: ["?"], description: "Show keyboard shortcuts" },
      { keys: ["Esc"], description: "Close dialog / deselect" },
    ],
  },
  {
    label: "Status Page Editor",
    shortcuts: [
      { keys: ["Ctrl", "Z"], description: "Undo" },
      { keys: ["Ctrl", "Y"], description: "Redo" },
      { keys: ["Ctrl", "D"], description: "Duplicate selected widget" },
      { keys: ["Ctrl", "S"], description: "Save" },
      { keys: ["Ctrl", "L"], description: "Toggle widget lock" },
      { keys: ["Delete"], description: "Delete selected widget" },
      { keys: ["Esc"], description: "Deselect widget" },
    ],
  },
  {
    label: "Monitors",
    shortcuts: [
      { keys: ["N"], description: "New monitor (coming soon)" },
      { keys: ["↑", "↓"], description: "Navigate list (coming soon)" },
    ],
  },
];

function KeyBadge({ k }: { k: string }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[1.75rem] h-6 px-1.5 rounded border border-border bg-surface-elevated text-[10px] font-mono text-text-secondary font-semibold">
      {k}
    </kbd>
  );
}

export function KeyboardShortcuts() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "?" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-border bg-surface shadow-2xl shadow-black/50 mx-4 max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-border px-6 py-4">
          <Keyboard className="h-4 w-4 text-accent" />
          <h2 className="text-sm font-semibold text-text-primary flex-1">Keyboard Shortcuts</h2>
          <button
            onClick={() => setOpen(false)}
            className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="overflow-y-auto p-6 space-y-6">
          {SHORTCUTS.map((group) => (
            <div key={group.label}>
              <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
                {group.label}
              </p>
              <div className="space-y-2">
                {group.shortcuts.map((s, i) => (
                  <div key={i} className="flex items-center justify-between gap-4">
                    <span className="text-sm text-text-secondary">{s.description}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      {s.keys.map((k, ki) => (
                        <span key={ki} className="flex items-center gap-1">
                          {ki > 0 && <span className="text-text-muted text-xs">+</span>}
                          <KeyBadge k={k} />
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="border-t border-border px-6 py-3 text-xs text-text-muted">
          Press <KeyBadge k="?" /> to open this dialog
        </div>
      </div>
    </div>
  );
}

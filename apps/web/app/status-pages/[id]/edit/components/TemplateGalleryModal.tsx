"use client";

import { X } from "lucide-react";
import type { StatusTemplate } from "./types";
import { STATUS_TEMPLATES } from "./constants";

interface TemplateGalleryModalProps {
  onClose: () => void;
  onApply: (template: StatusTemplate) => void;
}

export function TemplateGalleryModal({ onClose, onApply }: TemplateGalleryModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-2xl border border-border bg-surface shadow-2xl shadow-black/50 mx-4 max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-text-primary">Template Gallery</h2>
            <p className="text-xs text-text-muted mt-0.5">
              Start from a preset layout. This will replace your current canvas.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="overflow-y-auto p-6 grid grid-cols-2 gap-4">
          {STATUS_TEMPLATES.map((tmpl) => (
            <button
              key={tmpl.id}
              onClick={() => onApply(tmpl)}
              className="text-left rounded-xl border border-border bg-bg/60 p-4 hover:border-accent/50 hover:bg-accent/5 transition-all group"
            >
              <div className="text-2xl mb-2">{tmpl.preview}</div>
              <p className="text-sm font-semibold text-text-primary group-hover:text-accent transition">
                {tmpl.name}
              </p>
              <p className="text-xs text-text-muted mt-1">{tmpl.description}</p>
              <p className="text-xs text-text-secondary/60 mt-2">{tmpl.widgets.length} widgets</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

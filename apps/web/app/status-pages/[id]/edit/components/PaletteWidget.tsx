"use client";

import { useDraggable } from "@dnd-kit/core";
import type { WidgetPaletteItem } from "./types";

export function PaletteWidget({ item, onQuickAdd }: { item: WidgetPaletteItem; onQuickAdd: (type: string) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette-${item.type}`,
    data: { source: "palette", widgetType: item.type, paletteItem: item },
  });
  const Icon = item.icon;
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      role="button"
      tabIndex={0}
      onDoubleClick={() => onQuickAdd(item.type)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onQuickAdd(item.type);
        }
      }}
      className={`w-full cursor-grab rounded-xl border border-border bg-bg p-3 text-left transition hover:border-accent/50 hover:bg-accent/5 active:cursor-grabbing focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${isDragging ? "opacity-40" : ""}`}
      title="Drag to canvas or double-click to add"
      aria-label={`Widget ${item.label}. Drag to canvas or double-click to add.`}
    >
      <div className="mb-1 flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 shrink-0 text-accent" />
        <span className="text-xs font-semibold text-text-primary">{item.label}</span>
      </div>
      <p className="text-[10px] leading-tight text-text-secondary">{item.description}</p>
      <p className="mt-1.5 text-[10px] text-text-secondary/60">Drag or double-click to add</p>
    </div>
  );
}

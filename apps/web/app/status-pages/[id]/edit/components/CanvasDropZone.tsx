"use client";

import { useCallback } from "react";
import { useDroppable } from "@dnd-kit/core";
import { LayoutGrid } from "lucide-react";

import type { Widget, ViewportMode } from "./types";
import { COL_COUNT, ROW_H } from "./constants";
import { CanvasWidget } from "./CanvasWidget";

export interface CanvasDropZoneProps {
  widgets: Widget[];
  selectedId: string | null;
  selectedIds: Set<string>;
  isDraggingOverCanvas: boolean;
  canvasRef: React.RefObject<HTMLDivElement | null>;
  zoom: number;
  viewportMode: ViewportMode;
  showGrid: boolean;
  alignGuides: { type: "h" | "v"; pos: number }[];
  paletteDropPreview: { x: number; y: number; w: number; h: number } | null;
  liveDataMode?: boolean;
  liveWidgetData?: Record<string, unknown>;
  onSelect: (id: string | null, shiftKey?: boolean) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onResize: (id: string, size: { w: number; h: number }) => void;
  onToggleLock: (id: string) => void;
}

export function CanvasDropZone({ widgets, selectedId, selectedIds, isDraggingOverCanvas, canvasRef, zoom, viewportMode, showGrid, alignGuides, paletteDropPreview, liveDataMode, liveWidgetData, onSelect, onDelete, onDuplicate, onResize, onToggleLock }: CanvasDropZoneProps) {
  const { setNodeRef, isOver } = useDroppable({ id: "canvas" });

  const maxY = widgets.length > 0
    ? Math.max(...widgets.map((w) => w.y + w.h))
    : 0;
  const minHeight = Math.max(maxY * ROW_H + ROW_H * 4, 480);

  // Combine refs
  const combinedRef = useCallback((node: HTMLDivElement | null) => {
    setNodeRef(node);
    if (canvasRef) {
      (canvasRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
    }
  }, [setNodeRef, canvasRef]);

  const viewportWidth = viewportMode === "mobile" ? 375 : viewportMode === "tablet" ? 768 : undefined;

  return (
    <div
      style={{
        transform: `scale(${zoom})`,
        transformOrigin: "top center",
        width: viewportWidth ? `${viewportWidth}px` : "100%",
        margin: viewportWidth ? "0 auto" : undefined,
        transition: "transform 0.15s ease, width 0.2s ease",
      }}
    >
    <div
      ref={combinedRef}
      className={`relative w-full transition-colors ${
        isOver ? "bg-accent/5" : ""
      } ${viewportWidth ? "border-x border-border/40 shadow-xl shadow-black/20" : ""}`}
      style={{ minHeight }}
      onClick={(e) => { if (!(e.target as HTMLElement).closest('[data-widget]')) onSelect(null); }}
    >
      {/* Grid guide lines — visible when showGrid is on or when dragging */}
      {(showGrid || isDraggingOverCanvas) && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: `
              repeating-linear-gradient(to right, rgba(255 255 255 / ${showGrid ? "0.08" : isDraggingOverCanvas ? "0.06" : "0.025"}) 0px, rgba(255 255 255 / ${showGrid ? "0.08" : isDraggingOverCanvas ? "0.06" : "0.025"}) 1px, transparent 1px, transparent calc(100% / ${COL_COUNT})),
              repeating-linear-gradient(to bottom, rgba(255 255 255 / ${showGrid ? "0.08" : isDraggingOverCanvas ? "0.06" : "0.025"}) 0px, rgba(255 255 255 / ${showGrid ? "0.08" : isDraggingOverCanvas ? "0.06" : "0.025"}) 1px, transparent 1px, transparent ${ROW_H}px)
            `,
            transition: "opacity 0.15s ease",
          }}
        />
      )}

      {/* Alignment guide lines — shown during drag */}
      {alignGuides.map((guide, i) =>
        guide.type === "h" ? (
          <div
            key={`guide-h-${i}`}
            className="pointer-events-none absolute left-0 right-0 z-50"
            style={{ top: guide.pos, height: 1, background: "rgba(99,102,241,0.7)" }}
          />
        ) : (
          <div
            key={`guide-v-${i}`}
            className="pointer-events-none absolute top-0 bottom-0 z-50"
            style={{ left: guide.pos, width: 1, background: "rgba(99,102,241,0.7)" }}
          />
        )
      )}

      {widgets.length === 0 && !isOver && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/10">
            <LayoutGrid className="h-8 w-8 text-accent/60" />
          </div>
          <h3 className="text-base font-semibold text-text-primary">Drag widgets here</h3>
          <p className="mt-2 max-w-xs text-center text-sm text-text-secondary">
            Drag widgets from the left panel to build your status page.
          </p>
        </div>
      )}

      {isOver && widgets.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center rounded-xl border-2 border-dashed border-accent/40">
          <p className="text-sm font-medium text-accent/70">Drop to add widget</p>
        </div>
      )}

      {paletteDropPreview && (
        <div
          className="pointer-events-none absolute z-40 rounded-xl border-2 border-dashed border-accent/70 bg-accent/10"
          style={{
            left: `${(paletteDropPreview.x / COL_COUNT) * 100}%`,
            top: `${paletteDropPreview.y * ROW_H}px`,
            width: `${(paletteDropPreview.w / COL_COUNT) * 100}%`,
            height: `${paletteDropPreview.h * ROW_H}px`,
          }}
        >
          <div className="absolute -top-6 left-0 rounded-md bg-accent/90 px-2 py-0.5 text-[10px] font-semibold text-white shadow-lg">
            Release to place
          </div>
        </div>
      )}

      {/* Render widgets (sorted by zOrder) */}
      {[...widgets].sort((a, b) => (a.zOrder ?? 0) - (b.zOrder ?? 0)).map((widget) => {
        const colWidth = canvasRef.current
          ? canvasRef.current.getBoundingClientRect().width / COL_COUNT
          : 0;
        return (
          <div key={widget.id} data-widget="true">
          <CanvasWidget
            widget={widget}
            isSelected={selectedId === widget.id}
            isMultiSelected={selectedIds.has(widget.id)}
            colWidth={colWidth}
            liveData={liveDataMode ? liveWidgetData?.[widget.id] : undefined}
            onSelect={onSelect}
            onDelete={onDelete}
            onDuplicate={onDuplicate}
            onResize={onResize}
            onToggleLock={onToggleLock}
          />
          </div>
        );
      })}
    </div>
    </div>
  );
}

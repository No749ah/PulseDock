"use client";

import { useCallback, useRef } from "react";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import {
  GripVertical,
  Lock,
  Unlock,
  Copy,
  X,
  LayoutGrid,
} from "lucide-react";

import type { Widget } from "./types";
import { WIDGET_PALETTE, COL_COUNT, ROW_H } from "./constants";
import { needsMonitorConfig } from "./utils";
import { WidgetPreview } from "./WidgetPreview";

export interface CanvasWidgetProps {
  widget: Widget;
  isSelected: boolean;
  isMultiSelected: boolean;
  colWidth: number;
  liveData?: unknown;
  onSelect: (id: string, shiftKey: boolean) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onResize: (id: string, size: { w: number; h: number }) => void;
  onToggleLock: (id: string) => void;
}

export function CanvasWidget({ widget, isSelected, isMultiSelected, colWidth, liveData, onSelect, onDelete, onDuplicate, onResize, onToggleLock }: CanvasWidgetProps) {
  const isLocked = Boolean(widget.locked);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `canvas-${widget.id}`,
    data: { source: "canvas", widget },
    disabled: isLocked,
  });

  // Mutable ref so the mousemove handler always reads the latest widget dimensions
  const widgetRef = useRef(widget);
  widgetRef.current = widget;

  const paletteItem = WIDGET_PALETTE.find((p) => p.type === widget.type);
  const Icon = paletteItem?.icon ?? LayoutGrid;

  const style: React.CSSProperties = {
    position: "absolute",
    left: `${(widget.x / COL_COUNT) * 100}%`,
    top: widget.y * ROW_H,
    width: `${(widget.w / COL_COUNT) * 100}%`,
    height: widget.h * ROW_H,
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.3 : 1,
    zIndex: isDragging ? 10 : isSelected ? 5 : 1,
  };

  const handleResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      const startX = e.clientX;
      const startY = e.clientY;
      const startW = widgetRef.current.w;
      const startH = widgetRef.current.h;

      const onMouseMove = (ev: MouseEvent) => {
        if (colWidth <= 0) return;
        const newW = Math.max(1, Math.min(COL_COUNT - widgetRef.current.x, startW + Math.round((ev.clientX - startX) / colWidth)));
        const newH = Math.max(1, Math.min(10, startH + Math.round((ev.clientY - startY) / ROW_H)));
        onResize(widgetRef.current.id, { w: newW, h: newH });
      };

      const onMouseUp = () => {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.body.style.cursor = "nwse-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [colWidth, onResize]
  );

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={(e) => { e.stopPropagation(); onSelect(widget.id, e.shiftKey); }}
      className={`group relative flex flex-col rounded-xl border-2 bg-surface transition-colors ${
        isSelected ? "border-accent shadow-lg shadow-accent/10" : isMultiSelected ? "border-accent/60 shadow shadow-accent/10 bg-accent/5" : "border-border hover:border-accent/40"
      }`}
    >
      {/* Header bar with drag handle + title */}
      <div className="flex items-center gap-1 border-b border-border/60 px-3 py-2">
        <div
          {...(isLocked ? {} : { ...listeners, ...attributes })}
          className={`p-0.5 text-text-secondary/40 ${isLocked ? "cursor-not-allowed opacity-30" : "cursor-grab hover:text-text-secondary active:cursor-grabbing"}`}
          onClick={(e) => e.stopPropagation()}
          title={isLocked ? "Widget is locked — unlock to move" : "Drag to move"}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </div>
        <Icon className="h-3 w-3 text-accent/70" />
        {isLocked && <Lock className="h-2.5 w-2.5 text-amber-400/70 flex-shrink-0" aria-label="Locked" />}
        <span className="flex-1 text-xs font-medium text-text-secondary">
          {paletteItem?.label ?? widget.type}
        </span>
        {widget.config.label && (
          <span className="truncate max-w-[80px] text-xs text-text-secondary/60">
            {widget.config.label as string}
          </span>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onToggleLock(widget.id); }}
          className={`ml-1 flex h-5 w-5 items-center justify-center rounded transition ${
            isLocked
              ? "text-amber-400 opacity-100"
              : "text-text-secondary/40 opacity-0 hover:bg-amber-500/10 hover:text-amber-400 group-hover:opacity-100"
          }`}
          title={isLocked ? "Unlock widget" : "Lock widget (prevent accidental moves)"}
        >
          {isLocked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDuplicate(widget.id); }}
          className="ml-1 flex h-5 w-5 items-center justify-center rounded text-text-secondary/40 opacity-0 transition hover:bg-accent/10 hover:text-accent group-hover:opacity-100"
          title="Duplicate widget"
        >
          <Copy className="h-3 w-3" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(widget.id); }}
          className="ml-1 flex h-5 w-5 items-center justify-center rounded text-text-secondary/40 opacity-0 transition hover:bg-red-500/10 hover:text-red-400 group-hover:opacity-100"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
      {/* Widget preview */}
      <div className="flex-1 overflow-hidden p-2 relative">
        <WidgetPreview type={widget.type} config={widget.config} w={widget.w} liveData={liveData} />
        {/* Unconfigured monitor badge — top-right corner */}
        {needsMonitorConfig(widget) && (
          <div className="absolute top-1 right-1 z-10 pointer-events-none">
            <div className="flex items-center gap-1 rounded-md bg-orange-500/90 px-1.5 py-0.5 text-[10px] font-semibold text-white shadow-sm">
              <span>⚠️</span>
              <span>Configure</span>
            </div>
          </div>
        )}
      </div>
      {/* Resize handle — bottom-right corner (hidden when locked) */}
      {!isLocked && (
      <div
        onMouseDown={handleResizeMouseDown}
        onClick={(e) => e.stopPropagation()}
        title={`Drag to resize · ${widget.w} cols × ${widget.h} rows`}
        className={`absolute bottom-1 right-1 flex h-5 w-5 cursor-nwse-resize items-center justify-center rounded transition-opacity ${
          isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-60"
        }`}
      >
        <svg viewBox="0 0 10 10" className="h-3.5 w-3.5 text-text-secondary/60" aria-hidden="true">
          <circle cx="8" cy="8" r="1.1" fill="currentColor" />
          <circle cx="4.5" cy="8" r="1.1" fill="currentColor" />
          <circle cx="8" cy="4.5" r="1.1" fill="currentColor" />
        </svg>
      </div>
      )}
    </div>
  );
}

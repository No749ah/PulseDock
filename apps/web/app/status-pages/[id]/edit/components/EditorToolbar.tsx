"use client";

import {
  Save,
  Eye,
  ExternalLink,
  ChevronLeft,
  EyeOff,
  Activity,
  Grid,
  X,
  Undo2,
  Redo2,
  Monitor,
  Tablet,
  Smartphone,
  ZoomIn,
  ZoomOut,
  Maximize2,
  LayoutTemplate,
  Settings2,
  RefreshCw,
  History,
  AlignStartVertical,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignEndHorizontal,
  AlignCenterVertical,
  AlignCenterHorizontal,
} from "lucide-react";
import type { StatusPage, ViewportMode } from "./types";

interface EditorToolbarProps {
  page: StatusPage;
  widgets: unknown[];
  publicBase: string;
  selectedId: string | null;
  selectedIds: Set<string>;
  publishing: boolean;
  saving: boolean;
  isDirty: boolean;
  autoSaveEnabled: boolean;
  showGrid: boolean;
  zoom: number;
  viewportMode: ViewportMode;
  liveDataMode: boolean;
  loadingLiveData: boolean;
  versionHistoryLength: number;
  onBack: () => void;
  onDeselect: () => void;
  onAlignSelected: (dir: "left" | "right" | "top" | "bottom" | "center-h" | "center-v") => void;
  onTogglePublish: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onSetViewportMode: (mode: ViewportMode) => void;
  onToggleGrid: () => void;
  onToggleLiveData: () => void;
  onZoomOut: () => void;
  onZoomIn: () => void;
  onZoomReset: () => void;
  onZoomFit: () => void;
  onOpenVersionHistory: () => void;
  onOpenTemplates: () => void;
  onOpenSettings: () => void;
  onToggleAutoSave: () => void;
  onSave: () => void;
}

export function EditorToolbar({
  page,
  widgets,
  publicBase,
  selectedId,
  selectedIds,
  publishing,
  saving,
  isDirty,
  autoSaveEnabled,
  showGrid,
  zoom,
  viewportMode,
  liveDataMode,
  loadingLiveData,
  versionHistoryLength,
  onBack,
  onDeselect,
  onAlignSelected,
  onTogglePublish,
  onUndo,
  onRedo,
  onSetViewportMode,
  onToggleGrid,
  onToggleLiveData,
  onZoomOut,
  onZoomIn,
  onZoomReset,
  onZoomFit,
  onOpenVersionHistory,
  onOpenTemplates,
  onOpenSettings,
  onToggleAutoSave,
  onSave,
}: EditorToolbarProps) {
  const allSelectedIds = new Set(selectedIds);
  if (selectedId) allSelectedIds.add(selectedId);
  const selectedCount = allSelectedIds.size;

  return (
    <header className="flex items-center gap-3 border-b border-border bg-surface/80 px-4 py-3 backdrop-blur-sm">
      {/* Back */}
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-text-secondary transition hover:text-text-primary"
      >
        <ChevronLeft className="h-4 w-4" />
        Pages
      </button>
      <div className="mx-2 h-4 w-px bg-border" />

      {/* Page title */}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-sm font-semibold text-text-primary">{page.title}</h1>
        <div className="flex items-center gap-2">
          <code className="font-mono text-xs text-text-secondary">/status/{page.slug}</code>
          {page.isPublished && (
            <span className="inline-flex items-center gap-1 rounded-full bg-green-500/15 px-2 py-0.5 text-xs font-semibold text-green-400">
              <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
              Live
            </span>
          )}
        </div>
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-text-secondary/60">
          {widgets.length} widget{widgets.length !== 1 ? "s" : ""}
        </span>

        {/* Multi-select indicator + alignment */}
        {selectedIds.size > 0 && (
          <>
            <span className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 text-xs font-semibold text-accent">
              {selectedCount} selected
              <button
                onClick={onDeselect}
                className="ml-1 hover:text-accent/70 transition"
                title="Deselect all"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
            {selectedCount >= 2 && (
              <div
                className="flex items-center rounded-lg border border-border bg-bg overflow-hidden"
                title="Align selected widgets"
              >
                {(
                  [
                    {
                      icon: AlignStartVertical,
                      dir: "left" as const,
                      title: "Align left edges",
                    },
                    {
                      icon: AlignCenterVertical,
                      dir: "center-h" as const,
                      title: "Center horizontally",
                    },
                    {
                      icon: AlignEndVertical,
                      dir: "right" as const,
                      title: "Align right edges",
                    },
                    {
                      icon: AlignStartHorizontal,
                      dir: "top" as const,
                      title: "Align top edges",
                    },
                    {
                      icon: AlignCenterHorizontal,
                      dir: "center-v" as const,
                      title: "Center vertically",
                    },
                    {
                      icon: AlignEndHorizontal,
                      dir: "bottom" as const,
                      title: "Align bottom edges",
                    },
                  ] as const
                ).map(({ icon: Icon, dir, title }) => (
                  <button
                    key={dir}
                    onClick={() => onAlignSelected(dir)}
                    title={title}
                    className="flex items-center justify-center px-2 py-1.5 text-text-secondary/60 transition hover:bg-accent/10 hover:text-accent"
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {/* Full Preview */}
        <a
          href={`/status-pages/${page.id}/preview`}
          target="_blank"
          rel="noopener noreferrer"
          title="Open full preview with live data (opens in new tab)"
          className="flex items-center gap-1.5 rounded-lg border border-border bg-bg px-3 py-1.5 text-xs font-medium text-text-secondary transition hover:text-text-primary"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Full Preview
        </a>

        {/* Public Page link */}
        {page.isPublished && (
          <a
            href={`${publicBase}/status/${page.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-lg border border-border bg-bg px-3 py-1.5 text-xs font-medium text-text-secondary transition hover:text-text-primary"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Public Page
          </a>
        )}

        {/* Publish/Unpublish */}
        <button
          onClick={onTogglePublish}
          disabled={publishing}
          className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition disabled:opacity-50 ${
            page.isPublished
              ? "border-border bg-bg text-text-secondary hover:border-red-500/40 hover:text-red-400"
              : "border-green-500/40 bg-green-500/10 text-green-400 hover:bg-green-500/20"
          }`}
        >
          {page.isPublished ? (
            <>
              <EyeOff className="h-3.5 w-3.5" /> Unpublish
            </>
          ) : (
            <>
              <Eye className="h-3.5 w-3.5" /> Publish
            </>
          )}
        </button>

        {/* Undo/Redo */}
        <button
          onClick={onUndo}
          title="Undo (Ctrl+Z)"
          className="flex items-center gap-1.5 rounded-lg border border-border bg-bg px-2 py-1.5 text-xs text-text-secondary transition hover:text-text-primary disabled:opacity-30"
        >
          <Undo2 className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={onRedo}
          title="Redo (Ctrl+Y)"
          className="flex items-center gap-1.5 rounded-lg border border-border bg-bg px-2 py-1.5 text-xs text-text-secondary transition hover:text-text-primary disabled:opacity-30"
        >
          <Redo2 className="h-3.5 w-3.5" />
        </button>

        {/* Viewport mode */}
        <div className="flex items-center rounded-lg border border-border bg-bg overflow-hidden">
          {(
            [
              { mode: "desktop" as ViewportMode, icon: Monitor, title: "Desktop view" },
              { mode: "tablet" as ViewportMode, icon: Tablet, title: "Tablet view (768px)" },
              { mode: "mobile" as ViewportMode, icon: Smartphone, title: "Mobile view (375px)" },
            ] as const
          ).map(({ mode, icon: Icon, title }) => (
            <button
              key={mode}
              onClick={() => onSetViewportMode(mode)}
              title={title}
              className={`flex items-center justify-center px-2.5 py-1.5 text-xs transition ${
                viewportMode === mode
                  ? "bg-accent/10 text-accent"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
            </button>
          ))}
        </div>

        {/* Grid toggle */}
        <button
          onClick={onToggleGrid}
          title={showGrid ? "Hide grid" : "Show grid"}
          className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs transition ${
            showGrid
              ? "border-accent/40 bg-accent/10 text-accent"
              : "border-border bg-bg text-text-secondary hover:text-text-primary"
          }`}
        >
          <Grid className="h-3.5 w-3.5" />
        </button>

        {/* Live data toggle */}
        <button
          onClick={onToggleLiveData}
          disabled={loadingLiveData}
          title={
            liveDataMode
              ? "Showing live data — click to switch back to static preview"
              : "Preview with live data from your monitors"
          }
          className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs transition disabled:opacity-50 ${
            liveDataMode
              ? "border-green-500/40 bg-green-500/10 text-green-400"
              : "border-border bg-bg text-text-secondary hover:text-text-primary"
          }`}
        >
          {loadingLiveData ? (
            <>
              <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Loading…
            </>
          ) : (
            <>
              <Activity className="h-3.5 w-3.5" /> {liveDataMode ? "Live" : "Preview"}
            </>
          )}
        </button>

        {/* Zoom controls */}
        <div className="flex items-center rounded-lg border border-border bg-bg overflow-hidden">
          <button
            onClick={onZoomOut}
            title="Zoom out (Ctrl+scroll)"
            className="flex items-center justify-center px-2 py-1.5 text-xs text-text-secondary hover:text-text-primary transition"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onZoomReset}
            title="Reset zoom"
            className="px-2 py-1.5 text-xs font-mono text-text-secondary hover:text-text-primary transition min-w-[40px] text-center"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            onClick={onZoomIn}
            title="Zoom in (Ctrl+scroll)"
            className="flex items-center justify-center px-2 py-1.5 text-xs text-text-secondary hover:text-text-primary transition"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onZoomFit}
            title="Fit to screen"
            className="flex items-center justify-center px-2 py-1.5 text-xs text-text-secondary hover:text-text-primary transition border-l border-border"
          >
            <Maximize2 className="h-3 w-3" />
          </button>
        </div>

        {/* Version history */}
        <button
          onClick={onOpenVersionHistory}
          title={`Version history — ${versionHistoryLength} save${versionHistoryLength !== 1 ? "s" : ""} stored`}
          className="flex items-center gap-1.5 rounded-lg border border-border bg-bg px-3 py-1.5 text-xs font-medium text-text-secondary transition hover:text-text-primary"
        >
          <History className="h-3.5 w-3.5" />
          History
          {versionHistoryLength > 0 && (
            <span className="ml-0.5 rounded-full bg-accent/20 px-1.5 py-0.5 text-[10px] font-semibold text-accent">
              {versionHistoryLength}
            </span>
          )}
        </button>

        {/* Templates */}
        <button
          onClick={onOpenTemplates}
          className="flex items-center gap-1.5 rounded-lg border border-border bg-bg px-3 py-1.5 text-xs font-medium text-text-secondary transition hover:text-text-primary"
        >
          <LayoutTemplate className="h-3.5 w-3.5" />
          Templates
        </button>

        {/* Settings */}
        <button
          onClick={onOpenSettings}
          className="flex items-center gap-1.5 rounded-lg border border-border bg-bg px-3 py-1.5 text-xs font-medium text-text-secondary transition hover:text-text-primary"
        >
          <Settings2 className="h-3.5 w-3.5" />
          Settings
        </button>

        {/* Auto-save toggle */}
        <button
          onClick={onToggleAutoSave}
          title={
            autoSaveEnabled
              ? "Auto-save is ON — click to disable"
              : "Auto-save is OFF — click to enable"
          }
          className={`flex items-center gap-1 rounded-lg border px-2 py-1.5 text-xs transition ${
            autoSaveEnabled
              ? "border-accent/40 bg-accent/10 text-accent"
              : "border-border bg-bg text-text-secondary hover:text-text-primary"
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              autoSaveEnabled ? "bg-accent animate-pulse" : "bg-text-secondary/40"
            }`}
          />
          Auto
        </button>

        {/* Save button */}
        <button
          onClick={onSave}
          disabled={saving || !isDirty}
          title={isDirty ? "Save changes" : "No unsaved changes"}
          className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-accent/90 disabled:opacity-40 disabled:cursor-default"
        >
          <Save className="h-3.5 w-3.5" />
          {saving ? "Saving…" : isDirty ? "Save*" : "Saved"}
        </button>
      </div>
    </header>
  );
}

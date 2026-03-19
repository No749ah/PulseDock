"use client";

import { useState } from "react";

export function ExportImageButton({ slug }: { slug: string }) {
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      // Dynamically import html2canvas to avoid SSR issues
      const html2canvas = (await import("html2canvas")).default;

      // Find the main status page content area
      const target =
        document.getElementById("status-page-content") ??
        document.querySelector("main") ??
        document.body;

      const canvas = await html2canvas(target as HTMLElement, {
        backgroundColor: "#0a0a0f",
        scale: 2, // 2x for retina quality
        useCORS: true,
        allowTaint: false,
        logging: false,
        ignoreElements: (el) => {
          // Skip interactive buttons and no-print elements
          return (
            el.classList.contains("no-print") ||
            el.getAttribute("data-html2canvas-ignore") === "true"
          );
        },
      });

      const link = document.createElement("a");
      link.download = `status-${slug}-${new Date().toISOString().slice(0, 10)}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (err) {
      console.error("Export failed:", err);
    } finally {
      setExporting(false);
    }
  };

  return (
    <button
      onClick={handleExport}
      disabled={exporting}
      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface/60 px-3 py-1.5 text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors print:hidden disabled:opacity-50 disabled:cursor-not-allowed"
      aria-label="Export status page as PNG image"
      data-html2canvas-ignore="true"
    >
      {exporting ? (
        <>
          <svg
            className="h-3.5 w-3.5 animate-spin"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
          Exporting…
        </>
      ) : (
        <>
          <svg
            className="h-3.5 w-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Save as PNG
        </>
      )}
    </button>
  );
}

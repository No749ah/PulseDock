"use client";

import { useState } from "react";

export function ExportPDFButton({ slug }: { slug: string }) {
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const [html2canvasModule, jsPDFModule] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);
      const html2canvas = html2canvasModule.default;
      const { jsPDF } = jsPDFModule;

      const target =
        document.getElementById("status-page-content") ??
        document.querySelector("main") ??
        document.body;

      const canvas = await html2canvas(target as HTMLElement, {
        backgroundColor: "#0a0a0f",
        scale: 1.5,
        useCORS: true,
        allowTaint: false,
        logging: false,
        ignoreElements: (el) =>
          el.classList.contains("no-print") ||
          el.getAttribute("data-html2canvas-ignore") === "true",
      });

      const imgData = canvas.toDataURL("image/png");
      const imgWidth = canvas.width;
      const imgHeight = canvas.height;

      // A4 size in mm: 210 × 297. Landscape if wider.
      const pdfWidth = 210;
      const pdfHeight = (imgHeight * pdfWidth) / imgWidth;

      const orientation = pdfHeight > 297 ? "portrait" : "landscape";
      const pdf = new jsPDF({
        orientation,
        unit: "mm",
        format: "a4",
        compress: true,
      });

      // If content is taller than one page, split across pages
      const pageHeightMM = pdf.internal.pageSize.getHeight();
      const totalPages = Math.ceil(pdfHeight / pageHeightMM);

      for (let i = 0; i < totalPages; i++) {
        if (i > 0) pdf.addPage();
        // Offset: shift image up by i * pageHeightMM to show next slice
        pdf.addImage(imgData, "PNG", 0, -i * pageHeightMM, pdfWidth, pdfHeight);
      }

      const filename = `status-${slug}-${new Date().toISOString().slice(0, 10)}.pdf`;
      pdf.save(filename);
    } catch (_err) {
      // Silent fail — button re-enables; user can retry
    } finally {
      setExporting(false);
    }
  };

  return (
    <button
      onClick={handleExport}
      disabled={exporting}
      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface/60 px-3 py-1.5 text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors print:hidden disabled:opacity-50 disabled:cursor-not-allowed"
      aria-label="Export status page as PDF"
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
          Generating PDF…
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
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <polyline points="10 9 9 9 8 9" />
          </svg>
          Save as PDF
        </>
      )}
    </button>
  );
}

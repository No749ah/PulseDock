"use client";

import { useEffect, useState } from "react";

export function PrintButton() {
  const [url, setUrl] = useState("");
  const [ts, setTs] = useState("");

  useEffect(() => {
    setUrl(window.location.href);
    const now = new Date();
    setTs(
      now.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) +
        " · " +
        now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) +
        " " +
        Intl.DateTimeFormat().resolvedOptions().timeZone
    );
  }, []);

  return (
    <>
      {/* Screen: print button */}
      <button
        onClick={() => window.print()}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface/60 px-3 py-1.5 text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors print:hidden"
        aria-label="Print or save as PDF"
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <polyline points="6 9 6 2 18 2 18 9" />
          <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
          <rect x="6" y="14" width="12" height="8" />
        </svg>
        Print / Save PDF
      </button>

      {/* Print-only: report meta footer (hidden on screen via CSS, shown by @media print) */}
      {ts && (
        <div className="status-print-meta">
          <span>Generated: {ts}</span>
          {url && <span style={{ wordBreak: "break-all", marginLeft: "16pt" }}>{url}</span>}
        </div>
      )}
    </>
  );
}

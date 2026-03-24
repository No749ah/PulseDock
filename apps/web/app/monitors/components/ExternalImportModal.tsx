import React, { useRef } from "react";
import { X, Upload } from "lucide-react";
import { Button } from "../../components/Button";

type ImportSource = "uptime-robot" | "better-uptime" | "uptime-kuma" | "csv";

interface ExternalImportResult {
  imported: number;
  skipped: number;
  errors: Array<{ index: number; name: string; error: string }>;
  message: string;
}

interface ExternalImportModalProps {
  source: ImportSource;
  onSourceChange: (source: ImportSource) => void;
  importing: boolean;
  result: ExternalImportResult | null;
  onClose: () => void;
  onImportFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export function ExternalImportModal({
  source,
  onSourceChange,
  importing,
  result,
  onClose,
  onImportFile,
}: ExternalImportModalProps) {
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-surface border border-border rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-text-primary">Import from external service</h2>
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Source selector */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-text-primary">Source</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {([
                { id: "uptime-robot" as const, label: "Uptime Robot", hint: "JSON export" },
                { id: "better-uptime" as const, label: "BetterUptime", hint: "JSON export" },
                { id: "uptime-kuma" as const, label: "Uptime Kuma", hint: "JSON backup" },
                { id: "csv" as const, label: "Generic CSV", hint: ".csv file" },
              ]).map((s) => (
                <button
                  key={s.id}
                  onClick={() => onSourceChange(s.id)}
                  className={`flex flex-col items-center gap-1 px-3 py-3 rounded-xl border text-sm transition-colors ${
                    source === s.id
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-border bg-surface-secondary text-text-secondary hover:border-accent/50"
                  }`}
                >
                  <span className="font-medium">{s.label}</span>
                  <span className="text-xs opacity-70">{s.hint}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Instructions */}
          <div className="rounded-xl bg-surface-secondary border border-border p-4 text-xs text-text-secondary space-y-1">
            {source === "uptime-robot" && (
              <>
                <p className="font-medium text-text-primary mb-1">How to export from Uptime Robot:</p>
                <p>1. Log in → My Settings → Export → Download JSON</p>
                <p>2. Upload the downloaded <code className="font-mono bg-surface px-1 rounded">uptimerobot-*.json</code> file below.</p>
                <p className="mt-1 text-text-secondary/70">Only HTTP/HTTPS monitors are imported. Ping, port, and keyword monitors are skipped.</p>
              </>
            )}
            {source === "better-uptime" && (
              <>
                <p className="font-medium text-text-primary mb-1">How to export from BetterUptime:</p>
                <p>1. Use the BetterUptime API: <code className="font-mono bg-surface px-1 rounded">GET /api/v2/monitors</code></p>
                <p>2. Save the JSON response and upload it below.</p>
                <p className="mt-1 text-text-secondary/70">Only status/keyword check types are imported.</p>
              </>
            )}
            {source === "uptime-kuma" && (
              <>
                <p className="font-medium text-text-primary mb-1">How to export from Uptime Kuma:</p>
                <p>1. Open Uptime Kuma → Settings → Backup → Export</p>
                <p>2. Save the downloaded <code className="font-mono bg-surface px-1 rounded">backup.json</code> file.</p>
                <p>3. Upload the file below — all HTTP monitors will be imported.</p>
                <p className="mt-1 text-text-secondary/70">Only HTTP/HTTPS monitors are imported. Port, ping, and DNS monitors are skipped.</p>
              </>
            )}
            {source === "csv" && (
              <>
                <p className="font-medium text-text-primary mb-1">CSV format:</p>
                <p>First row must be headers. Required column: <code className="font-mono bg-surface px-1 rounded">url</code></p>
                <p>Optional: <code className="font-mono bg-surface px-1 rounded">name</code>, <code className="font-mono bg-surface px-1 rounded">interval</code>, <code className="font-mono bg-surface px-1 rounded">paused</code></p>
              </>
            )}
          </div>

          {/* Result */}
          {result && (
            <div className={`rounded-xl p-4 border text-sm ${
              result.errors.length === 0 && result.imported > 0
                ? "bg-success/10 border-success/20 text-success"
                : result.imported === 0
                  ? "bg-danger/10 border-danger/20 text-danger"
                  : "bg-warning/10 border-warning/20 text-warning"
            }`}>
              <p className="font-medium">{result.message}</p>
              {result.skipped > 0 && (
                <p className="text-xs mt-1 opacity-80">{result.skipped} duplicate{result.skipped !== 1 ? "s" : ""} skipped (URL already monitored).</p>
              )}
              {result.errors.map((err, i) => (
                <p key={i} className="text-xs mt-1 opacity-80">⚠ {err.name}: {err.error}</p>
              ))}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-border flex items-center justify-between gap-3">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => fileRef.current?.click()}
            disabled={importing}
            className="flex items-center gap-2"
          >
            <Upload className="w-4 h-4" />
            {importing ? "Importing…" : "Choose file & Import"}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept={source === "csv" ? ".csv,text/csv" : ".json,application/json"}
            className="hidden"
            onChange={(e) => {
              onImportFile(e);
              // Reset file input so the same file can be re-imported
              if (fileRef.current) fileRef.current.value = "";
            }}
          />
        </div>
      </div>
    </div>
  );
}

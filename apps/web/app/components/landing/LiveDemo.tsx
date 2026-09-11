"use client";

import { useState, useRef } from "react";
import { FadeIn } from "../FadeIn";
import { GradientText } from "../GradientText";
import { ArrowRight } from "lucide-react";

/* ────────────────────────────────────────────────────────────
   Sub-components (only used here)
   ──────────────────────────────────────────────────────────── */

function StatusDot({ status }: { status: "up" | "warning" | "down" }) {
  const colors = {
    up: "bg-success",
    warning: "bg-warning",
    down: "bg-danger",
  };
  return (
    <div className={`w-2 h-2 rounded-full shrink-0 ${colors[status]}`} />
  );
}

function MiniSparkline({ bars }: { bars: number[] }) {
  return (
    <div className="flex items-end gap-[1.5px] h-4">
      {bars.map((h, i) => (
        <div
          key={i}
          className="w-[2px] rounded-full bg-success/50"
          style={{ height: `${h}%` }}
        />
      ))}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   Data
   ──────────────────────────────────────────────────────────── */

const previewMonitors = [
  { name: "api.prod", status: "up", latency: "34ms", trend: [80, 84, 88, 82, 90, 86, 92, 88] },
  { name: "web.prod", status: "up", latency: "41ms", trend: [78, 86, 82, 90, 87, 92, 89, 94] },
  { name: "db.cluster", status: "up", latency: "12ms", trend: [92, 90, 95, 93, 97, 96, 98, 97] },
  { name: "cdn.edge", status: "warning", latency: "164ms", trend: [74, 72, 79, 69, 76, 81, 73, 78] },
] as const;

const previewVersions = [
  { name: "Kubernetes", current: "v1.30.2", latest: "v1.30.3", state: "update" },
  { name: "PostgreSQL", current: "16.3", latest: "16.3", state: "ok" },
  { name: "Grafana", current: "11.1.0", latest: "11.1.1", state: "update" },
  { name: "Redis", current: "7.2.5", latest: "7.2.5", state: "ok" },
] as const;

const presetUrls = ["https://github.com", "https://cloudflare.com", "https://vercel.com"];

/* ────────────────────────────────────────────────────────────
   Types
   ──────────────────────────────────────────────────────────── */

interface CheckResult {
  url: string;
  status: "checking" | "up" | "down" | "error";
  statusCode?: number;
  latencyMs?: number;
  error?: string;
}

/* ────────────────────────────────────────────────────────────
   LiveDemo
   ──────────────────────────────────────────────────────────── */

export function LiveDemo() {
  const [inputUrl, setInputUrl] = useState("");
  const [results, setResults] = useState<CheckResult[]>([]);
  const [checking, setChecking] = useState(false);
  const [mode, setMode] = useState<"checker" | "preview">("preview");
  const inputRef = useRef<HTMLInputElement>(null);

  async function checkUrl(rawUrl: string) {
    let url = rawUrl.trim();
    if (!url) return;
    if (!url.startsWith("http")) url = `https://${url}`;

    const existing = results.find((r) => r.url === url);
    if (existing && existing.status !== "error") return;

    setChecking(true);
    const start = Date.now();

    setResults((prev) => {
      const next = prev.filter((r) => r.url !== url);
      return [{ url, status: "checking" as const }, ...next].slice(0, 6);
    });

    try {
      const res = await fetch(`/api/check-url?url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(10000) });
      const data = await res.json() as { ok: boolean; status?: number; latencyMs?: number; error?: string };
      const latencyMs = data.latencyMs ?? (Date.now() - start);
      setResults((prev) => prev.map((r) =>
        r.url === url
          ? { url, status: data.ok ? "up" : "down", statusCode: data.status, latencyMs }
          : r
      ));
    } catch {
      setResults((prev) => prev.map((r) =>
        r.url === url ? { url, status: "error", error: "Request failed" } : r
      ));
    } finally {
      setChecking(false);
      setInputUrl("");
    }
  }

  const statusColor = (s: CheckResult["status"]) =>
    s === "up" ? "bg-success text-success" : s === "checking" ? "bg-accent text-accent" : "bg-danger text-danger";
  const statusLabel = (r: CheckResult) =>
    r.status === "checking" ? "Checking…" : r.status === "up" ? `${r.statusCode ?? 200} OK` : r.status === "down" ? `${r.statusCode ?? "Error"}` : "Failed";

  return (
    <div className="mx-auto max-w-5xl px-6">
      <FadeIn>
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-4">
            Interactive{" "}
            <GradientText from="#58a6ff" to="#3fb950">
              Live Demo
            </GradientText>
          </h2>
          <p className="text-text-secondary text-lg max-w-2xl mx-auto">
            Explore a mini PulseDock dashboard preview, or run a real uptime check directly in your browser.
          </p>
        </div>
      </FadeIn>

      <FadeIn delay={0.15}>
        <div className="rounded-2xl border border-border bg-surface shadow-2xl shadow-black/40 overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-surface-elevated">
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-danger/50" />
              <div className="w-3 h-3 rounded-full bg-warning/50" />
              <div className="w-3 h-3 rounded-full bg-success/50" />
            </div>
            <div className="flex-1 mx-4">
              <div className="bg-bg/60 rounded-md px-3 py-1.5 text-xs text-text-muted text-center font-mono">
                PulseDock — {mode === "preview" ? "Dashboard Preview" : "Live URL Checker"}
              </div>
            </div>
          </div>

          <div className="p-6 md:p-8 space-y-5">
            <div className="inline-flex rounded-xl border border-border bg-bg/60 p-1">
              <button
                onClick={() => setMode("preview")}
                className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition ${mode === "preview" ? "bg-accent text-white" : "text-text-secondary hover:text-text-primary"}`}
              >
                Dashboard Preview
              </button>
              <button
                onClick={() => setMode("checker")}
                className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition ${mode === "checker" ? "bg-accent text-white" : "text-text-secondary hover:text-text-primary"}`}
              >
                Live URL Check
              </button>
            </div>

            {mode === "preview" && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="rounded-xl border border-border bg-bg/50 p-3">
                    <p className="text-xs text-text-secondary mb-1">Overall Status</p>
                    <p className="text-sm font-semibold text-success">Operational</p>
                  </div>
                  <div className="rounded-xl border border-border bg-bg/50 p-3">
                    <p className="text-xs text-text-secondary mb-1">30d Uptime</p>
                    <p className="text-sm font-semibold text-text-primary">99.97%</p>
                  </div>
                  <div className="rounded-xl border border-border bg-bg/50 p-3">
                    <p className="text-xs text-text-secondary mb-1">Updates Available</p>
                    <p className="text-sm font-semibold text-warning">2 pending</p>
                  </div>
                </div>

                <div className="rounded-xl border border-border bg-bg/40 overflow-hidden">
                  <div className="px-4 py-2 border-b border-border/60 flex items-center justify-between">
                    <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Monitors</span>
                    <span className="text-xs text-success">● Live</span>
                  </div>
                  <div className="divide-y divide-border/40">
                    {previewMonitors.map((item) => (
                      <div key={item.name} className="flex items-center gap-3 px-4 py-2.5">
                        <StatusDot status={item.status === "warning" ? "warning" : "up"} />
                        <span className="text-xs text-text-primary font-mono flex-1 truncate">{item.name}</span>
                        <MiniSparkline bars={[...item.trend]} />
                        <span className={`text-xs tabular-nums w-12 text-right ${item.status === "warning" ? "text-warning" : "text-text-muted"}`}>
                          {item.latency}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-border bg-bg/40 overflow-hidden">
                  <div className="px-4 py-2 border-b border-border/60">
                    <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Version Checks</span>
                  </div>
                  <div className="divide-y divide-border/40">
                    {previewVersions.map((v) => (
                      <div key={v.name} className="flex items-center gap-3 px-4 py-2.5">
                        <span className="text-xs text-text-primary flex-1">{v.name}</span>
                        <span className="text-xs text-text-muted font-mono">{v.current}</span>
                        <ArrowRight className="w-3 h-3 text-text-muted" />
                        <span className="text-xs text-text-primary font-mono">{v.latest}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border ${v.state === "ok" ? "text-success border-success/30 bg-success/10" : "text-warning border-warning/30 bg-warning/10"}`}>
                          {v.state === "ok" ? "Up to date" : "Update available"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {mode === "checker" && (
              <>
                <form
                  onSubmit={(e) => { e.preventDefault(); checkUrl(inputUrl); }}
                  className="flex gap-2"
                >
                  <input
                    ref={inputRef}
                    type="text"
                    value={inputUrl}
                    onChange={(e) => setInputUrl(e.target.value)}
                    placeholder="Enter any URL to check (e.g. https://github.com)"
                    className="flex-1 rounded-xl border border-border bg-bg px-4 py-3 text-sm text-text-primary placeholder:text-text-secondary/50 focus:border-accent focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={checking || !inputUrl.trim()}
                    className="rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:bg-accent/90 disabled:opacity-50 shrink-0"
                  >
                    Check
                  </button>
                </form>

                <div className="flex flex-wrap gap-2">
                  <span className="text-xs text-text-secondary">Try:</span>
                  {presetUrls.map((url) => (
                    <button
                      key={url}
                      onClick={() => checkUrl(url)}
                      disabled={checking}
                      className="text-xs rounded-lg border border-border bg-bg/60 px-3 py-1 text-text-secondary hover:text-accent hover:border-accent/40 transition disabled:opacity-50"
                    >
                      {url.replace("https://", "")}
                    </button>
                  ))}
                </div>

                {results.length > 0 && (
                  <div className="space-y-2">
                    {results.map((r) => (
                      <div
                        key={r.url}
                        className="flex items-center gap-3 rounded-xl border border-border bg-bg/40 px-4 py-3"
                      >
                        <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${statusColor(r.status).split(" ")[0]} ${r.status === "checking" ? "animate-pulse" : ""}`} />
                        <span className="text-sm text-text-primary font-mono flex-1 truncate">{r.url.replace(/^https?:\/\//, "")}</span>
                        <span className={`text-xs font-medium tabular-nums ${r.status === "up" ? "text-success" : r.status === "checking" ? "text-accent" : "text-danger"}`}>
                          {statusLabel(r)}
                        </span>
                        {r.latencyMs !== undefined && (
                          <span className="text-xs text-text-muted tabular-nums w-16 text-right">{r.latencyMs}ms</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {results.length === 0 && (
                  <div className="text-center py-8 text-sm text-text-secondary">
                    Enter a URL above and click Check — or try one of the presets.
                  </div>
                )}
              </>
            )}

            <p className="text-xs text-text-muted text-center">
              PulseDock combines live uptime checks, version intelligence, and public status pages in one dashboard.
            </p>
          </div>
        </div>
      </FadeIn>
    </div>
  );
}

"use client";
// Layout widgets — containers, sections, navigation, columns, sticky headers
import React from "react";
import {
  type WidgetProps,
  WidgetCard,
} from "./shared";

export function CollapsibleSection({ widget }: WidgetProps) {
  const title = (widget.config.title as string) ?? "Section";
  const description = (widget.config.description as string) ?? "";
  const defaultOpen = (widget.config.defaultOpen as boolean) ?? true;

  return (
    <details
      open={defaultOpen}
      className="group rounded-xl border border-border bg-surface/50 overflow-hidden"
    >
      <summary className="flex cursor-pointer select-none items-center justify-between px-5 py-4 font-semibold text-text-primary hover:bg-surface-elevated/40 transition-colors list-none">
        <span>{title}</span>
        <svg
          className="h-4 w-4 text-text-secondary transition-transform duration-200 group-open:rotate-180"
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </summary>
      <div className="border-t border-border px-5 py-4 text-sm text-text-secondary leading-relaxed">
        {description.split("\n").map((line, i) => (
          <span key={i}>{line}{i < description.split("\n").length - 1 && <br />}</span>
        ))}
        {!description && <span className="italic text-text-muted">No content configured.</span>}
      </div>
    </details>
  );
}

// ── Tab Container ────────────────────────────────────────────────────────


export function TabContainer({ widget }: WidgetProps) {
  const tabs = (widget.config.tabs as Array<{ title: string; content: string }> | undefined) ?? [
    { title: "Tab 1", content: "" },
    { title: "Tab 2", content: "" },
  ];
  const label = widget.config.label as string | undefined;
  const [active, setActive] = React.useState(0);
  const activeIndex = Math.min(active, tabs.length - 1);
  const tab = tabs[activeIndex];

  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden">
      {label && <p className="text-sm font-semibold text-text-primary px-4 pt-4">{label}</p>}
      {/* Tab bar */}
      <div className="flex border-b border-border bg-surface-elevated/40 overflow-x-auto">
        {tabs.map((t, i) => (
          <button
            key={i}
            onClick={() => setActive(i)}
            className={[
              "relative shrink-0 px-4 py-2.5 text-sm font-medium transition-colors select-none",
              i === activeIndex
                ? "text-text-primary"
                : "text-text-muted hover:text-text-secondary",
            ].join(" ")}
          >
            {t.title || `Tab ${i + 1}`}
            {i === activeIndex && (
              <span className="absolute inset-x-0 bottom-0 h-0.5 bg-accent rounded-full" />
            )}
          </button>
        ))}
      </div>
      {/* Tab content */}
      <div className="px-5 py-4 min-h-[60px]">
        {tab?.content ? (
          <div className="text-sm text-text-secondary leading-relaxed whitespace-pre-line">{tab.content}</div>
        ) : (
          <p className="text-sm text-text-muted italic">No content configured for this tab.</p>
        )}
      </div>
    </div>
  );
}

// ── Dependency Map ───────────────────────────────────────────────────────


export function DependencyMap({ widget, extra }: WidgetProps) {
  const data = extra.widgetDataById[widget.id] as {
    nodes: Array<{ id: string; name: string; type: string; level: string; latencyMs: number | null }>;
    edges: Array<{ source: string; target: string; label?: string }>;
  } | undefined;

  const label = widget.config.label as string | undefined;

  if (!data) {
    return (
      <div className="rounded-xl border border-border bg-surface p-4 text-center">
        <p className="text-sm text-text-secondary">Loading dependency map…</p>
      </div>
    );
  }

  const nodeLevel = (id: string) => data.nodes.find((n) => n.id === id)?.level ?? "green";
  const levelColor = (lvl: string) =>
    lvl === "green" ? { ring: "#4ade80", bg: "#052e16", text: "#4ade80" }
    : lvl === "yellow" ? { ring: "#facc15", bg: "#1c1a00", text: "#facc15" }
    : { ring: "#f87171", bg: "#2d0a0a", text: "#f87171" };

  // Simple grid layout: space nodes evenly
  const cols = Math.ceil(Math.sqrt(data.nodes.length || 1));
  const NODE_W = 120;
  const NODE_H = 52;
  const COL_GAP = 60;
  const ROW_GAP = 50;
  const positions = data.nodes.map((n, i) => ({
    id: n.id,
    x: (i % cols) * (NODE_W + COL_GAP) + 20,
    y: Math.floor(i / cols) * (NODE_H + ROW_GAP) + 20,
  }));
  const totalW = cols * (NODE_W + COL_GAP) + 40;
  const totalH = (Math.ceil(data.nodes.length / cols)) * (NODE_H + ROW_GAP) + 40;
  const posMap = new Map(positions.map((p) => [p.id, p]));

  return (
    <div className="rounded-xl border border-border bg-surface p-4 overflow-auto">
      {label && <p className="text-sm font-semibold text-text-primary mb-3">{label}</p>}
      {data.nodes.length === 0 ? (
        <p className="text-sm text-text-secondary text-center py-4">No monitors configured. Add monitors in the config panel.</p>
      ) : (
        <svg width={totalW} height={totalH} className="block mx-auto" style={{ minHeight: 80 }} role="img" aria-label={label ?? "Service dependency map"}>
          {/* Edges */}
          {data.edges.map((e, i) => {
            const src = posMap.get(e.source);
            const tgt = posMap.get(e.target);
            if (!src || !tgt) return null;
            const x1 = src.x + NODE_W / 2;
            const y1 = src.y + NODE_H / 2;
            const x2 = tgt.x + NODE_W / 2;
            const y2 = tgt.y + NODE_H / 2;
            const mx = (x1 + x2) / 2;
            const my = (y1 + y2) / 2;
            const lvl = nodeLevel(e.source);
            const c = lvl === "green" ? "#4ade80" : lvl === "yellow" ? "#facc15" : "#f87171";
            return (
              <g key={i}>
                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={c} strokeWidth={1.5} strokeOpacity={0.5} strokeDasharray={lvl === "red" ? "4 3" : undefined} />
                {e.label && (
                  <text x={mx} y={my - 4} textAnchor="middle" fontSize={9} fill="rgba(255,255,255,0.45)">{e.label}</text>
                )}
              </g>
            );
          })}
          {/* Nodes */}
          {data.nodes.map((n) => {
            const pos = posMap.get(n.id);
            if (!pos) return null;
            const c = levelColor(n.level);
            return (
              <g key={n.id}>
                <rect
                  x={pos.x} y={pos.y} width={NODE_W} height={NODE_H} rx={8}
                  fill={c.bg} stroke={c.ring} strokeWidth={1.5}
                />
                <circle cx={pos.x + 14} cy={pos.y + 14} r={4} fill={c.ring} className={n.level === "red" ? "animate-pulse" : ""} />
                <text x={pos.x + 24} y={pos.y + 18} fontSize={10} fill={c.text} fontWeight={600}>{n.name.length > 14 ? n.name.slice(0, 14) + "…" : n.name}</text>
                <text x={pos.x + 10} y={pos.y + 36} fontSize={9} fill="rgba(255,255,255,0.45)">{n.type}</text>
                {n.latencyMs != null && (
                  <text x={pos.x + NODE_W - 8} y={pos.y + 36} fontSize={9} fill="rgba(255,255,255,0.35)" textAnchor="end">{n.latencyMs}ms</text>
                )}
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}

// ── Multi-Environment Status ──────────────────────────────────────────────


export function TableOfContents({ widget }: WidgetProps) {
  const title = (widget.config.label as string) || "Contents";
  const items = (widget.config.items as Array<{ label: string; anchor: string }>) ?? [];

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface/50 p-4 text-sm text-text-secondary text-center">
        No items configured. Add items via the config panel.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-surface/50 p-4 space-y-2">
      <div className="text-sm font-semibold text-text-primary mb-3">{title}</div>
      <ol className="space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className="flex items-center gap-2 group">
            <span className="w-5 h-5 rounded-full bg-accent/10 text-accent text-xs font-semibold flex items-center justify-center flex-shrink-0">
              {i + 1}
            </span>
            <a
              href={`#${item.anchor}`}
              className="text-sm text-text-secondary hover:text-accent transition-colors group-hover:underline underline-offset-2"
            >
              {item.label}
            </a>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ── Page Navigation ───────────────────────────────────────────────────────


export function PageNavigation({ widget, extra }: WidgetProps) {
  const raw = extra.widgetDataById?.[widget.id] as {
    pages?: Array<{ slug: string; title: string; description: string | null }>;
  } | undefined;

  const title = (widget.config.label as string) || "Other Status Pages";
  const pages = raw?.pages ?? [];

  if (pages.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface/50 p-4 text-center space-y-1">
        <div className="text-sm font-semibold text-text-primary">{title}</div>
        <div className="text-xs text-text-secondary">No other published pages found.</div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-surface/50 p-4 space-y-3">
      <div className="text-sm font-semibold text-text-primary">{title}</div>
      <div className="grid gap-2 grid-cols-1 sm:grid-cols-2">
        {pages.map((page) => (
          <a
            key={page.slug}
            href={`/status/${page.slug}`}
            className="group flex items-center gap-3 rounded-lg border border-border/60 bg-bg/40 px-3 py-2.5 hover:border-accent/40 hover:bg-accent/5 transition-all"
          >
            <div className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0" />
            <div className="min-w-0">
              <div className="text-sm font-medium text-text-primary group-hover:text-accent transition-colors truncate">{page.title}</div>
              {page.description && (
                <div className="text-xs text-text-secondary truncate">{page.description}</div>
              )}
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}

// ── Column Layout ────────────────────────────────────────────────────────


export function ColumnLayout({ widget }: WidgetProps) {
  const columns = Math.min(Math.max((widget.config.columns as number) ?? 2, 2), 4);
  const title = (widget.config.label as string) || "";
  const items = (widget.config.items as Array<{ heading?: string; body: string }>) ?? [];

  const gridClass =
    columns === 2
      ? "grid-cols-1 sm:grid-cols-2"
      : columns === 3
      ? "grid-cols-1 sm:grid-cols-2 md:grid-cols-3"
      : "grid-cols-2 sm:grid-cols-2 lg:grid-cols-4";

  return (
    <div className="rounded-xl border border-border bg-surface/50 p-4 space-y-3">
      {title && <div className="text-sm font-semibold text-text-primary">{title}</div>}
      <div className={`grid gap-4 ${gridClass}`}>
        {items.length > 0 ? (
          items.map((col, i) => (
            <div key={i} className="space-y-1.5">
              {col.heading && (
                <div className="text-xs font-semibold text-accent uppercase tracking-wide">{col.heading}</div>
              )}
              <p className="text-sm text-text-secondary whitespace-pre-wrap leading-relaxed">{col.body}</p>
            </div>
          ))
        ) : (
          Array.from({ length: columns }).map((_, i) => (
            <div key={i} className="rounded-lg border border-border/60 bg-bg/40 p-3 min-h-[80px] flex items-center justify-center">
              <span className="text-xs text-text-secondary">Column {i + 1}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ── Sticky Header ─────────────────────────────────────────────────────────


export function StickyHeader({ widget, extra }: WidgetProps) {
  const raw = extra.widgetDataById?.[widget.id] as {
    status?: "operational" | "degraded" | "outage";
    monitorCount?: number;
  } | undefined;

  const title = (widget.config.label as string) || "System Status";
  const status = raw?.status ?? "operational";

  const statusConfig = {
    operational: { label: "All Systems Operational", color: "text-green-400", dot: "bg-green-400", bg: "bg-green-400/10" },
    degraded: { label: "Partial Degradation", color: "text-yellow-400", dot: "bg-yellow-400", bg: "bg-yellow-400/10" },
    outage: { label: "Major Outage", color: "text-red-400", dot: "bg-red-400 animate-pulse", bg: "bg-red-400/10" },
  };

  const cfg = statusConfig[status];

  return (
    <div className={`rounded-xl border border-border ${cfg.bg} px-5 py-3 flex items-center justify-between gap-4`}>
      <div className="flex items-center gap-3 min-w-0">
        <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
        <span className="text-sm font-semibold text-text-primary truncate">{title}</span>
      </div>
      <span className={`text-sm font-medium flex-shrink-0 ${cfg.color}`}>{cfg.label}</span>
    </div>
  );
}

// ── Main renderer ────────────────────────────────────────────────────────


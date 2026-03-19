"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  AlertTriangle,
  Bell,
  LayoutDashboard,
  Monitor,
  Server,
  Shield,
  Wrench,
  Calendar,
  BarChart2,
  ExternalLink,
  Clock,
  Globe,
  X,
  Plus,
  Activity,
  Download,
  Sun,
} from "lucide-react";
import { useTheme } from "./theme-provider";

interface CommandItem {
  id: string;
  label: string;
  description?: string;
  icon: React.ComponentType<{ className?: string }>;
  action: () => void;
  group: string;
  keywords?: string[];
  shortcut?: string;
}

const RECENT_KEY = "pd:recent-commands";
const MAX_RECENT = 3;

function loadRecent(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function saveRecent(id: string): void {
  const recent = loadRecent().filter((r) => r !== id);
  recent.unshift(id);
  localStorage.setItem(RECENT_KEY, JSON.stringify(recent.slice(0, MAX_RECENT)));
}

function fuzzyMatch(text: string, query: string): boolean {
  const t = text.toLowerCase();
  const q = query.toLowerCase();
  let ti = 0;
  for (let qi = 0; qi < q.length; qi++) {
    const idx = t.indexOf(q[qi], ti);
    if (idx === -1) return false;
    ti = idx + 1;
  }
  return true;
}

export function CommandPalette() {
  const router = useRouter();
  const { toggleTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Build commands — needs router, so inside component
  const allCommands = useCallback((): CommandItem[] => [
    // Navigation
    { id: "nav-dashboard", label: "Dashboard", description: "Go to dashboard", icon: LayoutDashboard, group: "Navigation", keywords: ["home", "overview"], shortcut: "G D", action: () => router.push("/dashboard") },
    { id: "nav-monitors", label: "Monitors", description: "Uptime checks", icon: Monitor, group: "Navigation", keywords: ["uptime", "http", "tcp"], shortcut: "G M", action: () => router.push("/monitors") },
    { id: "nav-alerts", label: "Alerts", description: "Alert channels & rules", icon: Bell, group: "Navigation", keywords: ["notifications", "pagerduty", "slack"], shortcut: "G A", action: () => router.push("/alerts") },
    { id: "nav-status-pages", label: "Status Pages", description: "Public status pages", icon: Globe, group: "Navigation", keywords: ["public", "status"], shortcut: "G S", action: () => router.push("/status-pages") },
    { id: "nav-incidents", label: "Go to Incidents", description: "Incident management", icon: AlertTriangle, group: "Navigation", keywords: ["outage", "postmortem", "incident"], shortcut: "G I", action: () => router.push("/incidents") },
    { id: "nav-maintenance", label: "Go to Maintenance", description: "Maintenance windows", icon: Calendar, group: "Navigation", keywords: ["schedule", "downtime", "maintenance"], shortcut: "G W", action: () => router.push("/maintenance") },
    { id: "nav-versions", label: "Versions", description: "Version tracking", icon: BarChart2, group: "Navigation", keywords: ["release", "semver", "git"], shortcut: "G V", action: () => router.push("/versions") },
    { id: "nav-projects", label: "Projects", description: "Project management", icon: Server, group: "Navigation", keywords: ["team", "group"], action: () => router.push("/projects") },
    { id: "nav-account", label: "Account Settings", description: "Manage your account", icon: Shield, group: "Navigation", keywords: ["profile", "password", "settings"], action: () => router.push("/account") },
    { id: "nav-admin", label: "Admin", description: "Administration panel", icon: Wrench, group: "Navigation", keywords: ["system", "users", "config"], action: () => router.push("/admin") },
    // Create
    { id: "create-monitor", label: "New Monitor", description: "Create uptime check", icon: Plus, group: "Create", keywords: ["add", "new", "http", "tcp"], shortcut: "N M", action: () => router.push("/monitors?create=1") },
    { id: "create-alert", label: "New Alert Channel", description: "Add alert destination", icon: Plus, group: "Create", keywords: ["add", "slack", "discord", "webhook"], shortcut: "N A", action: () => router.push("/alerts") },
    { id: "create-status-page", label: "New Status Page", description: "Create public status page", icon: Plus, group: "Create", keywords: ["add", "public"], shortcut: "N S", action: () => router.push("/status-pages") },
    { id: "create-incident", label: "New Incident", description: "Report an incident", icon: Plus, group: "Create", keywords: ["add", "outage", "report"], action: () => router.push("/incidents") },
    // Actions
    { id: "action-export-monitors", label: "Export Monitors", description: "Download monitors as CSV", icon: Download, group: "Actions", keywords: ["download", "csv", "backup", "export"], action: () => router.push("/monitors?export=1") },
    { id: "action-toggle-theme", label: "Toggle Theme", description: "Switch dark / light mode", icon: Sun, group: "Actions", keywords: ["dark", "light", "theme", "mode", "color"], shortcut: "T", action: () => { toggleTheme(); } },
    // External
    { id: "ext-github", label: "GitHub Repository", description: "View source code", icon: ExternalLink, group: "External", keywords: ["source", "code", "repo"], action: () => window.open("https://github.com/No749ah/PulseDock", "_blank") },
    { id: "ext-api-docs", label: "API Documentation", description: "Browse API reference", icon: ExternalLink, group: "External", keywords: ["api", "rest", "docs", "swagger"], action: () => router.push("/api/docs") },
    { id: "ext-changelog", label: "Changelog", description: "View release history", icon: ExternalLink, group: "External", keywords: ["releases", "updates", "version"], action: () => window.open("https://github.com/No749ah/PulseDock/releases", "_blank") },
  ], [router, toggleTheme]);

  // Filtered results grouped
  const grouped = useCallback(() => {
    const commands = allCommands();
    const q = query.trim();

    let filtered: CommandItem[];
    if (q === "") {
      filtered = commands;
    } else {
      filtered = commands.filter((cmd) =>
        fuzzyMatch(cmd.label, q) ||
        (cmd.description ? fuzzyMatch(cmd.description, q) : false) ||
        (cmd.keywords ?? []).some((kw) => fuzzyMatch(kw, q))
      );
    }

    const result: Array<{ group: string; items: CommandItem[] }> = [];

    // Recent group (only when no query)
    if (q === "" && recentIds.length > 0) {
      const recentItems = recentIds
        .map((id) => commands.find((c) => c.id === id))
        .filter((c): c is CommandItem => c !== undefined);
      if (recentItems.length > 0) {
        result.push({ group: "Recent", items: recentItems });
      }
    }

    // Regular groups in order
    const groupOrder = ["Navigation", "Create", "Actions", "External"];
    for (const groupName of groupOrder) {
      const items = filtered.filter((c) => c.group === groupName);
      if (items.length > 0) result.push({ group: groupName, items });
    }

    return result;
  }, [allCommands, query, recentIds]);

  const flatItems = useCallback(() => grouped().flatMap((g) => g.items), [grouped]);

  // Open / close
  const openPalette = useCallback(() => {
    setRecentIds(loadRecent());
    setQuery("");
    setActiveIndex(0);
    setOpen(true);
  }, []);

  const closePalette = useCallback(() => {
    setOpen(false);
    setQuery("");
    setActiveIndex(0);
  }, []);

  const selectItem = useCallback((item: CommandItem) => {
    saveRecent(item.id);
    item.action();
    closePalette();
  }, [closePalette]);

  // Global Ctrl+K / Cmd+K listener
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        if (open) {
          closePalette();
        } else {
          openPalette();
        }
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, openPalette, closePalette]);

  // Auto-focus input when opened
  useEffect(() => {
    if (open) {
      // Small delay to ensure the element is mounted
      setTimeout(() => {
        inputRef.current?.focus();
      }, 10);
    }
  }, [open]);

  // Keyboard navigation within palette
  useEffect(() => {
    if (!open) return;
    function handler(e: KeyboardEvent) {
      const items = flatItems();
      if (e.key === "Escape") {
        e.preventDefault();
        closePalette();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, items.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const item = items[activeIndex];
        if (item) selectItem(item);
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, activeIndex, flatItems, closePalette, selectItem]);

  // Reset active index when query or groups change
  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  // Scroll active item into view
  useEffect(() => {
    if (!listRef.current) return;
    const active = listRef.current.querySelector("[data-active='true']");
    active?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  if (!open) return null;

  const groups = grouped();
  const flat = flatItems();
  let flatIdx = 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-black/60 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) closePalette();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <div className="w-full max-w-lg rounded-2xl border border-border bg-surface shadow-2xl shadow-black/50 overflow-hidden mx-4">
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 border-b border-border">
          <Search className="h-4 w-4 text-text-muted shrink-0" />
          <input
            ref={inputRef}
            id="command-palette-input"
            type="text"
            className="w-full bg-transparent py-4 text-sm placeholder:text-text-muted outline-none text-text-primary"
            placeholder="Search commands…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
          {query && (
            <button
              className="p-1 rounded text-text-muted hover:text-text-primary transition-colors"
              onClick={() => setQuery("")}
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          <kbd className="hidden sm:flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-text-muted border border-border rounded-md bg-surface-elevated">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-80 overflow-y-auto py-2">
          {groups.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-text-muted">
              No commands found
            </div>
          ) : (
            groups.map((group) => (
              <div key={group.group}>
                <div className="px-4 py-1.5 text-xs font-semibold text-text-muted uppercase tracking-wider flex items-center gap-2">
                  {group.group === "Recent" && <Clock className="h-3 w-3" />}
                  {group.group}
                </div>
                {group.items.map((item) => {
                  const currentIdx = flatIdx++;
                  const isActive = currentIdx === activeIndex;
                  return (
                    <button
                      key={item.id}
                      data-active={isActive}
                      className={[
                        "w-full flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors text-left",
                        isActive
                          ? "bg-accent/15 text-accent"
                          : "hover:bg-surface-elevated",
                      ].join(" ")}
                      onMouseEnter={() => setActiveIndex(currentIdx)}
                      onClick={() => selectItem(item)}
                    >
                      <item.icon
                        className={[
                          "h-4 w-4 shrink-0",
                          isActive ? "text-accent" : "text-text-secondary",
                        ].join(" ")}
                      />
                      <span
                        className={[
                          "text-sm flex-1 min-w-0",
                          isActive ? "text-accent" : "text-text-primary",
                        ].join(" ")}
                      >
                        {item.label}
                      </span>
                      {item.shortcut ? (
                        <kbd className={[
                          "hidden sm:flex items-center gap-0.5 ml-auto shrink-0 text-[10px] font-medium border rounded px-1.5 py-0.5",
                          isActive
                            ? "text-accent border-accent/40 bg-accent/10"
                            : "text-text-muted border-border bg-surface-elevated",
                        ].join(" ")}>
                          {item.shortcut}
                        </kbd>
                      ) : item.description ? (
                        <span className="text-xs text-text-muted ml-auto truncate shrink-0 hidden sm:block">
                          {item.description}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer hint */}
        <div className="px-4 py-2 border-t border-border flex items-center gap-4 text-[11px] text-text-muted">
          <span className="flex items-center gap-1"><kbd className="px-1.5 py-0.5 border border-border rounded bg-surface-elevated">↑↓</kbd> navigate</span>
          <span className="flex items-center gap-1"><kbd className="px-1.5 py-0.5 border border-border rounded bg-surface-elevated">↵</kbd> select</span>
          <span className="flex items-center gap-1"><kbd className="px-1.5 py-0.5 border border-border rounded bg-surface-elevated">ESC</kbd> close</span>
        </div>
      </div>
    </div>
  );
}

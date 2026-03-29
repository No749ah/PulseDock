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
  Loader2,
  GitBranch,
  FileText,
  Target,
  TrendingUp,
  Timer,
  Grid3x3,
  Network,
  ShieldCheck,
  GitCompare,
  Brain,
  Layers,
  Zap,
  Gauge,
  Hash,
  Medal,
  DollarSign,
  Radio,
  BookOpen,
  Lightbulb,
  Route,
  Volume2,
  History,
  LineChart,
  Rocket,
  Newspaper,
  Lock,
  Tv,
} from "lucide-react";
import { useTheme } from "./theme-provider";
import { api } from "../lib/api";
import { getUser } from "./auth";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CommandItem {
  id: string;
  label: string;
  description?: string;
  icon: React.ComponentType<{ className?: string }>;
  action: () => void;
  group: string;
  keywords?: string[];
  shortcut?: string;
  /** Optional status dot color */
  statusColor?: "green" | "yellow" | "red" | "blue" | "gray";
}

interface SearchResult {
  id: string;
  type: "monitor" | "incident" | "status_page" | "version";
  title: string;
  subtitle: string;
  url: string;
  status?: string;
  statusColor?: "green" | "yellow" | "red" | "blue" | "gray";
}

interface SearchResponse {
  query: string;
  total: number;
  monitors: SearchResult[];
  incidents: SearchResult[];
  status_pages: SearchResult[];
  versions: SearchResult[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function StatusDot({ color }: { color?: CommandItem["statusColor"] }) {
  if (!color || color === "gray") return null;
  const map: Record<string, string> = {
    green: "bg-success",
    yellow: "bg-warning",
    red: "bg-danger animate-pulse",
    blue: "bg-blue-400",
  };
  return <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${map[color] ?? "bg-border"}`} />;
}

function resultTypeIcon(type: SearchResult["type"]): React.ComponentType<{ className?: string }> {
  switch (type) {
    case "monitor": return Monitor;
    case "incident": return AlertTriangle;
    case "status_page": return Globe;
    case "version": return GitBranch;
    default: return FileText;
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CommandPalette() {
  const router = useRouter();
  const { toggleTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Static Commands ──────────────────────────────────────────────────────

  const allCommands = useCallback((): CommandItem[] => [
    // Navigation
    { id: "nav-search", label: "Search Page", description: "Full-page search results", icon: Search, group: "Navigation", keywords: ["find", "lookup", "search", "query"], shortcut: "G /", action: () => router.push("/search") },
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
    { id: "nav-activity", label: "Activity Feed", description: "Global activity stream", icon: Activity, group: "Navigation", keywords: ["events", "feed", "log", "stream"], action: () => router.push("/activity") },
    { id: "nav-deployments", label: "Deployments", description: "Deployment events & CI/CD", icon: Rocket, group: "Navigation", keywords: ["deploy", "release", "cicd", "ship"], action: () => router.push("/deployments") },
    { id: "nav-reports", label: "Reports", description: "Scheduled email reports", icon: FileText, group: "Navigation", keywords: ["email", "digest", "report", "schedule"], action: () => router.push("/reports") },
    { id: "nav-reports-digest", label: "Operations Digest", description: "Fleet-wide operations summary", icon: Newspaper, group: "Navigation", keywords: ["digest", "overview", "executive", "summary"], action: () => router.push("/reports/digest") },
    { id: "nav-ssl", label: "SSL Certificates", description: "Certificate expiry dashboard", icon: Lock, group: "Navigation", keywords: ["ssl", "tls", "certificate", "expiry", "https"], action: () => router.push("/ssl") },
    { id: "nav-mttr", label: "MTTR/MTTF Analytics", description: "Reliability metrics", icon: Timer, group: "Navigation", keywords: ["mttr", "mttf", "reliability", "recovery", "failure"], action: () => router.push("/mttr") },
    { id: "nav-wallboard", label: "NOC Wallboard", description: "Full-screen monitor wall", icon: Tv, group: "Navigation", keywords: ["wallboard", "noc", "fullscreen", "wall", "tv"], action: () => router.push("/dashboard/wallboard") },
    // Monitoring pages
    { id: "nav-sla", label: "SLA Dashboard", description: "SLA compliance & error budgets", icon: Target, group: "Monitoring", keywords: ["sla", "uptime", "compliance", "budget", "error"], action: () => router.push("/monitors/sla") },
    { id: "nav-fleet", label: "Fleet Report", description: "Executive fleet health overview", icon: BarChart2, group: "Monitoring", keywords: ["fleet", "report", "executive", "overview", "health"], action: () => router.push("/monitors/fleet") },
    { id: "nav-trends", label: "Monitor Trends", description: "Week-over-week trend analysis", icon: TrendingUp, group: "Monitoring", keywords: ["trend", "improving", "degrading", "week"], action: () => router.push("/monitors/trends") },
    { id: "nav-heatmap", label: "Uptime Heatmap", description: "Per-monitor daily uptime grid", icon: Grid3x3, group: "Monitoring", keywords: ["heatmap", "grid", "uptime", "calendar"], action: () => router.push("/monitors/heatmap") },
    { id: "nav-timeline", label: "Status Timeline", description: "Gantt-style monitor status bars", icon: Timer, group: "Monitoring", keywords: ["timeline", "gantt", "status", "history"], action: () => router.push("/monitors/timeline") },
    { id: "nav-predictions", label: "Failure Predictions", description: "Trend-based failure risk scoring", icon: Brain, group: "Monitoring", keywords: ["predict", "forecast", "risk", "failure", "ml"], action: () => router.push("/monitors/predictions") },
    { id: "nav-anomaly", label: "Anomaly Report", description: "Period comparison anomaly detection", icon: Zap, group: "Monitoring", keywords: ["anomaly", "regression", "spike", "deviation"], action: () => router.push("/monitors/anomaly") },
    { id: "nav-correlation", label: "Failure Correlation", description: "Monitor failure pattern clustering", icon: Network, group: "Monitoring", keywords: ["correlation", "cluster", "jaccard", "related"], action: () => router.push("/monitors/correlation") },
    { id: "nav-dependencies", label: "Dependencies & Topology", description: "Monitor dependency graph", icon: Route, group: "Monitoring", keywords: ["dependency", "topology", "graph", "impact", "blast"], action: () => router.push("/monitors/dependencies") },
    { id: "nav-compare", label: "Monitor Comparison", description: "Side-by-side monitor analysis", icon: GitCompare, group: "Monitoring", keywords: ["compare", "side-by-side", "diff", "versus"], action: () => router.push("/monitors/compare") },
    { id: "nav-security-headers", label: "Security Headers", description: "Fleet security header audit", icon: ShieldCheck, group: "Monitoring", keywords: ["security", "headers", "csp", "hsts", "grade"], action: () => router.push("/monitors/security") },
    { id: "nav-coverage", label: "Monitor Coverage", description: "Configuration completeness analysis", icon: Target, group: "Monitoring", keywords: ["coverage", "gaps", "missing", "config", "completeness"], action: () => router.push("/monitors/coverage") },
    { id: "nav-health-scores", label: "Health Scores", description: "Health score leaderboard & grades", icon: Medal, group: "Monitoring", keywords: ["health", "score", "grade", "leaderboard"], action: () => router.push("/monitors/health-scores") },
    { id: "nav-schedule", label: "Check Schedule", description: "Fleet check scheduling overview", icon: Clock, group: "Monitoring", keywords: ["schedule", "interval", "frequency", "checks", "load"], action: () => router.push("/monitors/schedule") },
    { id: "nav-services", label: "Service Groups", description: "Logical service grouping & status", icon: Layers, group: "Monitoring", keywords: ["service", "group", "aggregate", "status"], action: () => router.push("/monitors/services") },
    { id: "nav-tag-analytics", label: "Tag Analytics", description: "Per-tag uptime & health analysis", icon: Hash, group: "Monitoring", keywords: ["tag", "group", "analytics", "category"], action: () => router.push("/monitors/tag-analytics") },
    { id: "nav-downtime-cost", label: "Downtime Cost", description: "Financial impact of downtime", icon: DollarSign, group: "Monitoring", keywords: ["cost", "money", "financial", "downtime", "impact"], action: () => router.push("/monitors/downtime-cost") },
    { id: "nav-latency-heatmap", label: "Latency Heatmap", description: "Per-monitor daily latency grades", icon: Gauge, group: "Monitoring", keywords: ["latency", "heatmap", "response", "slow", "grade"], action: () => router.push("/monitors/latency-heatmap") },
    { id: "nav-reliability", label: "Reliability Trends", description: "Weekly health score tracking", icon: LineChart, group: "Monitoring", keywords: ["reliability", "health", "weekly", "sparkline"], action: () => router.push("/monitors/reliability") },
    { id: "nav-live", label: "Live Feed", description: "Real-time check results stream", icon: Radio, group: "Monitoring", keywords: ["live", "realtime", "feed", "stream", "checks"], action: () => router.push("/monitors/live") },
    { id: "nav-timing-breakdown", label: "Timing Breakdown", description: "DNS/TCP/TLS/TTFB phase analysis", icon: Timer, group: "Monitoring", keywords: ["timing", "dns", "tcp", "tls", "ttfb", "waterfall"], action: () => router.push("/monitors/timing-breakdown") },
    { id: "nav-interval-optimizer", label: "Interval Optimizer", description: "Data-driven check frequency recommendations", icon: Gauge, group: "Monitoring", keywords: ["interval", "optimize", "frequency", "recommendation"], action: () => router.push("/monitors/interval-optimizer") },
    { id: "nav-latency-bench", label: "Latency Benchmark", description: "Latency percentile benchmarking", icon: Gauge, group: "Monitoring", keywords: ["latency", "benchmark", "percentile", "p95", "p99"], action: () => router.push("/monitors/latency-bench") },
    // Alerting pages
    { id: "nav-alert-analytics", label: "Alert Analytics", description: "Alert delivery stats & charts", icon: BarChart2, group: "Alerting", keywords: ["alert", "analytics", "stats", "delivery"], action: () => router.push("/alerts/analytics") },
    { id: "nav-alert-history", label: "Alert History", description: "Alert delivery log", icon: History, group: "Alerting", keywords: ["alert", "history", "log", "delivery", "sent"], action: () => router.push("/alerts/history") },
    { id: "nav-alert-channels", label: "Alert Channels Health", description: "Per-channel delivery stats", icon: Activity, group: "Alerting", keywords: ["channel", "health", "delivery", "success", "rate"], action: () => router.push("/alerts/channels") },
    { id: "nav-alert-noise", label: "Alert Noise Analysis", description: "Noisy monitor detection", icon: Volume2, group: "Alerting", keywords: ["noise", "noisy", "flapping", "reduce", "quiet"], action: () => router.push("/alerts/noise") },
    { id: "nav-alert-routing", label: "Alert Routing Rules", description: "Conditional alert routing", icon: Route, group: "Alerting", keywords: ["routing", "rules", "conditional", "filter"], action: () => router.push("/alerts/routing") },
    { id: "nav-alert-response-time", label: "Alert Response Time", description: "Delivery latency percentiles", icon: Timer, group: "Alerting", keywords: ["response", "time", "latency", "delivery", "p95"], action: () => router.push("/alerts/response-time") },
    { id: "nav-alert-escalation", label: "Escalation Policies", description: "Step-based alert escalation", icon: TrendingUp, group: "Alerting", keywords: ["escalation", "policy", "step", "delay"], action: () => router.push("/alerts/escalation") },
    // Incidents pages
    { id: "nav-incident-insights", label: "Incident Insights", description: "Frequency heatmap & severity stats", icon: Lightbulb, group: "Alerting", keywords: ["incident", "insights", "heatmap", "frequency", "severity"], action: () => router.push("/incidents/insights") },
    { id: "nav-incident-playbooks", label: "Incident Playbooks", description: "Response playbook templates", icon: BookOpen, group: "Alerting", keywords: ["playbook", "runbook", "response", "template", "steps"], action: () => router.push("/incidents/playbooks") },
    // Maintenance
    { id: "nav-maintenance-effectiveness", label: "Maintenance Effectiveness", description: "Window impact analysis", icon: BarChart2, group: "Navigation", keywords: ["maintenance", "effectiveness", "impact", "noise", "suppression"], action: () => router.push("/maintenance/effectiveness") },
    // Versions
    { id: "nav-version-drift", label: "Version Drift", description: "Semver gap analysis per monitor", icon: GitBranch, group: "Navigation", keywords: ["drift", "outdated", "version", "semver", "gap"], action: () => router.push("/versions/drift") },
    // Create
    { id: "create-monitor", label: "New Monitor", description: "Create uptime check", icon: Plus, group: "Create", keywords: ["add", "new", "http", "tcp"], shortcut: "N M", action: () => router.push("/monitors?create=1") },
    { id: "create-alert", label: "New Alert Channel", description: "Add alert destination", icon: Plus, group: "Create", keywords: ["add", "slack", "discord", "webhook"], shortcut: "N A", action: () => router.push("/alerts") },
    { id: "create-status-page", label: "New Status Page", description: "Create public status page", icon: Plus, group: "Create", keywords: ["add", "public"], shortcut: "N S", action: () => router.push("/status-pages") },
    { id: "create-incident", label: "New Incident", description: "Report an incident", icon: Plus, group: "Create", keywords: ["add", "outage", "report"], action: () => router.push("/incidents") },
    { id: "create-version-check", label: "New Version Check", description: "Track a tool or package version", icon: Plus, group: "Create", keywords: ["add", "semver", "docker", "npm", "github"], action: () => router.push("/versions") },
    { id: "create-project", label: "New Project", description: "Group monitors into a project", icon: Plus, group: "Create", keywords: ["add", "folder", "group", "team"], action: () => router.push("/projects") },
    { id: "create-maintenance", label: "Schedule Maintenance", description: "Plan a maintenance window", icon: Plus, group: "Create", keywords: ["add", "downtime", "schedule"], action: () => router.push("/maintenance") },
    // Actions
    { id: "action-export-monitors", label: "Export Monitors", description: "Download monitors as CSV", icon: Download, group: "Actions", keywords: ["download", "csv", "backup", "export"], action: () => router.push("/monitors?export=1") },
    { id: "action-toggle-theme", label: "Toggle Theme", description: "Switch dark / light mode", icon: Sun, group: "Actions", keywords: ["dark", "light", "theme", "mode", "color"], shortcut: "T", action: () => { toggleTheme(); } },
    { id: "action-account-keys", label: "Manage API Keys", description: "View and create API keys", icon: Shield, group: "Actions", keywords: ["api", "key", "token", "auth"], action: () => router.push("/account#api-keys") },
    { id: "action-data-retention", label: "Data Retention Settings", description: "Configure data retention policies", icon: Clock, group: "Actions", keywords: ["storage", "retention", "prune", "cleanup"], action: () => router.push("/account#data-retention") },
    { id: "action-view-health", label: "API Health Check", description: "View API health status", icon: Activity, group: "Actions", keywords: ["health", "status", "api", "uptime"], action: () => window.open("/api/v1/health", "_blank") },
    // External
    { id: "ext-github", label: "GitHub Repository", description: "View source code", icon: ExternalLink, group: "External", keywords: ["source", "code", "repo"], action: () => window.open("https://github.com/No749ah/PulseDock", "_blank") },
    { id: "ext-api-docs", label: "API Documentation", description: "Browse API reference (Swagger)", icon: ExternalLink, group: "External", keywords: ["api", "rest", "docs", "swagger", "openapi"], action: () => router.push("/api/docs") },
    { id: "ext-changelog", label: "Changelog", description: "View release history on GitHub", icon: ExternalLink, group: "External", keywords: ["releases", "updates", "version", "history"], action: () => window.open("https://github.com/No749ah/PulseDock/releases", "_blank") },
    { id: "nav-changelog", label: "Changelog Page", description: "View built-in changelog", icon: BarChart2, group: "Navigation", keywords: ["changelog", "releases", "versions", "history"], action: () => router.push("/changelog") },
  ], [router, toggleTheme]);

  // ─── Live Search ─────────────────────────────────────────────────────────

  const doSearch = useCallback(async (q: string) => {
    if (q.length < 2) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    try {
      const user = getUser();
      if (!user) { setSearching(false); return; }
      const data = await api<SearchResponse>(`/v1/search?q=${encodeURIComponent(q)}&limit=4`, user.id);
      const results: SearchResult[] = [
        ...data.monitors,
        ...data.incidents,
        ...data.status_pages,
        ...data.versions,
      ];
      setSearchResults(results);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  // Debounce search
  useEffect(() => {
    if (!open) return;
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (query.length >= 2) {
      setSearching(true);
      searchTimer.current = setTimeout(() => doSearch(query), 250);
    } else {
      setSearchResults([]);
      setSearching(false);
    }
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [query, open, doSearch]);

  // ─── Grouped Items ────────────────────────────────────────────────────────

  const grouped = useCallback((): Array<{ group: string; items: CommandItem[] }> => {
    const commands = allCommands();
    const q = query.trim();

    // When we have live search results, show them at the top
    const result: Array<{ group: string; items: CommandItem[] }> = [];

    if (searchResults.length > 0) {
      const liveItems: CommandItem[] = searchResults.map((r) => ({
        id: `live-${r.type}-${r.id}`,
        label: r.title,
        description: r.subtitle,
        icon: resultTypeIcon(r.type),
        group: "Search Results",
        statusColor: r.statusColor,
        action: () => router.push(r.url),
      }));
      result.push({ group: "Search Results", items: liveItems });
    }

    // Filter static commands
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
    const groupOrder = ["Navigation", "Monitoring", "Alerting", "Create", "Actions", "External"];
    for (const groupName of groupOrder) {
      const items = filtered.filter((c) => c.group === groupName);
      if (items.length > 0) result.push({ group: groupName, items });
    }

    return result;
  }, [allCommands, query, recentIds, searchResults, router]);

  const flatItems = useCallback(() => grouped().flatMap((g) => g.items), [grouped]);

  // ─── Open / Close ─────────────────────────────────────────────────────────

  const openPalette = useCallback(() => {
    setRecentIds(loadRecent());
    setQuery("");
    setSearchResults([]);
    setSearching(false);
    setActiveIndex(0);
    setOpen(true);
  }, []);

  const closePalette = useCallback(() => {
    setOpen(false);
    setQuery("");
    setSearchResults([]);
    setSearching(false);
    setActiveIndex(0);
  }, []);

  const selectItem = useCallback((item: CommandItem) => {
    if (!item.id.startsWith("live-")) {
      saveRecent(item.id);
    }
    item.action();
    closePalette();
  }, [closePalette]);

  // ─── Keyboard Listeners ───────────────────────────────────────────────────

  // Global Ctrl+K / Cmd+K
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        if (open) closePalette(); else openPalette();
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, openPalette, closePalette]);

  // Auto-focus input when opened
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 10);
  }, [open]);

  // Navigation within palette
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

  // Reset active index on query change
  useEffect(() => { setActiveIndex(0); }, [query, searchResults]);

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
          {searching ? (
            <Loader2 className="h-4 w-4 text-text-muted shrink-0 animate-spin" />
          ) : (
            <Search className="h-4 w-4 text-text-muted shrink-0" />
          )}
          <input
            ref={inputRef}
            id="command-palette-input"
            type="text"
            className="w-full bg-transparent py-4 text-sm placeholder:text-text-muted outline-none text-text-primary"
            placeholder="Search monitors, incidents, commands…"
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
              {searching ? "Searching…" : "No results found"}
            </div>
          ) : (
            groups.map((group) => (
              <div key={group.group}>
                <div className="px-4 py-1.5 text-xs font-semibold text-text-muted uppercase tracking-wider flex items-center gap-2">
                  {group.group === "Recent" && <Clock className="h-3 w-3" />}
                  {group.group === "Search Results" && <Activity className="h-3 w-3 text-accent" />}
                  <span className={group.group === "Search Results" ? "text-accent" : ""}>{group.group}</span>
                </div>
                {group.items.map((item) => {
                  const currentIdx = flatIdx++;
                  const isActive = currentIdx === activeIndex;
                  return (
                    <button
                      key={item.id}
                      data-active={isActive}
                      className={[
                        "w-full flex items-center gap-3 py-2.5 cursor-pointer transition-colors text-left border-l-2",
                        isActive
                          ? "bg-surface-elevated border-accent pl-[14px] pr-4"
                          : "border-transparent px-4 hover:bg-surface-elevated/60",
                      ].join(" ")}
                      onMouseEnter={() => setActiveIndex(currentIdx)}
                      onClick={() => selectItem(item)}
                    >
                      <item.icon className="h-4 w-4 shrink-0 text-text-secondary" />
                      <span className="text-sm flex-1 min-w-0">
                        <span className="text-text-primary block truncate">{item.label}</span>
                        {item.description && (
                          <span className="text-xs text-text-muted block truncate">{item.description}</span>
                        )}
                      </span>
                      <div className="flex items-center gap-2 ml-auto shrink-0">
                        <StatusDot color={item.statusColor} />
                        {item.shortcut && !item.description && (
                          <kbd className="hidden sm:flex items-center gap-0.5 text-[10px] font-medium text-text-muted border border-border rounded px-1.5 py-0.5 bg-surface-elevated">
                            {item.shortcut}
                          </kbd>
                        )}
                      </div>
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
          {query.length >= 2 && (
            <button
              className="ml-auto text-accent hover:underline"
              onClick={() => { closePalette(); router.push(`/search?q=${encodeURIComponent(query)}`); }}
            >
              {searchResults.length > 0 ? `View all ${searchResults.length}+ results →` : searching ? "searching…" : "Search page →"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

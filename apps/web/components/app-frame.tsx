'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  BarChart2,
  Bell,
  ClipboardList,
  ScrollText,
  CalendarClock,
  ShieldCheck,
  Layers,
  Timer,

  ChevronDown,
  Folder,
  Gauge,
  GitBranch,
  Globe,
  LogOut,
  Menu,
  Moon,
  Search,
  Settings,
  Shield,
  Sun,
  User,
  X,
} from 'lucide-react';
import { clearSession, getCachedUser, getUser } from './auth';
import { useTheme } from './theme-provider';

import { api } from '../lib/api';
import { brand } from '../lib/brand';

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
};

const navGroups: Array<{ label: string; items: NavItem[] }> = [
  {
    label: 'Overview',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: Gauge },
    ],
  },
  {
    label: 'Monitoring',
    items: [
      { href: '/monitors', label: 'Uptime Checks', icon: Activity },
      { href: '/monitors/compare', label: 'Compare', icon: BarChart2 },
      { href: '/monitors/heatmap', label: 'Heatmap', icon: Layers },
      { href: '/ssl', label: 'SSL Certificates', icon: ShieldCheck },
      { href: '/versions', label: 'Version Tracking', icon: GitBranch },
    ],
  },
  {
    label: 'Management',
    items: [
      { href: '/alerts', label: 'Alerts', icon: AlertTriangle },
      { href: '/alerts/routing', label: 'Routing Rules', icon: GitBranch },
      { href: '/alerts/escalation', label: 'Escalation', icon: AlertOctagon },
      { href: '/alerts/analytics', label: 'Alert Analytics', icon: BarChart2 },
      { href: '/alerts/history', label: 'Delivery History', icon: ClipboardList },
      { href: '/incidents', label: 'Incidents', icon: AlertOctagon },
      { href: '/maintenance', label: 'Maintenance', icon: CalendarClock },

      { href: '/projects', label: 'Projects', icon: Folder },
      { href: '/status-pages', label: 'Status Pages', icon: Globe },
    ],
  },
  {
    label: 'Insights',
    items: [
      { href: '/activity', label: 'Activity Feed', icon: Activity },
      { href: '/monitors/heatmap', label: 'Uptime Heatmap', icon: Layers },
      { href: '/mttr', label: 'Reliability Analytics', icon: Timer },
      { href: '/reports', label: 'Reports', icon: BarChart2 },
    ],
  },

  {
    label: 'Administration',
    items: [
      { href: '/admin', label: 'Admin', icon: Shield, adminOnly: true },
      { href: '/changelog', label: 'Changelog', icon: ScrollText },
    ],
  },
];

export function AppFrame({
  title,
  subtitle,
  children,
  breadcrumbs,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  breadcrumbs?: Array<{ label: string; href?: string }>;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();

  const [user, setUser] = useState<ReturnType<typeof getUser> | null>(null);
  const [mounted, setMounted] = useState(false);
  const [workspaceName, setWorkspaceName] = useState<string | null>(null);
  const [workspaceLogo, setWorkspaceLogo] = useState<string | null>(null);

  // Update browser tab title to reflect the current page
  useEffect(() => {
    const brand = workspaceName ?? 'PulseDock';
    document.title = title ? `${title} — ${brand}` : brand;
  }, [title, workspaceName]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [readIds, setReadIds] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem("notif-read-ids") || "[]")); } catch { return new Set(); }
  });
  const [notifications, setNotifications] = useState<Array<{
    id: string; message: string; level: string; checkedAt: string; ok: boolean;
    monitorId?: string; monitorName?: string | null; monitorType?: string | null;
    notifKind?: 'failure' | 'version' | 'incident' | 'maintenance';
    incidentTitle?: string; maintenanceName?: string;
  }>>([]);
  const [activeIncidentCount, setActiveIncidentCount] = useState(0);
  const [downMonitorCount, setDownMonitorCount] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = () => {
    const VERSION_TYPES = new Set(['GIT_RELEASE', 'DOCKER_IMAGE']);

    Promise.all([
      api<Array<{ id: string; message: string; level: string; checkedAt: string; ok: boolean; monitorId?: string; monitorName?: string | null; monitorType?: string | null }>>(
        '/v1/monitors/runs?limit=50'
      ).catch(() => [] as never[]),
      api<Array<{ id: string; title: string; status: string; severity: string; createdAt: string }>>(
        '/v1/incidents?limit=10'
      ).catch(() => [] as never[]),
    ]).then(([runs, incidents]) => {
      const monitorNotifs = runs
        .filter((r) => {
          if (VERSION_TYPES.has(r.monitorType ?? '')) return r.level === 'yellow' || r.level === 'red';
          return !r.ok;
        })
        .slice(0, 12)
        .map((r) => ({
          ...r,
          notifKind: (VERSION_TYPES.has(r.monitorType ?? '') ? 'version' : 'failure') as 'version' | 'failure',
        }));

      const activeIncidents = (incidents as Array<{ id: string; title: string; status: string; severity: string; createdAt: string }>)
        .filter((i) => i.status !== 'resolved');
      setActiveIncidentCount(activeIncidents.length);
      // Count unique failing uptime monitors (level=red) in recent runs
      const failingMonitorIds = new Set(runs.filter((r) => r.level === 'red' && !VERSION_TYPES.has(r.monitorType ?? '')).map((r) => r.monitorId).filter(Boolean));
      setDownMonitorCount(failingMonitorIds.size);

      const incidentNotifs = activeIncidents.slice(0, 3).map((i) => ({
        id: `incident-${i.id}`,
        message: i.title,
        level: i.severity === 'critical' ? 'red' : 'yellow',
        checkedAt: i.createdAt,
        ok: false,
        notifKind: 'incident' as const,
        incidentTitle: i.title,
      }));

      setNotifications([...incidentNotifs, ...monitorNotifs].slice(0, 15));
    }).catch(() => { /* non-critical */ });
  };

  useEffect(() => {
    const currentUser = getCachedUser() ?? getUser();
    setUser(currentUser);
    setMounted(true);
    // Fetch workspace branding
    if (currentUser?.id) {
      api<{ workspaceName: string | null; workspaceLogo: string | null }>('/v1/settings/workspace', currentUser.id)
        .then((ws) => {
          if (ws.workspaceName) setWorkspaceName(ws.workspaceName);
          if (ws.workspaceLogo) setWorkspaceLogo(ws.workspaceLogo);
        })
        .catch(() => { /* non-critical */ });
    }
    // Fetch recent failed monitor runs as notifications
    fetchNotifications();
    // Auto-fetch every 60s to keep badge count fresh
    const timer = setInterval(fetchNotifications, 60000);
    return () => clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function markAllRead() {
    const ids = notifications.map((n) => n.id);
    const next = new Set([...readIds, ...ids]);
    setReadIds(next);
    try { localStorage.setItem("notif-read-ids", JSON.stringify([...next])); } catch {}
  }

  const unreadNotifications = notifications.filter((n) => !readIds.has(n.id));

  // Close sidebar on route change
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  // '/' keyboard shortcut → open command palette (when not focused in an input)
  useEffect(() => {
    function handleSlash(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const inInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
      if (e.key === '/' && !inInput && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
      }
    }
    window.addEventListener('keydown', handleSlash);
    return () => window.removeEventListener('keydown', handleSlash);
  }, []);

  // Close user menu on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    if (userMenuOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [userMenuOpen]);

  // Close notif dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    }
    if (notifOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [notifOpen]);

  const userInitial = mounted
    ? (user?.name?.[0] ?? user?.email?.[0] ?? 'U').toUpperCase()
    : 'U';
  const userName = mounted
    ? (user?.name ?? user?.email?.split('@')[0] ?? 'user')
    : 'user';

  return (
    <div className="flex h-screen bg-bg overflow-hidden">
      {/* ── Sidebar ── */}
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm sm:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar panel */}
      <aside
        className={[
          'fixed inset-y-0 left-0 z-40 flex flex-col w-[280px]',
          'bg-surface/80 backdrop-blur-xl border-r border-border/60',
          'transform transition-transform duration-200 ease-in-out',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
          'sm:translate-x-0 sm:static sm:z-auto',
        ].join(' ')}
      >
        {/* Sidebar header */}
        <div className="flex items-center gap-3 px-5 h-[72px] border-b border-border/40 shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={workspaceLogo ?? '/brand/pulsedock-logo.svg'}
            alt={workspaceName ?? 'PulseDock'}
            width={28}
            height={28}
            className="rounded-lg"
            onError={(e) => { (e.target as HTMLImageElement).src = '/brand/pulsedock-logo.svg'; }}
          />
          <span className="text-lg font-bold text-text-primary tracking-tight">{workspaceName ?? 'PulseDock'}</span>
          {/* Close button (mobile only) */}
          <button
            className="ml-auto sm:hidden p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close navigation"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Nav groups */}
        <nav aria-label="Main navigation" className="flex-1 overflow-y-auto py-4 px-3 space-y-5">
          {navGroups.map((group) => {
            const items = group.items.filter(
              (item) => !item.adminOnly || user?.role === 'admin',
            );
            if (!items.length) return null;
            return (
              <div key={group.label}>
                <p className="px-2 mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-text-secondary/60">
                  {group.label}
                </p>
                <ul className="space-y-0.5">
                  {items.map((item) => {
                    const isActive = pathname === item.href;
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          className={[
                            'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                            isActive
                              ? 'bg-accent/15 text-accent border border-accent/25'
                              : 'text-text-secondary hover:text-text-primary hover:bg-surface-elevated',
                          ].join(' ')}
                        >
                          <item.icon
                            className={['w-4 h-4', isActive ? 'text-accent' : 'text-text-secondary'].join(' ')}
                          />
                          {item.label}
                          {item.href === '/monitors' && downMonitorCount > 0 && (
                            <span className="ml-auto flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-danger text-[9px] font-bold text-white leading-none">
                              {downMonitorCount > 9 ? '9+' : downMonitorCount}
                            </span>
                          )}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </nav>

        {/* Sidebar footer */}
        <div className="px-4 py-3 border-t border-border/40 shrink-0 space-y-1">
          <p className="text-[11px] text-text-secondary/50">
            v{process.env.NEXT_PUBLIC_APP_VERSION ?? 'dev'}
          </p>
          {!brand.hideBranding && brand.name !== 'PulseDock' && (
            <p className="text-[10px] text-text-secondary/30">
              Powered by{' '}
              <a href="https://github.com/No749ah/PulseDock" target="_blank" rel="noopener noreferrer" className="hover:text-text-secondary/60 transition-colors">
                PulseDock
              </a>
            </p>
          )}
        </div>
      </aside>

      {/* ── Main area ── */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Header */}
        <header className="flex items-center justify-between px-4 sm:px-6 h-[72px] border-b border-border/40 bg-surface/70 backdrop-blur-xl shrink-0 z-20">
          {/* Left: burger (mobile) + page title */}
          <div className="flex items-center gap-3">
            <button
              className="sm:hidden p-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open navigation"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div>
              {breadcrumbs && breadcrumbs.length > 0 ? (
                <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-xs text-text-muted mb-0.5">
                  {breadcrumbs.map((crumb, i) => (
                    <span key={i} className="flex items-center gap-1">
                      {i > 0 && <ChevronDown className="w-3 h-3 rotate-[-90deg] opacity-40 shrink-0" />}
                      {crumb.href && i < breadcrumbs.length - 1 ? (
                        <Link href={crumb.href} className="hover:text-text-secondary transition-colors">
                          {crumb.label}
                        </Link>
                      ) : (
                        <span className="text-text-secondary font-medium" aria-current="page">{crumb.label}</span>
                      )}
                    </span>
                  ))}
                </nav>
              ) : null}
              <h1 className="text-sm sm:text-base font-semibold text-text-primary leading-tight">
                {title}
              </h1>
              {subtitle && !breadcrumbs?.length && (
                <p className="text-xs text-text-secondary hidden sm:block">{subtitle}</p>
              )}
            </div>
          </div>

          {/* Right: search hint + notifications + theme toggle + user menu */}
          <div className="flex items-center gap-2">
            {/* Ctrl+K trigger (hidden on mobile) */}
            <button
              className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg text-text-muted hover:text-text-secondary hover:bg-surface-elevated border border-border/60 transition-colors text-xs"
              onClick={() => {
                window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
              }}
              aria-label="Open command palette"
              title="Open command palette (Ctrl+K or /)"
            >
              <Search className="w-3.5 h-3.5" />
              <span>Search…</span>
              <kbd className="flex items-center gap-0.5 text-[10px] opacity-60">
                <span>/</span>
              </kbd>
            </button>

            {/* Notifications bell */}
            <div className="relative" ref={notifRef}>
              <button
                className="relative p-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors"
                onClick={() => setNotifOpen((v) => !v)}
                aria-label="Notifications"
                aria-expanded={notifOpen}
                aria-haspopup="true"
              >
                <Bell className="w-4 h-4" />
                {/* Badge — shows unread failure count */}
                {(unreadNotifications.length > 0 || activeIncidentCount > 0) && (
                  <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-danger text-[9px] font-bold text-white leading-none">
                    {(unreadNotifications.length + activeIncidentCount) > 9 ? "9+" : (unreadNotifications.length + activeIncidentCount)}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 top-full mt-2 w-72 bg-surface border border-border rounded-xl shadow-xl shadow-black/30 overflow-hidden z-50">
                  <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                    <p className="text-sm font-semibold text-text-primary">Alerts &amp; Updates</p>
                    <div className="flex items-center gap-2">
                      {notifications.length > 0 && (
                        <span className="text-xs bg-danger/15 text-danger px-2 py-0.5 rounded-full font-medium">{unreadNotifications.length} unread</span>
                      )}
                      {unreadNotifications.length > 0 && (
                        <button
                          onClick={markAllRead}
                          className="text-xs text-text-muted hover:text-accent transition-colors"
                        >
                          Mark all read
                        </button>
                      )}
                    </div>
                  </div>
                  {/* Active incident banner */}
                  {activeIncidentCount > 0 && (
                    <Link
                      href="/incidents"
                      onClick={() => setNotifOpen(false)}
                      className="flex items-center gap-2 px-4 py-2.5 bg-danger/10 border-b border-danger/20 hover:bg-danger/15 transition-colors"
                    >
                      <AlertOctagon className="w-3.5 h-3.5 text-danger shrink-0 animate-pulse" />
                      <span className="text-xs font-semibold text-danger">
                        {activeIncidentCount} active incident{activeIncidentCount !== 1 ? "s" : ""} — View →
                      </span>
                    </Link>
                  )}

                  {notifications.length === 0 ? (
                    <div className="py-6 flex flex-col items-center gap-2 text-center">
                      <Bell className="w-8 h-8 text-text-muted/40" />
                      <p className="text-sm text-text-secondary">All clear</p>
                      <p className="text-xs text-text-muted">No failures or version updates.</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-border/50 max-h-72 overflow-y-auto">
                      {notifications.map((n) => {
                        const isRead = readIds.has(n.id);
                        const diff = Date.now() - new Date(n.checkedAt).getTime();
                        const mins = Math.floor(diff / 60000);
                        const timeAgo = mins < 1 ? "just now" : mins < 60 ? `${mins}m ago` : `${Math.floor(mins / 60)}h ago`;
                        const VERSION_TYPES = new Set(['GIT_RELEASE', 'DOCKER_IMAGE']);
                        const isVersion = n.notifKind === 'version' || VERSION_TYPES.has(n.monitorType ?? '');
                        const isIncident = n.notifKind === 'incident';
                        const href = isIncident ? `/incidents` : isVersion ? `/versions` : n.monitorId ? `/monitors/${n.monitorId}` : `/monitors`;
                        const title = isIncident
                          ? (n.incidentTitle ?? "Active Incident")
                          : (n.monitorName ?? (isVersion ? "Version update" : "Monitor failure"));
                        const detail = isIncident
                          ? "Ongoing incident — click to view"
                          : isVersion
                            ? (n.level === 'red' ? "Major update available" : "Update available")
                            : (n.message || "Check failed");
                        const dotColor = n.level === "red"
                          ? (isIncident ? "bg-danger animate-pulse" : "bg-danger")
                          : n.level === "yellow" ? "bg-warning" : "bg-text-muted";
                        return (
                          <Link
                            key={n.id}
                            href={href}
                            className={`px-4 py-3 flex items-start gap-3 hover:bg-surface-elevated/50 transition-colors ${isRead ? "opacity-50" : ""}`}
                            onClick={() => {
                              const next = new Set([...readIds, n.id]);
                              setReadIds(next);
                              setNotifOpen(false);
                              try { localStorage.setItem("notif-read-ids", JSON.stringify([...next])); } catch {}
                            }}
                          >
                            <span className={`mt-1 flex h-2 w-2 shrink-0 rounded-full ${dotColor}`} />
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-medium text-text-primary truncate">{title}</p>
                              <p className="text-[10px] text-text-secondary truncate">{detail}</p>
                              <p className="text-[10px] text-text-muted mt-0.5">{timeAgo}</p>
                            </div>
                            {isIncident && (
                              <span className="shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-danger/15 text-danger">INCIDENT</span>
                            )}
                            {isVersion && !isIncident && (
                              <span className={`shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full ${n.level === 'red' ? 'bg-danger/15 text-danger' : 'bg-warning/15 text-warning'}`}>
                                {n.level === 'red' ? 'MAJOR' : 'UPDATE'}
                              </span>
                            )}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                  <div className="px-4 py-2.5 border-t border-border flex items-center justify-between">
                    <Link href="/monitors" className="text-xs text-accent hover:text-accent/80 transition-colors" onClick={() => setNotifOpen(false)}>
                      View monitors →
                    </Link>
                    <div className="flex items-center gap-3">
                      <Link href="/incidents" className="text-xs text-text-secondary hover:text-text-primary transition-colors" onClick={() => setNotifOpen(false)}>
                        Incidents →
                      </Link>
                      <Link href="/versions" className="text-xs text-text-secondary hover:text-text-primary transition-colors" onClick={() => setNotifOpen(false)}>
                        Versions →
                      </Link>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Theme toggle */}
            <button
              className="p-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors"
              onClick={toggleTheme}
              aria-label="Toggle theme"
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? (
                <Sun className="w-4 h-4" />
              ) : (
                <Moon className="w-4 h-4" />
              )}
            </button>

            {/* User menu */}
            <div className="relative" ref={menuRef}>
            <button
              className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-surface-elevated transition-colors"
              onClick={() => setUserMenuOpen((v) => !v)}
              aria-expanded={userMenuOpen}
              aria-haspopup="menu"
              aria-label={`User menu for ${userName}`}
            >
              <div className="w-7 h-7 rounded-full bg-accent/20 border border-accent/40 flex items-center justify-center text-xs font-semibold text-accent select-none">
                {userInitial}
              </div>
              <span className="hidden xs:block text-sm text-text-secondary max-w-[120px] truncate">
                {userName}
              </span>
              <ChevronDown
                className={[
                  'w-3.5 h-3.5 text-text-secondary transition-transform',
                  userMenuOpen ? 'rotate-180' : '',
                ].join(' ')}
              />
            </button>

            {/* Dropdown */}
            {userMenuOpen && (
              <div className="absolute right-0 top-full mt-2 w-52 bg-surface border border-border rounded-xl shadow-xl shadow-black/30 overflow-hidden z-50">
                <div className="px-4 py-3 border-b border-border">
                  <p className="text-xs font-medium text-text-secondary">Signed in as</p>
                  <p className="text-sm font-semibold text-text-primary truncate mt-0.5">{userName}</p>
                </div>
                <div className="py-1">
                  <button
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-text-primary hover:bg-surface-elevated transition-colors text-left"
                    onClick={() => { setUserMenuOpen(false); router.push('/account'); }}
                  >
                    <User className="w-4 h-4 text-text-secondary" />
                    Account settings
                  </button>
                  {user?.role === 'admin' && (
                    <button
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-text-primary hover:bg-surface-elevated transition-colors text-left"
                      onClick={() => { setUserMenuOpen(false); router.push('/admin'); }}
                    >
                      <Settings className="w-4 h-4 text-text-secondary" />
                      Admin panel
                    </button>
                  )}
                </div>
                <div className="py-1 border-t border-border">
                  <button
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-danger hover:bg-danger/10 transition-colors text-left"
                    onClick={() => { void clearSession().then(() => router.push('/login')); }}
                  >
                    <LogOut className="w-4 h-4" />
                    Logout
                  </button>
                </div>
              </div>
            )}
            </div>
          </div>
        </header>

        {/* ── Outage Banner ── */}
        {downMonitorCount > 0 && (
          <div
            className="flex items-center gap-3 px-4 py-2 bg-danger/10 border-b border-danger/30 text-danger text-sm"
            role="alert"
            aria-live="polite"
          >
            <span className="w-2 h-2 rounded-full bg-danger animate-pulse shrink-0" />
            <span className="font-medium">
              {downMonitorCount} monitor{downMonitorCount !== 1 ? 's' : ''} down
            </span>
            <Link href="/monitors" className="underline underline-offset-2 hover:text-danger/80 transition-colors">
              View monitors →
            </Link>
          </div>
        )}

        {/* Content */}
        <main id="main-content" role="main" className="flex-1 overflow-y-auto">
          <div className="max-w-[1600px] mx-auto w-full p-4 sm:p-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

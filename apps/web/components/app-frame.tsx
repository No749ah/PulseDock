'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Activity,
  AlertTriangle,
  ChevronDown,
  Folder,
  Gauge,
  GitBranch,
  Globe,
  LogOut,
  Menu,
  Settings,
  Shield,
  User,
  X,
} from 'lucide-react';
import { clearSession, getCachedUser, getUser } from './auth';

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
      { href: '/versions', label: 'Versions', icon: GitBranch },
    ],
  },
  {
    label: 'Monitoring',
    items: [
      { href: '/monitors', label: 'Monitors', icon: Activity },
      { href: '/alerts', label: 'Alerts', icon: AlertTriangle },
      { href: '/projects', label: 'Projects', icon: Folder },
      { href: '/status/demo', label: 'Public Status', icon: Globe },
    ],
  },
  {
    label: 'Administration',
    items: [{ href: '/admin', label: 'Admin', icon: Shield, adminOnly: true }],
  },
];

export function AppFrame({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<ReturnType<typeof getUser> | null>(null);
  const [mounted, setMounted] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setUser(getCachedUser() ?? getUser());
    setMounted(true);
  }, []);

  // Close sidebar on route change
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

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
            src="/brand/pulsedock-logo.svg"
            alt="PulseDock"
            width={28}
            height={28}
            className="rounded-lg"
          />
          <span className="text-lg font-bold text-text-primary tracking-tight">PulseDock</span>
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
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-5">
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
        <div className="px-4 py-3 border-t border-border/40 shrink-0">
          <p className="text-[11px] text-text-secondary/50">
            v{process.env.NEXT_PUBLIC_APP_VERSION ?? 'dev'}
          </p>
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
              <h1 className="text-sm sm:text-base font-semibold text-text-primary leading-tight">
                {title}
              </h1>
              {subtitle && (
                <p className="text-xs text-text-secondary hidden sm:block">{subtitle}</p>
              )}
            </div>
          </div>

          {/* Right: user menu */}
          <div className="relative" ref={menuRef}>
            <button
              className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-surface-elevated transition-colors"
              onClick={() => setUserMenuOpen((v) => !v)}
              aria-expanded={userMenuOpen}
              aria-haspopup="true"
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
                    onClick={() => { clearSession(); router.push('/login'); }}
                  >
                    <LogOut className="w-4 h-4" />
                    Logout
                  </button>
                </div>
              </div>
            )}
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-[1220px] mx-auto w-full p-4 sm:p-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { clearSession, getUser } from './auth';

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const user = typeof window !== 'undefined' ? getUser() : null;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">PulseDock</div>
        <div className="brand-sub">Enterprise Uptime Intelligence</div>
        <div className="muted mb-4">{user?.name ?? user?.email?.split('@')[0] ?? 'user'}</div>

        <nav className="nav">
          <Link className={pathname === '/dashboard' ? 'active' : ''} href="/dashboard">Dashboard</Link>
          <Link className={pathname === '/monitors' ? 'active' : ''} href="/monitors">Monitors</Link>
          <Link className={pathname === '/alerts' ? 'active' : ''} href="/alerts">Alerts</Link>
          <Link className={pathname === '/projects' ? 'active' : ''} href="/projects">Projects</Link>
          <Link className={pathname === '/admin' ? 'active' : ''} href="/admin">Admin</Link>
        </nav>

        <button
          className="btn secondary mt-[18px] w-full"
          onClick={() => {
            clearSession();
            router.push('/login');
          }}
        >
          Logout
        </button>
      </aside>

      <main className="main">{children}</main>
    </div>
  );
}

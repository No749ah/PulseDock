'use client';

import { AppShell, Avatar, Group, Menu, NavLink, Stack, Text } from '@mantine/core';
import { IconActivityHeartbeat, IconAlertTriangle, IconFolder, IconGauge, IconLogout, IconSettings, IconShield, IconUser, IconVersions } from '@tabler/icons-react';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { clearSession, getCachedUser, getUser } from './auth';

type NavItem = { href: string; label: string; icon: any; adminOnly?: boolean };

const navGroups: Array<{ label: string; items: NavItem[] }> = [
  {
    label: 'Overview',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: IconGauge },
      { href: '/versions', label: 'Versions', icon: IconVersions },
    ],
  },
  {
    label: 'Monitoring',
    items: [
      { href: '/monitors', label: 'Monitors', icon: IconActivityHeartbeat },
      { href: '/alerts', label: 'Alerts', icon: IconAlertTriangle },
      { href: '/projects', label: 'Projects', icon: IconFolder },
      { href: '/status/demo', label: 'Public Status', icon: IconSettings },
    ],
  },
  {
    label: 'Administration',
    items: [{ href: '/admin', label: 'Admin', icon: IconShield, adminOnly: true }],
  },
];

export function AppFrame({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<ReturnType<typeof getUser> | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setUser(getCachedUser() ?? getUser());
    setMounted(true);
  }, []);

  return (
    <AppShell
      header={{ height: 72 }}
      navbar={{ width: 280, breakpoint: 'sm' }}
      padding="lg"
      styles={{
        main: { background: 'transparent' },
        navbar: { background: 'rgba(10,24,19,0.84)', borderRight: '1px solid rgba(52, 211, 153, 0.22)', backdropFilter: 'blur(12px)' },
        header: { background: 'rgba(9,22,17,0.72)', borderBottom: '1px solid rgba(74, 222, 128, 0.18)', backdropFilter: 'blur(10px)' },
      }}
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group gap="sm">
            <img src="/brand/pulsedock-logo.svg" alt="PulseDock" width={28} height={28} style={{ borderRadius: 8 }} />
            <Text fw={700} size="lg">PulseDock</Text>
          </Group>

          <Menu shadow="md" width={220} position="bottom-end">
            <Menu.Target>
              <Group gap="xs" style={{ cursor: 'pointer' }}>
                <Avatar color="teal" radius="xl" size="sm" suppressHydrationWarning>{mounted ? ((user?.name?.[0] ?? user?.email?.[0] ?? 'U').toUpperCase()) : 'U'}</Avatar>
                <Text size="sm" c="dimmed" suppressHydrationWarning style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{mounted ? (user?.name ?? user?.email?.split('@')[0] ?? 'user') : 'user'}</Text>
              </Group>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Label>Profile</Menu.Label>
              <Menu.Item leftSection={<IconUser size={14} />} onClick={() => router.push('/account')}>Account settings</Menu.Item>
              {user?.role === 'admin' ? <Menu.Item leftSection={<IconShield size={14} />} onClick={() => router.push('/admin')}>Admin panel</Menu.Item> : null}
              <Menu.Divider />
              <Menu.Item color="red" leftSection={<IconLogout size={14} />} onClick={() => { clearSession(); router.push('/login'); }}>
                Logout
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="md">
        <Stack gap="xs" style={{ flex: 1 }}>
          {navGroups.map((group) => {
            const items = group.items.filter((item) => !item.adminOnly || user?.role === 'admin');
            if (!items.length) return null;
            return (
              <Stack key={group.label} gap={4} mb="sm">
                <Text size="xs" c="dimmed" tt="uppercase" fw={700}>{group.label}</Text>
                {items.map((item) => (
                  <NavLink
                    key={item.href}
                    href={item.href}
                    active={pathname === item.href}
                    label={item.label}
                    leftSection={<item.icon size={16} />}
                    variant="light"
                    color="teal"
                  />
                ))}
              </Stack>
            );
          })}
        </Stack>
        <Text size="xs" c="dimmed">App version: {process.env.NEXT_PUBLIC_APP_VERSION ?? 'dev'}</Text>
      </AppShell.Navbar>

      <AppShell.Main>
        <div style={{ maxWidth: 1220, margin: '0 auto', width: '100%', paddingTop: 6 }}>
          <span style={{ display: 'none' }}>{title}{subtitle ? ` - ${subtitle}` : ''}</span>
          {children}
        </div>
      </AppShell.Main>
    </AppShell>
  );
}

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getUser } from '../../../components/auth';
import { api } from '../../../lib/api';
import type { AdminUser, AuditLog, Invite, PasswordReset, Plugin, TemplateReport } from '../types';

const PAGE_SIZE = 10;

export type UseAdminReturn = {
  // Data
  users: AdminUser[];
  invites: Invite[];
  auditLogs: AuditLog[];
  resets: PasswordReset[];
  templateReports: TemplateReport[];
  plugins: Plugin[];
  loading: boolean;
  currentUser: ReturnType<typeof getUser>;
  // Invite form
  inviteEmail: string;
  inviteRole: 'admin' | 'user';
  latestInvite: Invite | null;
  inviting: boolean;
  // Edit modal
  editUser: AdminUser | null;
  // Pagination
  usersPage: number;
  invitesPage: number;
  resetsPage: number;
  auditPage: number;
  templateReportsPage: number;
  usersPages: number;
  invitesPages: number;
  resetsPages: number;
  auditPages: number;
  // Paginated rows
  userRows: AdminUser[];
  inviteRows: Invite[];
  resetRows: PasswordReset[];
  auditRows: AuditLog[];
  // Setters
  setInviteEmail: (v: string) => void;
  setInviteRole: (r: 'admin' | 'user') => void;
  setLatestInvite: (inv: Invite | null) => void;
  setEditUser: (u: AdminUser | null) => void;
  setUsersPage: (p: number) => void;
  setInvitesPage: (p: number) => void;
  setResetsPage: (p: number) => void;
  setAuditPage: (p: number) => void;
  setTemplateReportsPage: (p: number) => void;
  // Handlers
  load: () => Promise<void>;
  handleSaveUser: (patch: Partial<AdminUser>) => Promise<void>;
  handleDeleteUser: () => Promise<void>;
  createInvite: () => Promise<void>;
  revokeInvite: (id: string) => Promise<void>;
  revokeReset: (id: string) => Promise<void>;
};

export function useAdmin(): UseAdminReturn {
  const router = useRouter();
  const currentUser = useMemo(() => (typeof window !== 'undefined' ? getUser() : null), []);

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [resets, setResets] = useState<PasswordReset[]>([]);
  const [loading, setLoading] = useState(true);
  const [templateReports, setTemplateReports] = useState<TemplateReport[]>([]);
  const [plugins, setPlugins] = useState<Plugin[]>([]);

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'user'>('user');
  const [latestInvite, setLatestInvite] = useState<Invite | null>(null);
  const [inviting, setInviting] = useState(false);

  const [editUser, setEditUser] = useState<AdminUser | null>(null);

  const [usersPage, setUsersPage] = useState(1);
  const [invitesPage, setInvitesPage] = useState(1);
  const [resetsPage, setResetsPage] = useState(1);
  const [auditPage, setAuditPage] = useState(1);
  const [templateReportsPage, setTemplateReportsPage] = useState(1);

  useEffect(() => {
    if (!currentUser) router.push('/login');
    else if (currentUser.role !== 'admin') router.push('/unauthorized');
  }, [currentUser, router]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [u, inv, logs, rst] = await Promise.all([
        api<AdminUser[]>('/v1/admin/users'),
        api<Invite[]>('/v1/admin/invites'),
        api<AuditLog[]>('/v1/admin/audit-logs'),
        api<PasswordReset[]>('/v1/admin/password-resets'),
      ]);
      const [fb, pl] = await Promise.all([
        api<{ total: number; reports: TemplateReport[] }>('/v1/feedback/template-reports').catch(() => ({ total: 0, reports: [] })),
        api<Plugin[]>('/v1/plugins').catch(() => []),
      ]);
      setUsers(u);
      setInvites(inv);
      setAuditLogs(logs);
      setResets(rst);
      setTemplateReports(fb.reports);
      setPlugins(pl);
    } catch {
      router.push('/unauthorized');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    if (currentUser?.role === 'admin') void load();
  }, [currentUser, load]);

  const handleSaveUser = useCallback(async (patch: Partial<AdminUser>) => {
    if (!editUser) return;
    const updated = await api<AdminUser>('/v1/admin/users/update', undefined, {
      method: 'PATCH',
      body: JSON.stringify({ userId: editUser.id, ...patch }),
    });
    setUsers((prev) => prev.map((u) => (u.id === editUser.id ? { ...u, ...updated } : u)));
    setEditUser((prev) => (prev ? { ...prev, ...updated } : prev));
  }, [editUser]);

  const handleDeleteUser = useCallback(async () => {
    if (!editUser) return;
    await api(`/v1/admin/users/${editUser.id}`, undefined, { method: 'DELETE' });
    setUsers((prev) => prev.filter((u) => u.id !== editUser.id));
    setEditUser(null);
  }, [editUser]);

  const createInvite = useCallback(async () => {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    try {
      const inv = await api<Invite>('/v1/admin/invites', undefined, {
        method: 'POST',
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole, expiresInHours: 48 }),
      });
      setLatestInvite(inv);
      setInviteEmail('');
      await load();
    } finally {
      setInviting(false);
    }
  }, [inviteEmail, inviteRole, load]);

  const revokeInvite = useCallback(async (id: string) => {
    await api(`/v1/admin/invites/${id}`, undefined, { method: 'DELETE' });
    await load();
  }, [load]);

  const revokeReset = useCallback(async (id: string) => {
    await api(`/v1/admin/password-resets/${id}`, undefined, { method: 'DELETE' });
    await load();
  }, [load]);

  // Computed pagination
  const usersPages = Math.max(1, Math.ceil(users.length / PAGE_SIZE));
  const invitesPages = Math.max(1, Math.ceil(invites.length / PAGE_SIZE));
  const resetsPages = Math.max(1, Math.ceil(resets.length / PAGE_SIZE));
  const auditPages = Math.max(1, Math.ceil(auditLogs.length / PAGE_SIZE));

  const userRows = users.slice((usersPage - 1) * PAGE_SIZE, usersPage * PAGE_SIZE);
  const inviteRows = invites.slice((invitesPage - 1) * PAGE_SIZE, invitesPage * PAGE_SIZE);
  const resetRows = resets.slice((resetsPage - 1) * PAGE_SIZE, resetsPage * PAGE_SIZE);
  const auditRows = auditLogs.slice((auditPage - 1) * PAGE_SIZE, auditPage * PAGE_SIZE);

  return {
    users, invites, auditLogs, resets, templateReports, plugins,
    loading, currentUser,
    inviteEmail, inviteRole, latestInvite, inviting,
    editUser,
    usersPage, invitesPage, resetsPage, auditPage, templateReportsPage,
    usersPages, invitesPages, resetsPages, auditPages,
    userRows, inviteRows, resetRows, auditRows,
    setInviteEmail, setInviteRole, setLatestInvite, setEditUser,
    setUsersPage, setInvitesPage, setResetsPage, setAuditPage, setTemplateReportsPage,
    load, handleSaveUser, handleDeleteUser, createInvite, revokeInvite, revokeReset,
  };
}

export { PAGE_SIZE };

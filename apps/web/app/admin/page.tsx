'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppFrame } from '../../components/app-frame';
import { LoadingState } from '../../components/ui/loading-state';
import { AppModal } from '../../components/ui/modal-framework';
import { getToken, getUser } from '../../components/auth';
import { api } from '../../lib/api';
import { Button } from '../../app/components/Button';
import { Card } from '../../app/components/Card';
import { CopyButton } from '../../app/components/CopyButton';
import { Select } from '../../app/components/Select';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '../../app/components/Table';
import { TextInput } from '../../app/components/TextInput';

type AdminUser = { id: string; email: string; role: 'admin' | 'user'; createdAt: string; isActive?: boolean };
type Invite = { id: string; email: string; role: 'admin' | 'user'; inviteUrl?: string; expiresAt: string; acceptedAt?: string | null; createdAt?: string };
type AuditLog = { id: string; action: string; actorUserId: string | null; targetUserId: string | null; createdAt: string };
type PasswordReset = { id: string; email: string; expiresAt: string; createdAt: string; resetUrl: string };

export default function AdminPage() {
  const router = useRouter();
  const token = useMemo(() => (typeof window !== 'undefined' ? getToken() : ''), []);
  const user = useMemo(() => (typeof window !== 'undefined' ? getUser() : null), []);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'user'>('user');
  const [latestInvite, setLatestInvite] = useState<Invite | null>(null);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [passwordResets, setPasswordResets] = useState<PasswordReset[]>([]);
  const [editUserOpen, setEditUserOpen] = useState(false);
  const [editUserId, setEditUserId] = useState('');
  const [editUserEmail, setEditUserEmail] = useState('');
  const [invitesPage, setInvitesPage] = useState(1);
  const [resetsPage, setResetsPage] = useState(1);
  const [usersPage, setUsersPage] = useState(1);
  const [auditPage, setAuditPage] = useState(1);
  const [pageSize, setPageSize] = useState('10');

  useEffect(() => {
    if (!user || !token) router.push('/login');
    else if (user.role !== 'admin') router.push('/unauthorized');
  }, [router, token, user]);

  async function load() {
    setLoading(true);
    try {
      const [list, inviteList, logs, resets] = await Promise.all([
        api<AdminUser[]>('/v1/admin/users', token),
        api<Invite[]>('/v1/admin/invites', token),
        api<AuditLog[]>('/v1/admin/audit-logs', token),
        api<PasswordReset[]>('/v1/admin/password-resets', token),
      ]);
      setUsers(list);
      setInvites(inviteList);
      setAuditLogs(logs);
      setPasswordResets(resets);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!token || user?.role !== 'admin') return;
    load().catch(() => router.push('/unauthorized'));
  }, [token, user]);

  async function updateRole(userId: string, role: 'admin' | 'user') {
    await api('/v1/admin/users/role', token, {
      method: 'PATCH',
      body: JSON.stringify({ userId, role }),
    });
    await load();
  }

  function openEditUser(userId: string, currentEmail: string) {
    setEditUserId(userId);
    setEditUserEmail(currentEmail);
    setEditUserOpen(true);
  }

  async function saveUserEmail() {
    await api('/v1/admin/users/update', token, {
      method: 'PATCH',
      body: JSON.stringify({ userId: editUserId, email: editUserEmail }),
    });
    setEditUserOpen(false);
    await load();
  }

  async function setStatus(userId: string, isActive: boolean) {
    await api('/v1/admin/users/status', token, {
      method: 'PATCH',
      body: JSON.stringify({ userId, isActive }),
    });
    await load();
  }

  function resetInviteForm() {
    setInviteEmail('');
    setInviteRole('user');
    setLatestInvite(null);
  }

  async function createInvite() {
    const invite = await api<Invite>('/v1/admin/invites', token, {
      method: 'POST',
      body: JSON.stringify({ email: inviteEmail, role: inviteRole, expiresInHours: 48 }),
    });
    setLatestInvite(invite);
    setInviteEmail('');
    await load();
  }

  async function revokeInvite(id: string) {
    await api(`/v1/admin/invites/${id}`, token, { method: 'DELETE' });
    await load();
  }

  async function revokePasswordReset(id: string) {
    await api(`/v1/admin/password-resets/${id}`, token, { method: 'DELETE' });
    await load();
  }

  const size = Number(pageSize);
  const invitesPages = Math.max(1, Math.ceil(invites.length / size));
  const resetsPages = Math.max(1, Math.ceil(passwordResets.length / size));
  const usersPages = Math.max(1, Math.ceil(users.length / size));
  const auditPages = Math.max(1, Math.ceil(auditLogs.length / size));
  const invitesRows = invites.slice((Math.min(invitesPage, invitesPages) - 1) * size, Math.min(invitesPage, invitesPages) * size);
  const resetRows = passwordResets.slice((Math.min(resetsPage, resetsPages) - 1) * size, Math.min(resetsPage, resetsPages) * size);
  const userRows = users.slice((Math.min(usersPage, usersPages) - 1) * size, Math.min(usersPage, usersPages) * size);
  const auditRows = auditLogs.slice((Math.min(auditPage, auditPages) - 1) * size, Math.min(auditPage, auditPages) * size);

  return (
    <AppFrame title="Admin" subtitle="Role management, secure onboarding and invite links.">
      {loading ? <LoadingState label="Loading admin data..." /> : <>
      <AppModal opened={editUserOpen} onClose={() => setEditUserOpen(false)} title="Edit user email">
        <div className="space-y-4">
          <TextInput label="Email" value={editUserEmail} onChange={(e) => setEditUserEmail(e.currentTarget.value)} />
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setEditUserOpen(false)}>Cancel</Button>
            <Button onClick={saveUserEmail}>Save</Button>
          </div>
        </div>
      </AppModal>

      <Card>
        <h3 className="text-lg font-bold mb-4">Invite user</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <TextInput label="Email" placeholder="new.user@company.com" value={inviteEmail} onChange={(e) => setInviteEmail(e.currentTarget.value)} />
          <Select label="Role" value={inviteRole} onChange={(v) => setInviteRole((v as 'admin' | 'user') || 'user')} options={[{ value: 'user', label: 'user' }, { value: 'admin', label: 'admin' }]} />
        </div>
        <Button onClick={createInvite} disabled={!inviteEmail} className="mb-4">Create invite</Button>

        {latestInvite ? (
          <div className="bg-surface-elevated border border-border rounded-lg p-4 mt-4">
            <p className="text-sm text-text-secondary mb-2">Invite link (share directly or send per email):</p>
            <p className="text-sm break-all text-text-primary mb-3">{latestInvite.inviteUrl ?? '—'}</p>
            <CopyButton value={latestInvite.inviteUrl ?? ''} />
          </div>
        ) : null}
      </Card>

      <Card className="mb-6">
        <h3 className="text-lg font-bold mb-4">Active invites</h3>
        <div className="overflow-x-auto">
          <Table>
            <TableHead>
              <TableRow hover={false}>
                <TableHeader>Email</TableHeader>
                <TableHeader>Role</TableHeader>
                <TableHeader>Expires</TableHeader>
                <TableHeader>Status</TableHeader>
                <TableHeader>Action</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {invitesRows.map((i) => (
                <TableRow key={i.id}>
                  <TableCell>{i.email}</TableCell>
                  <TableCell>{i.role}</TableCell>
                  <TableCell>{new Date(i.expiresAt).toLocaleString()}</TableCell>
                  <TableCell>{i.acceptedAt ? 'accepted' : 'pending'}</TableCell>
                  <TableCell>
                    <Button size="sm" variant="secondary" disabled={Boolean(i.acceptedAt)} onClick={() => revokeInvite(i.id)}>Revoke</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="flex justify-between items-center mt-4">
          <div className="flex gap-2">
            <button
              onClick={() => setInvitesPage(Math.max(1, invitesPage - 1))}
              disabled={invitesPage === 1}
              className="px-2 py-1 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Prev
            </button>
            <span className="px-2 py-1 text-sm">{invitesPage} / {invitesPages}</span>
            <button
              onClick={() => setInvitesPage(Math.min(invitesPages, invitesPage + 1))}
              disabled={invitesPage === invitesPages}
              className="px-2 py-1 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
          <Select value={pageSize} onChange={setPageSize} options={[{ value: '10', label: '10' }, { value: '25', label: '25' }, { value: '50', label: '50' }]} className="w-20" />
        </div>
      </Card>

      <Card className="mb-6">
        <h3 className="text-lg font-bold mb-4">Password resets (fallback when email is not configured)</h3>
        <div className="overflow-x-auto">
          <Table>
            <TableHead>
              <TableRow hover={false}>
                <TableHeader>Email</TableHeader>
                <TableHeader>Created</TableHeader>
                <TableHeader>Expires</TableHeader>
                <TableHeader>Link</TableHeader>
                <TableHeader>Action</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {resetRows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.email}</TableCell>
                  <TableCell>{new Date(r.createdAt).toLocaleString()}</TableCell>
                  <TableCell>{new Date(r.expiresAt).toLocaleString()}</TableCell>
                  <TableCell>
                    <CopyButton value={r.resetUrl}>{({ copied, copy }) => <Button size="sm" variant="secondary" onClick={copy}>{copied ? 'Copied' : 'Copy link'}</Button>}</CopyButton>
                  </TableCell>
                  <TableCell>
                    <Button size="sm" variant="secondary" onClick={() => revokePasswordReset(r.id)}>Revoke</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="flex gap-2 mt-4">
          <button
            onClick={() => setResetsPage(Math.max(1, resetsPage - 1))}
            disabled={resetsPage === 1}
            className="px-2 py-1 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Prev
          </button>
          <span className="px-2 py-1 text-sm">{resetsPage} / {resetsPages}</span>
          <button
            onClick={() => setResetsPage(Math.min(resetsPages, resetsPage + 1))}
            disabled={resetsPage === resetsPages}
            className="px-2 py-1 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      </Card>

      <Card className="mb-6">
        <h3 className="text-lg font-bold mb-4">Users</h3>
        <div className="overflow-x-auto">
          <Table>
            <TableHead>
              <TableRow hover={false}>
                <TableHeader>Email</TableHeader>
                <TableHeader>Edit</TableHeader>
                <TableHeader>Status</TableHeader>
                <TableHeader>Role</TableHeader>
                <TableHeader>Created</TableHeader>
                <TableHeader>Change Role</TableHeader>
                <TableHeader>Toggle Status</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {userRows.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>{u.email}</TableCell>
                  <TableCell><Button size="sm" variant="secondary" onClick={() => openEditUser(u.id, u.email)}>Edit</Button></TableCell>
                  <TableCell>{u.isActive ? 'active' : 'disabled'}</TableCell>
                  <TableCell><span className="font-semibold">{u.role}</span></TableCell>
                  <TableCell>{new Date(u.createdAt).toLocaleString()}</TableCell>
                  <TableCell>
                    <Select
                      value={u.role}
                      onChange={(v) => v && updateRole(u.id, v as 'admin' | 'user')}
                      options={[{ value: 'admin', label: 'admin' }, { value: 'user', label: 'user' }]}
                    />
                  </TableCell>
                  <TableCell>
                    <Button size="sm" variant="secondary" onClick={() => setStatus(u.id, !u.isActive)}>{u.isActive ? 'Disable' : 'Enable'}</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="flex gap-2 mt-4">
          <button
            onClick={() => setUsersPage(Math.max(1, usersPage - 1))}
            disabled={usersPage === 1}
            className="px-2 py-1 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Prev
          </button>
          <span className="px-2 py-1 text-sm">{usersPage} / {usersPages}</span>
          <button
            onClick={() => setUsersPage(Math.min(usersPages, usersPage + 1))}
            disabled={usersPage === usersPages}
            className="px-2 py-1 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      </Card>

      <Card className="mt-6">
        <h3 className="text-lg font-bold mb-4">Audit logs</h3>
        <div className="overflow-x-auto">
          <Table>
            <TableHead>
              <TableRow hover={false}>
                <TableHeader>Time</TableHeader>
                <TableHeader>Action</TableHeader>
                <TableHeader>Actor</TableHeader>
                <TableHeader>Target</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {auditRows.map((l) => (
                <TableRow key={l.id}>
                  <TableCell>{new Date(l.createdAt).toLocaleString()}</TableCell>
                  <TableCell>{l.action}</TableCell>
                  <TableCell>{l.actorUserId ?? '—'}</TableCell>
                  <TableCell>{l.targetUserId ?? '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="flex gap-2 mt-4">
          <button
            onClick={() => setAuditPage(Math.max(1, auditPage - 1))}
            disabled={auditPage === 1}
            className="px-2 py-1 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Prev
          </button>
          <span className="px-2 py-1 text-sm">{auditPage} / {auditPages}</span>
          <button
            onClick={() => setAuditPage(Math.min(auditPages, auditPage + 1))}
            disabled={auditPage === auditPages}
            className="px-2 py-1 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      </Card>
      </>}
    </AppFrame>
  );
}

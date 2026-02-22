'use client';

import { Button, Card, CopyButton, Group, Pagination, ScrollArea, Select, Table, Text, TextInput } from '@mantine/core';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppFrame } from '../../components/app-frame';
import { LoadingState } from '../../components/ui/loading-state';
import { AppModal } from '../../components/ui/modal-framework';
import { getToken, getUser } from '../../components/auth';
import { api } from '../../lib/api';

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
        <TextInput label="Email" value={editUserEmail} onChange={(e) => setEditUserEmail(e.currentTarget.value)} />
        <Group mt="md" justify="flex-end">
          <Button variant="default" onClick={() => setEditUserOpen(false)}>Cancel</Button>
          <Button onClick={saveUserEmail}>Save</Button>
        </Group>
      </AppModal>

      <Card withBorder radius="md" mb="md">
        <Text fw={700}>Invite user</Text>
        <Group mt="sm" grow>
          <TextInput label="Email" placeholder="new.user@company.com" value={inviteEmail} onChange={(e) => setInviteEmail(e.currentTarget.value)} />
          <Select label="Role" data={[{ value: 'user', label: 'user' }, { value: 'admin', label: 'admin' }]} value={inviteRole} onChange={(v) => setInviteRole((v as 'admin' | 'user') || 'user')} />
        </Group>
        <Button mt="sm" color="teal" onClick={createInvite} disabled={!inviteEmail}>Create invite</Button>

        {latestInvite ? (
          <Card mt="sm" withBorder>
            <Text size="sm" c="dimmed">Invite link (share directly or send per email):</Text>
            <Text size="sm" style={{ wordBreak: 'break-all' }}>{latestInvite.inviteUrl ?? '—'}</Text>
            <CopyButton value={latestInvite.inviteUrl ?? ''}>{({ copied, copy }) => <Button mt="xs" variant="light" onClick={copy} disabled={!latestInvite.inviteUrl}>{copied ? 'Copied' : 'Copy link'}</Button>}</CopyButton>
          </Card>
        ) : null}
      </Card>

      <Card withBorder radius="md" mb="md">
        <Text fw={700} mb="sm">Active invites</Text>
        <ScrollArea>
          <Table withTableBorder withColumnBorders miw={840}>
            <Table.Thead><Table.Tr><Table.Th>Email</Table.Th><Table.Th>Role</Table.Th><Table.Th>Expires</Table.Th><Table.Th>Status</Table.Th><Table.Th>Action</Table.Th></Table.Tr></Table.Thead>
            <Table.Tbody>
              {invitesRows.map((i) => (
                <Table.Tr key={i.id}>
                  <Table.Td>{i.email}</Table.Td>
                  <Table.Td>{i.role}</Table.Td>
                  <Table.Td>{new Date(i.expiresAt).toLocaleString()}</Table.Td>
                  <Table.Td>{i.acceptedAt ? 'accepted' : 'pending'}</Table.Td>
                  <Table.Td>
                    <Button size="xs" variant="light" color="red" disabled={Boolean(i.acceptedAt)} onClick={() => revokeInvite(i.id)}>Revoke</Button>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </ScrollArea>
        <Group justify="space-between" mt="md">
          <Pagination value={Math.min(invitesPage, invitesPages)} onChange={setInvitesPage} total={invitesPages} />
          <Select w={90} value={pageSize} onChange={(v) => setPageSize(v || '10')} data={['10', '25', '50']} />
        </Group>
      </Card>

      <Card withBorder radius="md" mb="md">
        <Text fw={700} mb="sm">Password resets (fallback when email is not configured)</Text>
        <Table withTableBorder withColumnBorders>
          <Table.Thead><Table.Tr><Table.Th>Email</Table.Th><Table.Th>Created</Table.Th><Table.Th>Expires</Table.Th><Table.Th>Link</Table.Th><Table.Th>Action</Table.Th></Table.Tr></Table.Thead>
          <Table.Tbody>
            {resetRows.map((r) => (
              <Table.Tr key={r.id}>
                <Table.Td>{r.email}</Table.Td>
                <Table.Td>{new Date(r.createdAt).toLocaleString()}</Table.Td>
                <Table.Td>{new Date(r.expiresAt).toLocaleString()}</Table.Td>
                <Table.Td>
                  <CopyButton value={r.resetUrl}>{({ copied, copy }) => <Button size="xs" variant="light" onClick={copy}>{copied ? 'Copied' : 'Copy reset link'}</Button>}</CopyButton>
                </Table.Td>
                <Table.Td>
                  <Button size="xs" variant="light" color="red" onClick={() => revokePasswordReset(r.id)}>Revoke</Button>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
        <Group justify="space-between" mt="md">
          <Pagination value={Math.min(resetsPage, resetsPages)} onChange={setResetsPage} total={resetsPages} />
        </Group>
      </Card>

      <Card withBorder radius="md">
        <Text fw={700} mb="sm">Users</Text>
        <ScrollArea>
          <Table withTableBorder withColumnBorders miw={1080}>
            <Table.Thead><Table.Tr><Table.Th>Email</Table.Th><Table.Th>Edit</Table.Th><Table.Th>Status</Table.Th><Table.Th>Role</Table.Th><Table.Th>Created</Table.Th><Table.Th>Change Role</Table.Th><Table.Th>Toggle Status</Table.Th></Table.Tr></Table.Thead>
            <Table.Tbody>
              {userRows.map((u) => (
                <Table.Tr key={u.id}>
                  <Table.Td>{u.email}</Table.Td>
                  <Table.Td><Button size="xs" variant="light" onClick={() => openEditUser(u.id, u.email)}>Edit</Button></Table.Td>
                  <Table.Td>{u.isActive ? 'active' : 'disabled'}</Table.Td>
                  <Table.Td><Text fw={600}>{u.role}</Text></Table.Td>
                  <Table.Td>{new Date(u.createdAt).toLocaleString()}</Table.Td>
                  <Table.Td>
                    <Select
                      data={[{ value: 'admin', label: 'admin' }, { value: 'user', label: 'user' }]}
                      value={u.role}
                      onChange={(v) => v && updateRole(u.id, v as 'admin' | 'user')}
                    />
                  </Table.Td>
                  <Table.Td>
                    <Button size="xs" variant="light" color={u.isActive ? 'red' : 'teal'} onClick={() => setStatus(u.id, !u.isActive)}>{u.isActive ? 'Disable' : 'Enable'}</Button>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </ScrollArea>
        <Group justify="space-between" mt="md">
          <Pagination value={Math.min(usersPage, usersPages)} onChange={setUsersPage} total={usersPages} />
        </Group>
      </Card>

      <Card withBorder radius="md" mt="md">
        <Text fw={700} mb="sm">Audit logs</Text>
        <Table withTableBorder withColumnBorders>
          <Table.Thead><Table.Tr><Table.Th>Time</Table.Th><Table.Th>Action</Table.Th><Table.Th>Actor</Table.Th><Table.Th>Target</Table.Th></Table.Tr></Table.Thead>
          <Table.Tbody>
            {auditRows.map((l) => (
              <Table.Tr key={l.id}>
                <Table.Td>{new Date(l.createdAt).toLocaleString()}</Table.Td>
                <Table.Td>{l.action}</Table.Td>
                <Table.Td>{l.actorUserId ?? '—'}</Table.Td>
                <Table.Td>{l.targetUserId ?? '—'}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
        <Group justify="space-between" mt="md">
          <Pagination value={Math.min(auditPage, auditPages)} onChange={setAuditPage} total={auditPages} />
        </Group>
      </Card>
      </>}
    </AppFrame>
  );
}

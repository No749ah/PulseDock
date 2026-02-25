'use client';

import { Alert, Button, Card, Group, Modal, PasswordInput, SimpleGrid, Stack, Text, TextInput } from '@mantine/core';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppFrame } from '../../components/app-frame';
import { api } from '../../lib/api';
import { clearSession, getToken, getUser } from '../../components/auth';

type Me = { id: string; email: string; role: 'admin' | 'user'; mustChangePassword?: boolean };
type Session = { id: string; userAgent: string | null; ipAddress: string | null; revokedAt: string | null; createdAt: string };

export default function AccountPage() {
  const router = useRouter();
  const token = useMemo(() => (typeof window !== 'undefined' ? getToken() : ''), []);
  const [me, setMe] = useState<Me | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);

  const [profileEmail, setProfileEmail] = useState(() => (typeof window !== 'undefined' ? getUser()?.email ?? '' : ''));
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const [firstLoginEmail, setFirstLoginEmail] = useState('');
  const [firstLoginNewPassword, setFirstLoginNewPassword] = useState('');
  const [firstLoginSaving, setFirstLoginSaving] = useState(false);
  const [firstLoginError, setFirstLoginError] = useState('');
  const [passwordError, setPasswordError] = useState('');

  useEffect(() => {
    const user = getUser();
    if (!user || !token) router.push('/login');
  }, [router, token]);

  async function load() {
    const [profile, sess] = await Promise.all([
      api<Me>('/v1/auth/me', token),
      api<Session[]>('/v1/auth/sessions', token),
    ]);
    setMe(profile);
    setSessions(sess);
    setProfileEmail(profile.email);
  }

  useEffect(() => { load().catch(() => router.push('/login')); }, []);

  useEffect(() => {
    if (me?.mustChangePassword) setFirstLoginEmail(me.email);
  }, [me]);

  async function saveProfile() {
    const updated = await api<{ id: string; email: string; role: 'admin' | 'user' }>('/v1/auth/profile', token, {
      method: 'PATCH',
      body: JSON.stringify({ email: profileEmail }),
    });
    localStorage.setItem('pulsedock_user', JSON.stringify({ ...updated, name: updated.email.split('@')[0] || 'user' }));
    localStorage.setItem('pulsedock_remembered_user', updated.email.toLowerCase());
    await load();
  }

  async function savePassword() {
    setPasswordError('');
    try {
      await api('/v1/auth/change-password', token, {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setCurrentPassword('');
      setNewPassword('');
      clearSession();
      router.push('/login');
    } catch (e: any) {
      setPasswordError(String(e?.message ?? 'Password update failed'));
    }
  }

  async function revokeSession(sessionId: string) {
    await api('/v1/auth/sessions/revoke', token, {
      method: 'POST',
      body: JSON.stringify({ sessionId }),
    });
    await load();
  }

  async function revokeAllSessions() {
    await api('/v1/auth/sessions/revoke-all', token, { method: 'POST' });
    await load();
  }

  async function completeFirstLoginProfile() {
    setFirstLoginSaving(true);
    setFirstLoginError('');
    try {
      const updated = await api<{ id: string; email: string; role: 'admin' | 'user' }>('/v1/auth/profile', token, {
        method: 'PATCH',
        body: JSON.stringify({ email: firstLoginEmail }),
      });
      localStorage.setItem('pulsedock_user', JSON.stringify({ ...updated, name: updated.email.split('@')[0] || 'user' }));
      localStorage.setItem('pulsedock_remembered_user', updated.email.toLowerCase());
      await api('/v1/auth/change-password', token, {
        method: 'POST',
        body: JSON.stringify({ newPassword: firstLoginNewPassword }),
      });
      clearSession();
      router.push('/login');
    } catch (e: any) {
      setFirstLoginError(String(e?.message ?? 'Could not complete first login setup'));
    } finally {
      setFirstLoginSaving(false);
    }
  }

  return (
    <AppFrame title="Account" subtitle="Profile, password, tokens and active sessions.">
      <Modal opened={Boolean(me?.mustChangePassword)} onClose={() => {}} closeOnClickOutside={false} closeOnEscape={false} withCloseButton={false} title="First login security setup" centered>
        <form onSubmit={(e) => { e.preventDefault(); void completeFirstLoginProfile(); }}>
          <Text size="sm" c="dimmed" mb="sm">You must update your account email and password before continuing.</Text>
          <TextInput label="New account email" value={firstLoginEmail} onChange={(e) => setFirstLoginEmail(e.currentTarget.value)} />
          <PasswordInput mt="sm" label="New password" value={firstLoginNewPassword} onChange={(e) => setFirstLoginNewPassword(e.currentTarget.value)} />
          {firstLoginError ? <Alert mt="sm" color="red">{firstLoginError}</Alert> : null}
          <Button type="submit" mt="md" fullWidth color="teal" loading={firstLoginSaving}>Save and continue</Button>
        </form>
      </Modal>

      <Stack>
        <SimpleGrid cols={{ base: 1, lg: 2 }}>
          <Card withBorder>
            <form onSubmit={(e) => { e.preventDefault(); void saveProfile(); }}>
              <Text fw={700}>Profile</Text>
              <Text size="sm" c="dimmed">{me?.email ?? '—'} ({me?.role ?? '—'})</Text>
              <TextInput mt="sm" label="Email" value={profileEmail} onChange={(e) => setProfileEmail(e.currentTarget.value)} />
              <Button type="submit" mt="sm" color="teal" variant="light">Save email</Button>
            </form>
          </Card>

          <Card withBorder>
            <form onSubmit={(e) => { e.preventDefault(); void savePassword(); }}>
              <Text fw={700}>Password</Text>
              <PasswordInput mt="sm" label="Current password" value={currentPassword} onChange={(e) => setCurrentPassword(e.currentTarget.value)} />
              <PasswordInput mt="sm" label="New password" value={newPassword} onChange={(e) => setNewPassword(e.currentTarget.value)} />
              {passwordError ? <Alert mt="sm" color="red">{passwordError}</Alert> : null}
              <Button type="submit" mt="sm" color="teal">Update password</Button>
            </form>
          </Card>
        </SimpleGrid>

        <Card withBorder>
          <Group justify="space-between" wrap="wrap">
            <Text fw={700}>Sessions / Tokens</Text>
            <Button size="xs" variant="light" color="red" onClick={revokeAllSessions} style={{ width: '100%', maxWidth: 220 }}>Revoke all sessions</Button>
          </Group>
          {sessions.filter((s) => !s.revokedAt).map((s) => (
            <Card key={s.id} mt="sm" withBorder>
              <Text size="xs" c="dimmed" style={{ wordBreak: 'break-word' }}>{new Date(s.createdAt).toLocaleString()} · {s.ipAddress ?? 'unknown ip'}</Text>
              <Text size="xs" c="dimmed" style={{ wordBreak: 'break-word' }}>{s.userAgent ?? 'unknown agent'}</Text>
              <Button mt="xs" size="xs" variant="light" color="red" disabled={Boolean(s.revokedAt)} onClick={() => revokeSession(s.id)}>{s.revokedAt ? 'Revoked' : 'Revoke'}</Button>
            </Card>
          ))}
        </Card>
      </Stack>
    </AppFrame>
  );
}

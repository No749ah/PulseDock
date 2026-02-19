'use client';

import { Alert, Button, Card, Checkbox, Group, PasswordInput, Stack, Text, TextInput } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../lib/api';
import { setSession } from '../../components/auth';

type LoginUser = { id: string; email: string; role: 'admin' | 'user'; mustChangePassword?: boolean };

export default function LoginPage() {
  const [inviteToken, setInviteToken] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberUser, setRememberUser] = useState(true);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const invite = params.get('invite') ?? '';
    const reset = params.get('reset') ?? '';
    const queryEmail = params.get('email') ?? '';
    const rememberedEmail = localStorage.getItem('pulsedock_remembered_user') ?? '';

    setInviteToken(invite);
    setResetToken(reset);

    if (!invite && queryEmail) setEmail(queryEmail);
    else if (!invite && !reset && rememberedEmail) setEmail(rememberedEmail);
  }, []);

  useEffect(() => {
    async function loadInviteInfo() {
      if (!inviteToken) return;
      setInviteLoading(true);
      setError('');
      try {
        const data = await api<{ email: string; role: 'admin' | 'user'; expiresAt: string }>('/v1/auth/invite-info', undefined, {
          method: 'POST',
          body: JSON.stringify({ token: inviteToken }),
        });
        setEmail(data.email);
        setInfo(`Invite for ${data.email} (${data.role})`);
      } catch {
        setError('Invalid or expired invite link');
      } finally {
        setInviteLoading(false);
      }
    }
    loadInviteInfo();
  }, [inviteToken]);

  const inInviteFlow = useMemo(() => Boolean(inviteToken), [inviteToken]);
  const inResetFlow = useMemo(() => Boolean(resetToken), [resetToken]);

  async function login() {
    setLoading(true);
    setError('');
    setInfo('');
    try {
      const res = await api<{ accessToken: string; refreshToken: string; user: LoginUser }>('/v1/auth/login', undefined, {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });

      const normalizedEmail = email.trim().toLowerCase();
      const isFirstLogin = Boolean(res.user.mustChangePassword);

      // Do not keep the default/first-login email automatically.
      // Remembered email is only stored for regular logins.
      if (rememberUser && !isFirstLogin) localStorage.setItem('pulsedock_remembered_user', normalizedEmail);
      else localStorage.removeItem('pulsedock_remembered_user');

      const name = (res.user.email?.split('@')[0] || 'user').trim() || 'user';
      setSession(res.accessToken, res.refreshToken, { ...(res.user as any), name });
      router.push('/account');
    } catch (e: any) {
      const msg = String(e?.message ?? '');
      setError(msg || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  async function acceptInvite() {
    if (inviteLoading) return;
    setLoading(true);
    setError('');
    setInfo('');
    try {
      await api('/v1/auth/accept-invite', undefined, {
        method: 'POST',
        body: JSON.stringify({ token: inviteToken, password }),
      });
      await login();
    } catch {
      setError('Invite acceptance failed');
      setLoading(false);
    }
  }

  async function requestReset() {
    setLoading(true);
    setError('');
    setInfo('');
    try {
      await api<{ ok: boolean }>('/v1/auth/request-password-reset', undefined, {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      setInfo('If your account exists, reset instructions were sent by email. If email is not configured, an admin can share the reset link from Admin Portal.');
    } catch {
      setError('Could not request password reset');
    } finally {
      setLoading(false);
    }
  }

  async function confirmReset() {
    setLoading(true);
    setError('');
    setInfo('');
    try {
      await api('/v1/auth/reset-password', undefined, {
        method: 'POST',
        body: JSON.stringify({ token: resetToken, newPassword: password }),
      });
      setInfo('Password reset complete. Please login with your new password.');
      setResetToken('');
    } catch {
      setError('Password reset failed');
    } finally {
      setLoading(false);
    }
  }

  const subtitle = inInviteFlow
    ? 'Set your password to accept your invite'
    : inResetFlow
      ? 'Set a new password for your account'
      : forgotMode
        ? 'Request a password reset link'
        : 'Sign in to your monitoring workspace';

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 16 }}>
      <Card withBorder shadow="xl" radius="lg" p="xl" style={{ width: '100%', maxWidth: 560, background: 'rgba(10,24,19,0.86)', backdropFilter: 'blur(8px)' }}>
        <Stack
          component="form"
          onSubmit={(e) => {
            e.preventDefault();
            if (inInviteFlow) return void acceptInvite();
            if (inResetFlow) return void confirmReset();
            if (forgotMode) return void requestReset();
            return void login();
          }}
        >
          <Text fw={800} size="2rem">PulseDock</Text>
          <Text c="dimmed">{subtitle}</Text>

          <TextInput label="Email" value={email} disabled={inInviteFlow || inResetFlow} onChange={(e) => setEmail(e.currentTarget.value)} />
          {(!forgotMode || inResetFlow || inInviteFlow) ? (
            <PasswordInput label={inInviteFlow || inResetFlow ? 'Choose Password' : 'Password'} value={password} onChange={(e) => setPassword(e.currentTarget.value)} />
          ) : null}

          {!inInviteFlow && !inResetFlow && !forgotMode ? (
            <Checkbox
              label="Benutzer merken"
              checked={rememberUser}
              onChange={(e) => setRememberUser(e.currentTarget.checked)}
            />
          ) : null}

          {error ? <Alert color="red" icon={<IconAlertCircle size={16} />}>{error}</Alert> : null}
          {info ? <Alert color="teal">{info}</Alert> : null}

          <Group grow>
            {inInviteFlow ? (
              <Button type="submit" color="teal" loading={loading || inviteLoading} disabled={inviteLoading}>Accept Invite</Button>
            ) : inResetFlow ? (
              <Button type="submit" color="teal" loading={loading}>Set New Password</Button>
            ) : forgotMode ? (
              <Button type="submit" color="teal" loading={loading}>Request Reset Link</Button>
            ) : (
              <Button type="submit" color="teal" loading={loading}>Login</Button>
            )}
          </Group>

          {!inInviteFlow && !inResetFlow ? (
            <Group justify="space-between">
              <Button type="button" variant="subtle" color="teal" onClick={() => setForgotMode((v) => !v)}>{forgotMode ? 'Back to login' : 'Forgot password?'}</Button>
            </Group>
          ) : null}
        </Stack>
      </Card>
    </div>
  );
}

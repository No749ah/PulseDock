'use client';

import { useState } from 'react';
import {
  AlertCircle, Check, Copy, RotateCcw, Shield, ShieldOff, Trash2, Users, X,
} from 'lucide-react';
import { api } from '../../../lib/api';
import type { AdminUser } from '../types';

interface EditUserModalProps {
  user: AdminUser;
  currentUserId: string;
  onClose: () => void;
  onSave: (patch: Partial<AdminUser>) => Promise<void>;
  onDelete: () => Promise<void>;
}

export function EditUserModal({ user: u, currentUserId, onClose, onSave, onDelete }: EditUserModalProps) {
  const [email, setEmail] = useState(u.email);
  const [displayName, setDisplayName] = useState(u.displayName ?? '');
  const [role, setRole] = useState<'admin' | 'user'>(u.role);
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [resetUrl, setResetUrl] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isSelf = u.id === currentUserId;

  const inputClass = 'w-full px-3 py-2.5 rounded-xl bg-bg border border-border text-sm text-text-primary focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent';
  const actionRowClass = 'flex items-center justify-between gap-3 py-3 px-3.5 rounded-xl bg-surface-elevated border border-border';

  async function handleSave() {
    setSaving(true); setError(''); setSuccess('');
    try {
      await onSave({ email: email.trim(), displayName: displayName.trim() || undefined, role });
      setSuccess('Changes saved.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive() {
    setActionLoading('status'); setError(''); setSuccess('');
    try {
      await onSave({ isActive: !(u.isActive !== false) });
      setSuccess('Account status updated.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update');
    } finally {
      setActionLoading(null);
    }
  }

  async function doResetMfa() {
    setActionLoading('mfa'); setError(''); setSuccess('');
    try {
      await api(`/v1/admin/users/${u.id}/reset-mfa`, undefined, { method: 'POST' });
      setSuccess('MFA disabled. User must re-authenticate.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to reset MFA');
    } finally {
      setActionLoading(null);
    }
  }

  async function doForcePasswordReset() {
    setActionLoading('pwreset'); setError(''); setSuccess('');
    try {
      const res = await api<{ ok: boolean; resetUrl: string; expiresAt: string }>(
        `/v1/admin/users/${u.id}/force-password-reset`, undefined, { method: 'POST' },
      );
      setResetUrl(res.resetUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create reset link');
    } finally {
      setActionLoading(null);
    }
  }

  async function doDelete() {
    setActionLoading('delete'); setError('');
    try {
      await onDelete();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete user');
      setConfirmDelete(false);
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-border bg-surface shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
          <div className="w-10 h-10 rounded-full bg-accent/15 flex items-center justify-center shrink-0 text-base font-bold text-accent uppercase">
            {u.email[0]}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-text-primary truncate">{u.displayName || u.email}</p>
            {u.displayName && <p className="text-xs text-text-secondary truncate">{u.email}</p>}
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold border ${u.role === 'admin' ? 'text-accent bg-accent/10 border-accent/30' : 'text-text-secondary bg-surface-elevated border-border'}`}>
                {u.role === 'admin' ? '🛡 Admin' : '👤 User'}
              </span>
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold border ${u.isActive !== false ? 'text-success bg-success/10 border-success/30' : 'text-danger bg-danger/10 border-danger/30'}`}>
                {u.isActive !== false ? 'Active' : 'Disabled'}
              </span>
              {u.totpEnabled && (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold border text-warning bg-warning/10 border-warning/30">
                  🔐 MFA On
                </span>
              )}
              {u.emailVerified && (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold border text-success bg-success/10 border-success/30">
                  ✓ Verified
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-5 max-h-[70vh] overflow-y-auto">
          {/* Profile */}
          <section>
            <p className="text-[11px] font-semibold text-text-muted uppercase tracking-wider mb-3">Profile</p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">Display name</label>
                <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Full name" className={inputClass} />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">Email address</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
              </div>
            </div>
          </section>

          {/* Role */}
          <section>
            <p className="text-[11px] font-semibold text-text-muted uppercase tracking-wider mb-3">Role</p>
            <div className="flex gap-2">
              {(['user', 'admin'] as const).map((r) => {
                const isSelected = role === r;
                const isAdmin = r === 'admin';
                return (
                  <button
                    key={r}
                    disabled={isSelf}
                    onClick={() => setRole(r)}
                    className={`flex items-center gap-2 flex-1 px-3 py-2.5 rounded-xl text-sm font-medium border transition-all ${
                      isSelected
                        ? isAdmin
                          ? 'text-accent bg-accent/10 border-accent/40'
                          : 'text-text-primary bg-surface-elevated border-border'
                        : 'text-text-secondary bg-transparent border-border/50 hover:border-border hover:text-text-primary'
                    } disabled:opacity-40 disabled:cursor-not-allowed`}
                  >
                    {isAdmin ? <Shield className="w-4 h-4 shrink-0" /> : <Users className="w-4 h-4 shrink-0" />}
                    {isAdmin ? 'Admin' : 'User'}
                    {isSelected && <Check className="w-3.5 h-3.5 ml-auto" />}
                  </button>
                );
              })}
            </div>
            {isSelf && <p className="text-xs text-text-secondary mt-2">You cannot change your own role.</p>}
          </section>

          {/* Account Actions */}
          <section>
            <p className="text-[11px] font-semibold text-text-muted uppercase tracking-wider mb-3">Account Actions</p>
            <div className="space-y-2">
              <div className={actionRowClass}>
                <div>
                  <p className="text-sm font-medium text-text-primary">
                    {u.isActive !== false ? 'Disable account' : 'Enable account'}
                  </p>
                  <p className="text-xs text-text-secondary mt-0.5">
                    {u.isActive !== false ? 'Revokes all sessions, blocks sign-in' : 'Restore sign-in access'}
                  </p>
                </div>
                <button
                  disabled={isSelf || actionLoading === 'status'}
                  onClick={toggleActive}
                  className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                    u.isActive !== false
                      ? 'bg-danger/10 text-danger border-danger/30 hover:bg-danger/20'
                      : 'bg-success/10 text-success border-success/30 hover:bg-success/20'
                  }`}
                >
                  {actionLoading === 'status' ? '…' : u.isActive !== false ? 'Disable' : 'Enable'}
                </button>
              </div>

              <div className={actionRowClass}>
                <div>
                  <p className="text-sm font-medium text-text-primary">Force password reset</p>
                  <p className="text-xs text-text-secondary mt-0.5">Revokes sessions + generates a 15-min reset link</p>
                </div>
                <button
                  disabled={actionLoading === 'pwreset'}
                  onClick={doForcePasswordReset}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-warning/30 bg-warning/10 text-warning hover:bg-warning/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  {actionLoading === 'pwreset' ? '…' : 'Reset'}
                </button>
              </div>

              {u.totpEnabled && (
                <div className={actionRowClass}>
                  <div>
                    <p className="text-sm font-medium text-text-primary">Remove MFA</p>
                    <p className="text-xs text-text-secondary mt-0.5">Disables TOTP and clears recovery codes</p>
                  </div>
                  <button
                    disabled={isSelf || actionLoading === 'mfa'}
                    onClick={doResetMfa}
                    className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-warning/30 bg-warning/10 text-warning hover:bg-warning/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <ShieldOff className="w-3.5 h-3.5" />
                    {actionLoading === 'mfa' ? '…' : 'Remove MFA'}
                  </button>
                </div>
              )}

              {resetUrl && (
                <div className="rounded-xl border border-warning/30 bg-warning/5 px-3.5 py-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-3.5 h-3.5 text-warning shrink-0" />
                    <p className="text-xs font-medium text-warning">Share this link with the user — expires in 15 min</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-[11px] font-mono text-text-primary break-all bg-bg rounded-lg px-2.5 py-1.5 border border-border">
                      {resetUrl}
                    </code>
                    <button
                      onClick={() => { void navigator.clipboard.writeText(resetUrl); }}
                      className="shrink-0 p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors"
                      title="Copy link"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Danger Zone */}
          {!isSelf && (
            <section>
              <p className="text-[11px] font-semibold text-danger/70 uppercase tracking-wider mb-3">Danger Zone</p>
              {!confirmDelete ? (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="w-full flex items-center gap-2 px-3.5 py-3 rounded-xl border border-danger/30 bg-danger/5 text-danger text-sm font-medium hover:bg-danger/10 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete user account
                </button>
              ) : (
                <div className="rounded-xl border border-danger/40 bg-danger/5 px-3.5 py-3 space-y-3">
                  <p className="text-sm font-semibold text-danger">Delete {u.email}?</p>
                  <p className="text-xs text-text-secondary">
                    This permanently deletes the account and all associated data. This cannot be undone.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setConfirmDelete(false)}
                      className="flex-1 py-2 rounded-lg border border-border text-xs text-text-secondary hover:text-text-primary transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      disabled={actionLoading === 'delete'}
                      onClick={doDelete}
                      className="flex-1 py-2 rounded-lg bg-danger text-white text-xs font-semibold hover:bg-danger/90 disabled:opacity-50 transition-colors"
                    >
                      {actionLoading === 'delete' ? 'Deleting…' : 'Yes, delete'}
                    </button>
                  </div>
                </div>
              )}
            </section>
          )}

          {error && (
            <p className="text-xs text-danger bg-danger/10 border border-danger/20 rounded-lg px-3 py-2">{error}</p>
          )}
          {success && !error && (
            <p className="text-xs text-success bg-success/10 border border-success/20 rounded-lg px-3 py-2">{success}</p>
          )}
        </div>

        <div className="flex gap-2 px-5 py-4 border-t border-border">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-border text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            Close
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !email.trim()}
            className="flex-1 py-2.5 rounded-xl bg-accent text-white text-sm font-semibold hover:bg-accent/90 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

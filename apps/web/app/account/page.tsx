"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, AlertCircle, Bell, CheckCircle2, Clock, Copy, Download, Key, LogOut, Plus, QrCode, RefreshCw, Shield, Smartphone, Trash2, User, X } from "lucide-react";
import { PasswordStrength, passwordMeetsPolicy } from "../components/PasswordStrength";
import { api } from "../../lib/api";
import { clearSession, getUser } from "../../components/auth";
import { AppFrame } from "../../components/app-frame";
import { Card } from "../components/Card";
import { Button } from "../components/Button";
import { Badge } from "../components/Badge";
import { FadeIn } from "../components/FadeIn";
import { Modal } from "../components/Modal";
import { useToast } from "../../components/ui/toast";

interface Me {
  id: string;
  email: string;
  role: "admin" | "user";
  mustChangePassword?: boolean;
  totpEnabled?: boolean;
}

interface TotpSetupData {
  secret: string;
  qrCodeUrl: string;
  otpAuthUrl: string;
}

interface Session {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  revokedAt: string | null;
  createdAt: string;
}

interface AuditLogEntry {
  id: string;
  action: string;
  createdAt: string;
  metaJson: unknown;
}

interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

interface NewApiKey extends ApiKey {
  key: string;
}

interface NotificationPreference {
  id: string;
  notifyOnDown: boolean;
  notifyOnRecovery: boolean;
  notifyOnDegraded: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart: number;
  quietHoursEnd: number;
  frequency: string;
}

const inputClass =
  "w-full px-4 py-3 bg-surface border border-border rounded-lg text-text-primary placeholder-text-secondary focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent";

export default function AccountPage() {
  const router = useRouter();
  const { success: toastSuccess, error: toastError, info: toastInfo } = useToast();
  const [user, setUser] = useState<ReturnType<typeof getUser> | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [timezone, setTimezone] = useState("UTC");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // 2FA state
  const [show2FASetup, setShow2FASetup] = useState(false);
  const [totpSetupData, setTotpSetupData] = useState<TotpSetupData | null>(null);
  const [totpVerifyCode, setTotpVerifyCode] = useState("");
  const [totpRecoveryCodes, setTotpRecoveryCodes] = useState<string[] | null>(null);
  const [totpLoading, setTotpLoading] = useState(false);
  const [totpError, setTotpError] = useState("");
  const [showDisable2FA, setShowDisable2FA] = useState(false);
  const [disablePassword, setDisablePassword] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [disableLoading, setDisableLoading] = useState(false);
  const [showRegenerateRecovery, setShowRegenerateRecovery] = useState(false);
  const [regenCode, setRegenCode] = useState("");
  const [regenCodes, setRegenCodes] = useState<string[] | null>(null);
  const [regenLoading, setRegenLoading] = useState(false);
  const [recoveryCodesCopied, setRecoveryCodesCopied] = useState(false);

  // Activity log state
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditExpanded, setAuditExpanded] = useState(false);

  // Notification preferences state
  const [notifPrefs, setNotifPrefs] = useState<NotificationPreference | null>(null);
  const [notifSaving, setNotifSaving] = useState(false);

  // API key creation state
  const [showCreateKey, setShowCreateKey] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyExpiry, setNewKeyExpiry] = useState("");
  const [creatingKey, setCreatingKey] = useState(false);
  const [createdKey, setCreatedKey] = useState<NewApiKey | null>(null);
  const [keyCopied, setKeyCopied] = useState(false);

  useEffect(() => {
    const currentUser = getUser();
    setUser(currentUser);
    if (!currentUser) {
      router.push("/login");
      return;
    }

    const userId = currentUser.id;

    async function load() {
      try {
        setLoading(true);
        
        const [profile, sess, keys] = await Promise.all([
          api<Me>("/v1/auth/me", userId),
          api<Session[]>("/v1/auth/sessions", userId),
          api<ApiKey[]>("/v1/api-keys", userId),
        ]);
        setMe(profile);
        setSessions(sess);
        setApiKeys(keys);
        setEmail(profile.email);
        setDisplayName((profile as unknown as { displayName?: string }).displayName ?? "");
        setTimezone((profile as unknown as { timezone?: string }).timezone ?? "UTC");
        // Load audit log + notification preferences lazily (don't block main load)
        api<AuditLogEntry[]>("/v1/auth/audit-log", userId).then(setAuditLog).catch(() => {});
        api<NotificationPreference>("/v1/notification-preferences", userId).then(setNotifPrefs).catch(() => {});
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : "Failed to load account");
        router.push("/login");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [router]);

  const handleUpdateProfile = async () => {
    try {
      await api("/v1/auth/profile", user?.id, {
        method: "PATCH",
        body: JSON.stringify({ email, displayName: displayName || undefined, timezone }),
      });
      toastSuccess("Profile updated successfully");
      if (me) setMe({ ...me, email });
    } catch (e) {
      toastError(e instanceof Error ? e.message : "Failed to update profile");
    }
  };

  const handleChangePassword = async () => {
    try {
      
      

      if (newPassword !== confirmPassword) {
        toastError("Passwords don't match");
        return;
      }

      if (newPassword.length < 12) {
        toastError("Password must be at least 12 characters");
        return;
      }

      await api("/v1/auth/change-password", user?.id, {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toastSuccess("Password changed. Logging you out…");
      setTimeout(() => {
        void clearSession().then(() => router.push("/login"));
      }, 2000);
    } catch (e) {
      toastError(e instanceof Error ? e.message : "Failed to change password");
    }
  };

  // ─── 2FA handlers ────────────────────────────────────────────────────────
  const handle2FASetupStart = async () => {
    try {
      setTotpLoading(true);
      setTotpError("");
      const data = await api<TotpSetupData>("/v1/auth/2fa/setup", user?.id, { method: "POST" });
      setTotpSetupData(data);
      setShow2FASetup(true);
    } catch (e) {
      setTotpError(e instanceof Error ? e.message : "Failed to start 2FA setup");
    } finally {
      setTotpLoading(false);
    }
  };

  const handle2FAEnable = async () => {
    if (!totpVerifyCode.trim()) return;
    try {
      setTotpLoading(true);
      setTotpError("");
      const result = await api<{ recoveryCodes: string[] }>("/v1/auth/2fa/enable", user?.id, {
        method: "POST",
        body: JSON.stringify({ code: totpVerifyCode.trim() }),
      });
      setTotpRecoveryCodes(result.recoveryCodes);
      setTotpVerifyCode("");
      if (me) setMe({ ...me, totpEnabled: true });
    } catch (e) {
      setTotpError(e instanceof Error ? e.message : "Invalid code");
    } finally {
      setTotpLoading(false);
    }
  };

  const handleClose2FASetup = () => {
    setShow2FASetup(false);
    setTotpSetupData(null);
    setTotpVerifyCode("");
    setTotpRecoveryCodes(null);
    setTotpError("");
    setRecoveryCodesCopied(false);
  };

  const handle2FADisable = async () => {
    try {
      setDisableLoading(true);
      setTotpError("");
      await api("/v1/auth/2fa/disable", user?.id, {
        method: "POST",
        body: JSON.stringify({ password: disablePassword, code: disableCode }),
      });
      if (me) setMe({ ...me, totpEnabled: false });
      setShowDisable2FA(false);
      setDisablePassword("");
      setDisableCode("");
      toastSuccess("Two-factor authentication disabled");
    } catch (e) {
      setTotpError(e instanceof Error ? e.message : "Failed to disable 2FA");
    } finally {
      setDisableLoading(false);
    }
  };

  const handleRegenerateCodes = async () => {
    if (!regenCode.trim()) return;
    try {
      setRegenLoading(true);
      setTotpError("");
      const result = await api<{ recoveryCodes: string[] }>("/v1/auth/2fa/regenerate-recovery-codes", user?.id, {
        method: "POST",
        body: JSON.stringify({ code: regenCode.trim() }),
      });
      setRegenCodes(result.recoveryCodes);
      setRegenCode("");
    } catch (e) {
      setTotpError(e instanceof Error ? e.message : "Invalid code");
    } finally {
      setRegenLoading(false);
    }
  };

  const copyRecoveryCodes = async (codes: string[]) => {
    await navigator.clipboard.writeText(codes.join("\n"));
    setRecoveryCodesCopied(true);
    setTimeout(() => setRecoveryCodesCopied(false), 2000);
  };
  // ─────────────────────────────────────────────────────────────────────────

  const handleExportAuditLog = async (format: "csv" | "json") => {
    if (!user?.id) return;
    try {
      setAuditLoading(true);
      const token = typeof window !== "undefined" ? localStorage.getItem(`pd_token_${user.id}`) ?? "" : "";
      const res = await fetch(`/api/v1/auth/audit-log/export?format=${format}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
      toastSuccess("Audit log exported");
    } catch (e) {
      toastError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setAuditLoading(false);
    }
  };

  const handleUpdateNotifPrefs = async (patch: Partial<NotificationPreference>) => {
    if (!user?.id || !notifPrefs) return;
    const optimistic = { ...notifPrefs, ...patch };
    setNotifPrefs(optimistic);
    try {
      setNotifSaving(true);
      const updated = await api<NotificationPreference>("/v1/notification-preferences", user.id, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      setNotifPrefs(updated);
    } catch (e) {
      setNotifPrefs(notifPrefs); // rollback
      toastError(e instanceof Error ? e.message : "Failed to save preferences");
    } finally {
      setNotifSaving(false);
    }
  };

  const handleRevokeSession = async (sessionId: string) => {
    if (!window.confirm("Revoke this session?")) return;
    try {
      await api("/v1/auth/sessions/revoke", user?.id, {
        method: "POST",
        body: JSON.stringify({ sessionId }),
      });
      setSessions(sessions.filter((s) => s.id !== sessionId));
      toastSuccess("Session revoked");
    } catch (e) {
      toastError(e instanceof Error ? e.message : "Failed to revoke session");
    }
  };

  const handleCreateKey = async () => {
    if (!newKeyName.trim()) return;
    try {
      setCreatingKey(true);
      const created = await api<NewApiKey>("/v1/api-keys", user?.id, {
        method: "POST",
        body: JSON.stringify({
          name: newKeyName.trim(),
          ...(newKeyExpiry ? { expiresAt: new Date(newKeyExpiry).toISOString() } : {}),
        }),
      });
      setCreatedKey(created);
      setApiKeys([{ id: created.id, name: created.name, prefix: created.prefix, lastUsedAt: created.lastUsedAt, expiresAt: created.expiresAt, createdAt: created.createdAt }, ...apiKeys]);
    } catch (e) {
      toastError(e instanceof Error ? e.message : "Failed to create API key");
    } finally {
      setCreatingKey(false);
    }
  };

  const handleCopyKey = async () => {
    if (!createdKey) return;
    await navigator.clipboard.writeText(createdKey.key);
    setKeyCopied(true);
    toastInfo("API key copied to clipboard");
    setTimeout(() => setKeyCopied(false), 2000);
  };

  const handleCloseCreateModal = () => {
    setShowCreateKey(false);
    setNewKeyName("");
    setNewKeyExpiry("");
    setCreatedKey(null);
    setKeyCopied(false);
  };

  const handleDeleteKey = async (id: string, name: string) => {
    if (!window.confirm(`Revoke API key "${name}"? This cannot be undone.`)) return;
    try {
      await api(`/v1/api-keys/${id}`, user?.id, { method: "DELETE" });
      setApiKeys(apiKeys.filter((k) => k.id !== id));
      toastSuccess("API key revoked");
    } catch (e) {
      toastError(e instanceof Error ? e.message : "Failed to revoke API key");
    }
  };

  const isKeyExpired = (expiresAt: string | null) => {
    if (!expiresAt) return false;
    return new Date(expiresAt) < new Date();
  };

  if (!user) return null;
  if (loading)
    return (
      <AppFrame title="Account">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-12 w-12 border-2 border-accent border-t-transparent" />
        </div>
      </AppFrame>
    );

  return (
    <AppFrame title="Account" subtitle="Manage your profile and security">
      <div className="space-y-6 max-w-5xl mx-auto">
        {loadError && (
          <FadeIn>
            <div className="flex items-start gap-3 p-4 rounded-xl bg-danger/10 border border-danger/20">
              <AlertCircle className="w-5 h-5 text-danger mt-0.5 shrink-0" />
              <span className="text-danger text-sm">{loadError}</span>
            </div>
          </FadeIn>
        )}

        {/* Two-column layout: profile/security left, keys/sessions/notif right */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-6">

        {/* Profile Section */}
        <FadeIn>
          <Card>
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2.5 rounded-xl bg-accent/10">
                <User className="w-5 h-5 text-accent" />
              </div>
              <h2 className="text-xl font-bold text-text-primary">Profile</h2>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  Display name <span className="text-text-secondary font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className={inputClass}
                  placeholder="Jane Smith"
                  maxLength={64}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClass}
                  placeholder="your@email.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  Timezone
                </label>
                <select
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className={inputClass}
                >
                  {[
                    "UTC", "Europe/Berlin", "Europe/London", "Europe/Paris", "Europe/Vienna",
                    "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
                    "Asia/Tokyo", "Asia/Shanghai", "Asia/Singapore", "Australia/Sydney",
                    "Pacific/Auckland",
                  ].map((tz) => (
                    <option key={tz} value={tz}>{tz.replace("_", " ")}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2 py-1">
                <span className="text-sm text-text-secondary">Role:</span>
                <Badge variant={me?.role === "admin" ? "success" : "default"}>
                  {me?.role || "user"}
                </Badge>
              </div>

              <Button onClick={handleUpdateProfile} size="lg" className="w-full">
                Save Profile
              </Button>
            </div>
          </Card>
        </FadeIn>

        {/* Security Section */}
        <FadeIn delay={0.1}>
          <Card>
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2.5 rounded-xl bg-accent/10">
                <Shield className="w-5 h-5 text-accent" />
              </div>
              <h2 className="text-xl font-bold text-text-primary">Change Password</h2>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  Current Password
                </label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className={inputClass}
                  placeholder="Enter current password"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  New Password
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className={inputClass}
                  placeholder="Enter new password"
                  autoComplete="new-password"
                />
                <PasswordStrength password={newPassword} />
              </div>

              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={inputClass}
                  placeholder="Confirm new password"
                  autoComplete="new-password"
                />
                {confirmPassword && confirmPassword !== newPassword && (
                  <p className="mt-1 text-xs text-danger">Passwords don't match</p>
                )}
              </div>

              <Button
                onClick={handleChangePassword}
                size="lg"
                className="w-full"
                disabled={!passwordMeetsPolicy(newPassword) || newPassword !== confirmPassword}
              >
                Change Password
              </Button>
            </div>
          </Card>
        </FadeIn>

        {/* 2FA Section */}
        <FadeIn delay={0.2}>
          <Card>
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2.5 rounded-xl bg-accent/10">
                <Smartphone className="w-5 h-5 text-accent" />
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-bold text-text-primary">Two-Factor Authentication</h2>
                <p className="text-xs text-text-secondary mt-0.5">Add a second layer of security to your account</p>
              </div>
              {me?.totpEnabled ? (
                <Badge variant="success">Enabled</Badge>
              ) : (
                <Badge variant="default">Disabled</Badge>
              )}
            </div>

            {me?.totpEnabled ? (
              <div className="space-y-3">
                <p className="text-sm text-text-secondary">
                  Your account is protected with a TOTP authenticator app. You&apos;ll be prompted for a code each time you log in.
                </p>
                <div className="flex gap-3">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => { setShowRegenerateRecovery(true); setRegenCodes(null); setRegenCode(""); setTotpError(""); }}
                  >
                    <RefreshCw className="w-4 h-4 mr-1.5" />
                    Recovery Codes
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-danger hover:text-danger"
                    onClick={() => { setShowDisable2FA(true); setDisablePassword(""); setDisableCode(""); setTotpError(""); }}
                  >
                    <X className="w-4 h-4 mr-1.5" />
                    Disable 2FA
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-text-secondary">
                  Two-factor authentication is not enabled. Use an authenticator app like Google Authenticator or Authy to add extra security.
                </p>
                <Button
                  onClick={handle2FASetupStart}
                  disabled={totpLoading}
                  size="sm"
                >
                  {totpLoading ? (
                    <span className="flex items-center gap-2">
                      <span className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                      Loading…
                    </span>
                  ) : (
                    <>
                      <QrCode className="w-4 h-4 mr-1.5" />
                      Enable 2FA
                    </>
                  )}
                </Button>
              </div>
            )}
          </Card>
        </FadeIn>

        </div>{/* end left column */}
        <div className="space-y-6">

        {/* API Keys Section */}
        <FadeIn delay={0.3}>
          <Card>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-accent/10">
                  <Key className="w-5 h-5 text-accent" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-text-primary">API Keys</h2>
                  <p className="text-xs text-text-secondary mt-0.5">For programmatic access via Bearer token</p>
                </div>
              </div>
              <Button
                size="sm"
                onClick={() => setShowCreateKey(true)}
              >
                <Plus className="w-4 h-4 mr-1.5" />
                New Key
              </Button>
            </div>

            {apiKeys.length === 0 ? (
              <div className="text-center py-8">
                <Key className="w-8 h-8 text-text-secondary/40 mx-auto mb-3" />
                <p className="text-text-secondary text-sm">No API keys yet</p>
                <p className="text-text-secondary/60 text-xs mt-1">Create a key to access the API programmatically</p>
              </div>
            ) : (
              <div className="space-y-2">
                {apiKeys.map((key) => (
                  <div
                    key={key.id}
                    className="flex items-center justify-between p-4 rounded-lg bg-surface-elevated/50 border border-border"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-text-primary truncate">{key.name}</p>
                        {isKeyExpired(key.expiresAt) && (
                          <Badge variant="danger">Expired</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1">
                        <code className="text-xs text-text-secondary font-mono">{key.prefix}••••••••</code>
                        {key.lastUsedAt ? (
                          <span className="text-xs text-text-secondary">
                            Last used {new Date(key.lastUsedAt).toLocaleDateString()}
                          </span>
                        ) : (
                          <span className="text-xs text-text-secondary/60">Never used</span>
                        )}
                        {key.expiresAt && !isKeyExpired(key.expiresAt) && (
                          <span className="text-xs text-text-secondary">
                            Expires {new Date(key.expiresAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteKey(key.id, key.name)}
                      className="text-danger hover:text-danger ml-3 shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </FadeIn>

        {/* Sessions Section */}
        <FadeIn delay={0.4}>
          <Card>
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2.5 rounded-xl bg-surface-elevated">
                <LogOut className="w-5 h-5 text-text-secondary" />
              </div>
              <h2 className="text-xl font-bold text-text-primary">Active Sessions</h2>
            </div>

            {sessions.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-text-secondary text-sm">No active sessions found</p>
              </div>
            ) : (
              <div className="space-y-3">
                {sessions.map((session) => (
                  <div
                    key={session.id}
                    className="flex items-center justify-between p-4 rounded-lg bg-surface-elevated/50 border border-border"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-text-primary truncate">
                        {session.userAgent || "Unknown device"}
                      </p>
                      <p className="text-xs text-text-secondary mt-1">
                        {session.ipAddress && `IP: ${session.ipAddress} · `}
                        {new Date(session.createdAt).toLocaleString()}
                      </p>
                      {session.revokedAt && (
                        <Badge variant="danger">Revoked</Badge>
                      )}
                    </div>
                    {!session.revokedAt && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRevokeSession(session.id)}
                        className="text-danger hover:text-danger ml-3 shrink-0"
                      >
                        <LogOut className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </FadeIn>

        {/* Notification Preferences Section */}
        <FadeIn delay={0.5}>
          <Card>
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2.5 rounded-xl bg-surface-elevated">
                <Bell className="w-5 h-5 text-text-secondary" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-text-primary">Notification Preferences</h2>
                <p className="text-sm text-text-secondary mt-0.5">Control when and how you receive alert notifications</p>
              </div>
              {notifSaving && (
                <span className="ml-auto flex items-center gap-1.5 text-xs text-text-secondary">
                  <span className="animate-spin rounded-full h-3 w-3 border-2 border-accent border-t-transparent" />
                  Saving…
                </span>
              )}
            </div>

            {!notifPrefs ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-12 rounded-lg bg-surface-elevated/50 animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="space-y-6">
                {/* Alert event toggles */}
                <div>
                  <p className="text-sm font-medium text-text-secondary mb-3 uppercase tracking-wide">Alert Events</p>
                  <div className="space-y-3">
                    {[
                      { key: "notifyOnDown" as const, label: "Monitor goes down", desc: "Trigger alerts when a monitor reports a failure" },
                      { key: "notifyOnRecovery" as const, label: "Monitor recovers", desc: "Trigger alerts when a monitor comes back up" },
                      { key: "notifyOnDegraded" as const, label: "Monitor degraded", desc: "Trigger alerts for slow / warning-level checks" },
                    ].map(({ key, label, desc }) => (
                      <div key={key} className="flex items-center justify-between px-4 py-3 rounded-lg bg-surface-elevated/50 border border-border">
                        <div>
                          <p className="text-sm font-medium text-text-primary">{label}</p>
                          <p className="text-xs text-text-secondary mt-0.5">{desc}</p>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={notifPrefs[key]}
                          onClick={() => handleUpdateNotifPrefs({ [key]: !notifPrefs[key] })}
                          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                            notifPrefs[key] ? "bg-accent" : "bg-surface-elevated border border-border"
                          }`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-md transform transition-transform ${
                              notifPrefs[key] ? "translate-x-5" : "translate-x-0"
                            }`}
                          />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Frequency */}
                <div>
                  <p className="text-sm font-medium text-text-secondary mb-3 uppercase tracking-wide">Delivery Frequency</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {[
                      { value: "instant", label: "Instant", desc: "Send immediately when triggered" },
                      { value: "hourly_digest", label: "Hourly Digest", desc: "Batch into hourly summaries" },
                      { value: "daily_digest", label: "Daily Digest", desc: "One summary email per day" },
                    ].map(({ value, label, desc }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => handleUpdateNotifPrefs({ frequency: value })}
                        className={`flex flex-col items-start gap-1 px-4 py-3 rounded-lg border text-left transition-colors ${
                          notifPrefs.frequency === value
                            ? "border-accent bg-accent/10 text-accent"
                            : "border-border bg-surface-elevated/50 text-text-secondary hover:border-accent/50"
                        }`}
                      >
                        <span className="font-medium text-sm">{label}</span>
                        <span className="text-xs opacity-70">{desc}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Quiet Hours */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-text-secondary" />
                      <p className="text-sm font-medium text-text-secondary uppercase tracking-wide">Quiet Hours</p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={notifPrefs.quietHoursEnabled}
                      onClick={() => handleUpdateNotifPrefs({ quietHoursEnabled: !notifPrefs.quietHoursEnabled })}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                        notifPrefs.quietHoursEnabled ? "bg-accent" : "bg-surface-elevated border border-border"
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-md transform transition-transform ${
                          notifPrefs.quietHoursEnabled ? "translate-x-5" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>
                  {notifPrefs.quietHoursEnabled && (
                    <div className="flex items-center gap-4 px-4 py-3 rounded-lg bg-surface-elevated/50 border border-border">
                      <div className="flex-1">
                        <label className="block text-xs font-medium text-text-secondary mb-1">Start (UTC hour)</label>
                        <select
                          value={notifPrefs.quietHoursStart}
                          onChange={(e) => handleUpdateNotifPrefs({ quietHoursStart: Number(e.target.value) })}
                          className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
                        >
                          {Array.from({ length: 24 }, (_, i) => (
                            <option key={i} value={i}>{String(i).padStart(2, "0")}:00</option>
                          ))}
                        </select>
                      </div>
                      <span className="text-text-secondary text-sm pt-4">to</span>
                      <div className="flex-1">
                        <label className="block text-xs font-medium text-text-secondary mb-1">End (UTC hour)</label>
                        <select
                          value={notifPrefs.quietHoursEnd}
                          onChange={(e) => handleUpdateNotifPrefs({ quietHoursEnd: Number(e.target.value) })}
                          className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
                        >
                          {Array.from({ length: 24 }, (_, i) => (
                            <option key={i} value={i}>{String(i).padStart(2, "0")}:00</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}
                  {notifPrefs.quietHoursEnabled && (
                    <p className="text-xs text-text-secondary mt-2">
                      Notifications will be suppressed between{" "}
                      <strong className="text-text-primary">
                        {String(notifPrefs.quietHoursStart).padStart(2, "0")}:00
                      </strong>{" "}
                      and{" "}
                      <strong className="text-text-primary">
                        {String(notifPrefs.quietHoursEnd).padStart(2, "0")}:00 UTC
                      </strong>
                    </p>
                  )}
                </div>
              </div>
            )}
          </Card>
        </FadeIn>

        {/* Activity Log Section */}
        <FadeIn delay={0.6}>
          <Card>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-surface-elevated">
                  <Activity className="w-5 h-5 text-text-secondary" />
                </div>
                <h2 className="text-xl font-bold text-text-primary">Activity Log</h2>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleExportAuditLog("csv")}
                  disabled={auditLoading}
                  className="flex items-center gap-1.5 text-text-secondary hover:text-text-primary"
                >
                  <Download className="w-4 h-4" />
                  CSV
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleExportAuditLog("json")}
                  disabled={auditLoading}
                  className="flex items-center gap-1.5 text-text-secondary hover:text-text-primary"
                >
                  <Download className="w-4 h-4" />
                  JSON
                </Button>
              </div>
            </div>

            {auditLog.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-text-secondary text-sm">No activity recorded yet</p>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  {(auditExpanded ? auditLog : auditLog.slice(0, 10)).map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-start justify-between px-4 py-3 rounded-lg bg-surface-elevated/50 border border-border"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-text-primary font-mono">{entry.action}</p>
                        <p className="text-xs text-text-secondary mt-0.5">
                          {new Date(entry.createdAt).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
                {auditLog.length > 10 && (
                  <button
                    onClick={() => setAuditExpanded((v) => !v)}
                    className="mt-4 text-sm text-accent hover:text-accent-hover transition-colors"
                  >
                    {auditExpanded ? "Show less" : `Show all ${auditLog.length} entries`}
                  </button>
                )}
              </>
            )}
          </Card>
        </FadeIn>

        </div>{/* end right column */}
        </div>{/* end grid */}
      </div>

      {/* Create API Key Modal */}
      <Modal
        isOpen={showCreateKey}
        onClose={handleCloseCreateModal}
        title={createdKey ? "API Key Created" : "Create API Key"}
      >
        {createdKey ? (
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 rounded-xl bg-warning/10 border border-warning/20">
              <AlertCircle className="w-5 h-5 text-warning mt-0.5 shrink-0" />
              <p className="text-warning text-sm">
                <strong>Copy this key now.</strong> You won&apos;t be able to see it again.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">Your API Key</label>
              <div className="flex items-center gap-2">
                <code className="flex-1 px-4 py-3 bg-surface border border-border rounded-lg text-sm font-mono text-text-primary break-all">
                  {createdKey.key}
                </code>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleCopyKey}
                  className="shrink-0"
                >
                  {keyCopied ? (
                    <CheckCircle2 className="w-4 h-4 text-success" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>

            <div className="text-sm text-text-secondary space-y-1">
              <p>Use as a <code className="text-xs font-mono bg-surface-elevated px-1.5 py-0.5 rounded">Bearer</code> token:</p>
              <code className="block text-xs font-mono bg-surface-elevated px-3 py-2 rounded-lg text-text-primary">
                Authorization: Bearer {createdKey.key.slice(0, 20)}…
              </code>
            </div>

            <Button onClick={handleCloseCreateModal} className="w-full">
              Done
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Key Name</label>
              <input
                type="text"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                className={inputClass}
                placeholder="e.g. CI/CD Pipeline, Home Server"
                maxLength={64}
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">
                Expiry Date <span className="text-text-secondary/50">(optional)</span>
              </label>
              <input
                type="date"
                value={newKeyExpiry}
                onChange={(e) => setNewKeyExpiry(e.target.value)}
                className={inputClass}
                min={new Date().toISOString().split("T")[0]}
              />
              <p className="text-xs text-text-secondary/60 mt-1">Leave blank for no expiry</p>
            </div>

            <div className="flex gap-3 pt-2">
              <Button variant="secondary" onClick={handleCloseCreateModal} className="flex-1">
                Cancel
              </Button>
              <Button
                onClick={handleCreateKey}
                disabled={!newKeyName.trim() || creatingKey}
                className="flex-1"
              >
                {creatingKey ? (
                  <span className="flex items-center gap-2">
                    <span className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                    Creating…
                  </span>
                ) : (
                  "Create Key"
                )}
              </Button>
            </div>
          </div>
        )}
      </Modal>
      {/* 2FA Setup Modal */}
      <Modal
        isOpen={show2FASetup}
        onClose={handleClose2FASetup}
        title={totpRecoveryCodes ? "Save Your Recovery Codes" : "Enable Two-Factor Authentication"}
      >
        {totpRecoveryCodes ? (
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 rounded-xl bg-warning/10 border border-warning/20">
              <AlertCircle className="w-5 h-5 text-warning mt-0.5 shrink-0" />
              <p className="text-warning text-sm">
                <strong>Save these codes now.</strong> They can each be used once to access your account if you lose your authenticator. You won&apos;t see them again.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {totpRecoveryCodes.map((code) => (
                <code key={code} className="px-3 py-2 bg-surface-elevated border border-border rounded-lg text-sm font-mono text-text-primary text-center tracking-wider">
                  {code}
                </code>
              ))}
            </div>
            <Button
              variant="secondary"
              onClick={() => copyRecoveryCodes(totpRecoveryCodes)}
              className="w-full"
            >
              {recoveryCodesCopied ? (
                <span className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-success" /> Copied!</span>
              ) : (
                <span className="flex items-center gap-2"><Copy className="w-4 h-4" /> Copy All Codes</span>
              )}
            </Button>
            <Button onClick={handleClose2FASetup} className="w-full">
              Done — I&apos;ve saved my codes
            </Button>
          </div>
        ) : totpSetupData ? (
          <div className="space-y-5">
            {totpError && (
              <div className="flex items-start gap-3 p-3 rounded-xl bg-danger/10 border border-danger/20">
                <AlertCircle className="w-4 h-4 text-danger mt-0.5 shrink-0" />
                <span className="text-danger text-sm">{totpError}</span>
              </div>
            )}
            <div className="text-center">
              <p className="text-sm text-text-secondary mb-3">Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={totpSetupData.qrCodeUrl} alt="TOTP QR Code" className="mx-auto rounded-lg border border-border" width={200} height={200} />
            </div>
            <div>
              <p className="text-xs text-text-secondary mb-2">Or enter this secret manually:</p>
              <code className="block px-3 py-2 bg-surface-elevated border border-border rounded-lg text-sm font-mono text-text-primary break-all tracking-wider text-center">
                {totpSetupData.secret}
              </code>
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">
                Enter the 6-digit code from your app to verify
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={totpVerifyCode}
                onChange={(e) => setTotpVerifyCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className={inputClass}
                placeholder="000000"
                maxLength={6}
                autoFocus
              />
            </div>
            <div className="flex gap-3">
              <Button variant="secondary" onClick={handleClose2FASetup} className="flex-1">Cancel</Button>
              <Button
                onClick={handle2FAEnable}
                disabled={totpVerifyCode.length !== 6 || totpLoading}
                className="flex-1"
              >
                {totpLoading ? (
                  <span className="flex items-center gap-2">
                    <span className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                    Verifying…
                  </span>
                ) : "Enable 2FA"}
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>

      {/* Disable 2FA Modal */}
      <Modal
        isOpen={showDisable2FA}
        onClose={() => setShowDisable2FA(false)}
        title="Disable Two-Factor Authentication"
      >
        <div className="space-y-4">
          {totpError && (
            <div className="flex items-start gap-3 p-3 rounded-xl bg-danger/10 border border-danger/20">
              <AlertCircle className="w-4 h-4 text-danger mt-0.5 shrink-0" />
              <span className="text-danger text-sm">{totpError}</span>
            </div>
          )}
          <div className="flex items-start gap-3 p-4 rounded-xl bg-warning/10 border border-warning/20">
            <AlertCircle className="w-5 h-5 text-warning mt-0.5 shrink-0" />
            <p className="text-warning text-sm">This will remove 2FA protection from your account. Confirm with your current password and authenticator code.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">Current Password</label>
            <input
              type="password"
              value={disablePassword}
              onChange={(e) => setDisablePassword(e.target.value)}
              className={inputClass}
              placeholder="Enter your password"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">Authenticator Code</label>
            <input
              type="text"
              inputMode="numeric"
              value={disableCode}
              onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className={inputClass}
              placeholder="000000"
              maxLength={6}
            />
          </div>
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setShowDisable2FA(false)} className="flex-1">Cancel</Button>
            <Button
              variant="ghost"
              onClick={handle2FADisable}
              disabled={!disablePassword || disableCode.length !== 6 || disableLoading}
              className="flex-1 text-danger border-danger/30 hover:bg-danger/10"
            >
              {disableLoading ? (
                <span className="flex items-center gap-2">
                  <span className="animate-spin rounded-full h-4 w-4 border-2 border-danger border-t-transparent" />
                  Disabling…
                </span>
              ) : "Disable 2FA"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Regenerate Recovery Codes Modal */}
      <Modal
        isOpen={showRegenerateRecovery}
        onClose={() => { setShowRegenerateRecovery(false); setRegenCodes(null); setRegenCode(""); setTotpError(""); setRecoveryCodesCopied(false); }}
        title="Recovery Codes"
      >
        {regenCodes ? (
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 rounded-xl bg-warning/10 border border-warning/20">
              <AlertCircle className="w-5 h-5 text-warning mt-0.5 shrink-0" />
              <p className="text-warning text-sm">
                <strong>New codes generated.</strong> Your old recovery codes are now invalid. Save these now.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {regenCodes.map((code) => (
                <code key={code} className="px-3 py-2 bg-surface-elevated border border-border rounded-lg text-sm font-mono text-text-primary text-center tracking-wider">
                  {code}
                </code>
              ))}
            </div>
            <Button variant="secondary" onClick={() => copyRecoveryCodes(regenCodes)} className="w-full">
              {recoveryCodesCopied ? (
                <span className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-success" /> Copied!</span>
              ) : (
                <span className="flex items-center gap-2"><Copy className="w-4 h-4" /> Copy All</span>
              )}
            </Button>
            <Button onClick={() => { setShowRegenerateRecovery(false); setRegenCodes(null); setRecoveryCodesCopied(false); }} className="w-full">
              Done
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {totpError && (
              <div className="flex items-start gap-3 p-3 rounded-xl bg-danger/10 border border-danger/20">
                <AlertCircle className="w-4 h-4 text-danger mt-0.5 shrink-0" />
                <span className="text-danger text-sm">{totpError}</span>
              </div>
            )}
            <p className="text-sm text-text-secondary">Enter your current authenticator code to generate new recovery codes. This will invalidate your existing codes.</p>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Authenticator Code</label>
              <input
                type="text"
                inputMode="numeric"
                value={regenCode}
                onChange={(e) => setRegenCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className={inputClass}
                placeholder="000000"
                maxLength={6}
                autoFocus
              />
            </div>
            <div className="flex gap-3">
              <Button variant="secondary" onClick={() => setShowRegenerateRecovery(false)} className="flex-1">Cancel</Button>
              <Button
                onClick={handleRegenerateCodes}
                disabled={regenCode.length !== 6 || regenLoading}
                className="flex-1"
              >
                {regenLoading ? (
                  <span className="flex items-center gap-2">
                    <span className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                    Generating…
                  </span>
                ) : "Generate New Codes"}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </AppFrame>
  );
}

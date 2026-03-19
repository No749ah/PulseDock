"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, AlertCircle, Bell, Calendar, CheckCircle2, Clock, Copy, Database, Download, Info, Key, LogOut, Plus, QrCode, RefreshCw, Save, Server, Shield, Smartphone, Trash2, User, X } from "lucide-react";
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

type ApiKeyScope = "READ" | "WRITE" | "ADMIN";

const API_KEY_SCOPE_LABELS: Record<ApiKeyScope, string> = {
  READ: "Read-only",
  WRITE: "Read + Write",
  ADMIN: "Full Access",
};

const API_KEY_SCOPE_COLORS: Record<ApiKeyScope, string> = {
  READ: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  WRITE: "bg-accent/15 text-accent border-accent/20",
  ADMIN: "bg-danger/15 text-danger border-danger/20",
};

interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  scope: ApiKeyScope;
  usageCount: number;
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

interface ScheduledReport {
  id: string;
  enabled: boolean;
  frequency: string;
  dayOfWeek: number;
  hourUtc: number;
  lastSentAt: string | null;
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
  const [sessionsExpanded, setSessionsExpanded] = useState(false);

  // Notification preferences state
  const [notifPrefs, setNotifPrefs] = useState<NotificationPreference | null>(null);
  const [notifSaving, setNotifSaving] = useState(false);
  const [scheduledReport, setScheduledReport] = useState<ScheduledReport | null>(null);
  const [reportLoaded, setReportLoaded] = useState(false);
  const [reportSaving, setReportSaving] = useState(false);
  const [reportForm, setReportForm] = useState<{ enabled: boolean; frequency: string; dayOfWeek: number; hourUtc: number }>({
    enabled: true, frequency: "weekly", dayOfWeek: 1, hourUtc: 8,
  });

  // API key revoke confirm state (key id → "confirm" or undefined)
  const [revokeConfirm, setRevokeConfirm] = useState<string | null>(null);
  // Per-key prefix copy state
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);

  // API key creation state
  const [showCreateKey, setShowCreateKey] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyExpiry, setNewKeyExpiry] = useState("");
  const [newKeyScope, setNewKeyScope] = useState<ApiKeyScope>("WRITE");
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
        api<ScheduledReport | null>("/v1/reports", userId).then((r) => {
          setScheduledReport(r);
          if (r) setReportForm({ enabled: r.enabled, frequency: r.frequency, dayOfWeek: r.dayOfWeek, hourUtc: r.hourUtc });
          setReportLoaded(true);
        }).catch(() => { setReportLoaded(true); });
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

  const handleSaveReport = async () => {
    if (!user?.id) return;
    try {
      setReportSaving(true);
      const updated = await api<ScheduledReport>("/v1/reports", user.id, {
        method: "PUT",
        body: JSON.stringify(reportForm),
      });
      setScheduledReport(updated);
      toastSuccess("Report settings saved");
    } catch (e) {
      toastError(e instanceof Error ? e.message : "Failed to save report settings");
    } finally {
      setReportSaving(false);
    }
  };

  const handleSendInvite = async () => {
    if (!inviteEmail.trim()) return;
    setInviteSending(true);
    // UI stub — backend will be wired later
    await new Promise((r) => setTimeout(r, 600));
    toastSuccess(`Invitation sent to ${inviteEmail.trim()}`);
    setInviteEmail("");
    setInviteRole("Viewer");
    setShowInviteModal(false);
    setInviteSending(false);
  };

  const handleRemoveMember = (_id: string) => {
    toastInfo("Feature coming soon");
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
          scope: newKeyScope,
          ...(newKeyExpiry ? { expiresAt: new Date(newKeyExpiry).toISOString() } : {}),
        }),
      });
      setCreatedKey(created);
      setApiKeys([{ id: created.id, name: created.name, prefix: created.prefix, scope: created.scope, usageCount: 0, lastUsedAt: created.lastUsedAt, expiresAt: created.expiresAt, createdAt: created.createdAt }, ...apiKeys]);
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
    setNewKeyScope("WRITE");
    setCreatedKey(null);
    setKeyCopied(false);
  };

  const handleDeleteKey = async (id: string) => {
    try {
      await api(`/v1/api-keys/${id}`, user?.id, { method: "DELETE" });
      setApiKeys(apiKeys.filter((k) => k.id !== id));
      setRevokeConfirm(null);
      toastSuccess("API key revoked");
    } catch (e) {
      toastError(e instanceof Error ? e.message : "Failed to revoke API key");
    }
  };

  const handleCopyPrefix = async (keyId: string, prefix: string) => {
    await navigator.clipboard.writeText(prefix);
    setCopiedKeyId(keyId);
    setTimeout(() => setCopiedKeyId(null), 2000);
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

        {/* Two-column layout: profile/security/activity left, keys/sessions/notif right */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
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

        {/* Activity Log Section — left column */}
        <FadeIn delay={0.3}>
          <Card>
            <div className="flex items-center justify-between mb-4">
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
                  {(auditExpanded ? auditLog : auditLog.slice(0, 8)).map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-start justify-between px-3 py-2.5 rounded-lg bg-surface-elevated/50 border border-border"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-text-primary font-mono">{entry.action}</p>
                        <p className="text-[11px] text-text-secondary mt-0.5">
                          {new Date(entry.createdAt).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
                {auditLog.length > 8 && (
                  <button
                    onClick={() => setAuditExpanded((v) => !v)}
                    className="mt-3 text-xs text-accent hover:text-accent/80 transition-colors"
                  >
                    {auditExpanded ? "Show less" : `Show all ${auditLog.length} entries`}
                  </button>
                )}
              </>
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
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-text-primary truncate">{key.name}</p>
                        <span className={`inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded border ${API_KEY_SCOPE_COLORS[key.scope ?? "WRITE"]}`}>
                          {API_KEY_SCOPE_LABELS[key.scope ?? "WRITE"]}
                        </span>
                        {isKeyExpired(key.expiresAt) && (
                          <Badge variant="danger">Expired</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 flex-wrap">
                        <button
                          onClick={() => handleCopyPrefix(key.id, key.prefix)}
                          className="flex items-center gap-1 text-xs text-text-secondary font-mono hover:text-accent transition-colors group"
                          title="Copy key prefix"
                        >
                          <code>{key.prefix}••••••••</code>
                          <Copy className={`w-3 h-3 ml-0.5 opacity-0 group-hover:opacity-100 transition-opacity ${copiedKeyId === key.id ? "text-success opacity-100" : ""}`} />
                          {copiedKeyId === key.id && <span className="text-success text-[10px] ml-0.5">Copied!</span>}
                        </button>
                        <span className="text-xs text-text-secondary">
                          {key.usageCount > 0 ? `${key.usageCount.toLocaleString()} uses` : "Never used"}
                        </span>
                        {key.lastUsedAt && (
                          <span className="text-xs text-text-secondary">
                            Last used {new Date(key.lastUsedAt).toLocaleDateString()}
                          </span>
                        )}
                        {key.expiresAt && !isKeyExpired(key.expiresAt) && (
                          <span className="text-xs text-text-secondary">
                            Expires {new Date(key.expiresAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-3 shrink-0">
                      {revokeConfirm === key.id ? (
                        <>
                          <button
                            onClick={() => handleDeleteKey(key.id)}
                            className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-danger text-white hover:bg-danger/90 transition-colors"
                          >
                            Confirm revoke
                          </button>
                          <button
                            onClick={() => setRevokeConfirm(null)}
                            className="px-2.5 py-1 rounded-lg text-xs text-text-secondary border border-border hover:text-text-primary transition-colors"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setRevokeConfirm(key.id)}
                          className="text-danger hover:text-danger"
                          title="Revoke API key"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </FadeIn>

        {/* Sessions Section */}
        <FadeIn delay={0.4}>
          <Card>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-surface-elevated">
                  <LogOut className="w-5 h-5 text-text-secondary" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-text-primary">Active Sessions</h2>
                  {sessions.filter((s) => !s.revokedAt).length > 0 && (
                    <p className="text-xs text-text-secondary mt-0.5">{sessions.filter((s) => !s.revokedAt).length} active</p>
                  )}
                </div>
              </div>
              {sessions.filter((s) => !s.revokedAt).length > 1 && (
                <button
                  onClick={async () => {
                    const others = sessions.filter((s) => !s.revokedAt).slice(1);
                    for (const s of others) await handleRevokeSession(s.id);
                  }}
                  className="text-xs text-danger hover:text-danger/80 transition-colors"
                >
                  Revoke others
                </button>
              )}
            </div>

            {sessions.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-text-secondary text-sm">No active sessions found</p>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  {(sessionsExpanded ? sessions : sessions.slice(0, 5)).map((session, i) => (
                    <div
                      key={session.id}
                      className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-surface-elevated/50 border border-border"
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${!session.revokedAt ? 'bg-success' : 'bg-danger'}`} />
                        <div className="min-w-0">
                          <p className="text-xs text-text-primary truncate">
                            {i === 0 ? <span className="text-accent font-medium">Current — </span> : ''}
                            {session.userAgent ? session.userAgent.replace(/\s*\(.*?\)/g, '').trim() || 'Unknown device' : 'Unknown device'}
                          </p>
                          <p className="text-[11px] text-text-secondary mt-0.5">
                            {session.ipAddress ? `${session.ipAddress} · ` : ''}
                            {new Date(session.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      {!session.revokedAt && i !== 0 && (
                        <button
                          onClick={() => handleRevokeSession(session.id)}
                          className="ml-2 p-1.5 rounded-lg text-text-secondary hover:text-danger hover:bg-danger/10 transition-colors shrink-0"
                          title="Revoke session"
                        >
                          <LogOut className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {sessions.length > 5 && (
                  <button
                    onClick={() => setSessionsExpanded((v) => !v)}
                    className="mt-3 text-xs text-accent hover:text-accent/80 transition-colors"
                  >
                    {sessionsExpanded ? 'Show less' : `Show all ${sessions.length} sessions`}
                  </button>
                )}
              </>
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

        {/* Scheduled Reports Section */}
        <FadeIn delay={0.55}>
          <Card>
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2.5 rounded-xl bg-surface-elevated">
                <Calendar className="w-5 h-5 text-text-secondary" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-text-primary">Scheduled Reports</h2>
                <p className="text-sm text-text-secondary mt-0.5">Receive automatic uptime digests via email</p>
              </div>
              {reportSaving && (
                <span className="ml-auto flex items-center gap-1.5 text-xs text-text-secondary">
                  <span className="animate-spin rounded-full h-3 w-3 border-2 border-accent border-t-transparent" />
                  Saving…
                </span>
              )}
            </div>

            {!reportLoaded ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-12 rounded-lg bg-surface-elevated/50 animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="space-y-5">
                {/* Enable toggle */}
                <div className="flex items-center justify-between px-4 py-3 rounded-lg bg-surface-elevated/50 border border-border">
                  <div>
                    <p className="text-sm font-medium text-text-primary">Enable scheduled reports</p>
                    <p className="text-xs text-text-secondary mt-0.5">Send regular uptime digests to your email</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={reportForm.enabled}
                    onClick={() => setReportForm((f) => ({ ...f, enabled: !f.enabled }))}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                      reportForm.enabled ? "bg-accent" : "bg-surface-elevated border border-border"
                    }`}
                  >
                    <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-md transform transition-transform ${reportForm.enabled ? "translate-x-5" : "translate-x-0"}`} />
                  </button>
                </div>

                {reportForm.enabled && (
                  <>
                    {/* Frequency */}
                    <div>
                      <p className="text-sm font-medium text-text-secondary mb-3 uppercase tracking-wide">Frequency</p>
                      <div className="grid grid-cols-2 gap-3">
                        {[
                          { value: "daily", label: "Daily", desc: "One email per day" },
                          { value: "weekly", label: "Weekly", desc: "One email per week" },
                        ].map(({ value, label, desc }) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() => setReportForm((f) => ({ ...f, frequency: value }))}
                            className={`flex flex-col items-start gap-1 px-4 py-3 rounded-lg border text-left transition-colors ${
                              reportForm.frequency === value
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

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Day of week (weekly only) */}
                      {reportForm.frequency === "weekly" && (
                        <div>
                          <label className="block text-xs font-medium text-text-secondary mb-1.5 uppercase tracking-wide">Day of Week</label>
                          <select
                            value={reportForm.dayOfWeek}
                            onChange={(e) => setReportForm((f) => ({ ...f, dayOfWeek: Number(e.target.value) }))}
                            className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
                          >
                            {["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((day, i) => (
                              <option key={i} value={i}>{day}</option>
                            ))}
                          </select>
                        </div>
                      )}

                      {/* Time (UTC) */}
                      <div>
                        <label className="block text-xs font-medium text-text-secondary mb-1.5 uppercase tracking-wide">Send Time (UTC)</label>
                        <select
                          value={reportForm.hourUtc}
                          onChange={(e) => setReportForm((f) => ({ ...f, hourUtc: Number(e.target.value) }))}
                          className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
                        >
                          {Array.from({ length: 24 }, (_, i) => (
                            <option key={i} value={i}>{String(i).padStart(2, "0")}:00 UTC</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </>
                )}

                {/* Last sent info */}
                {scheduledReport?.lastSentAt && (
                  <p className="text-xs text-text-secondary">
                    Last report sent:{" "}
                    <span className="text-text-primary">{new Date(scheduledReport.lastSentAt).toLocaleString()}</span>
                  </p>
                )}
                {scheduledReport && !scheduledReport.lastSentAt && (
                  <p className="text-xs text-text-secondary">No reports sent yet — first report will arrive at the next scheduled time.</p>
                )}

                <div className="flex justify-end pt-2">
                  <Button onClick={handleSaveReport} disabled={reportSaving}>
                    {reportSaving ? "Saving…" : "Save Report Settings"}
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </FadeIn>

        {/* Team Members Section */}
        <FadeIn delay={0.58}>
          <Card>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-accent/10">
                  <Users className="w-5 h-5 text-accent" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-text-primary">Team Members</h2>
                  <p className="text-xs text-text-secondary mt-0.5">Manage who has access to your workspace</p>
                </div>
              </div>
              <Button size="sm" onClick={() => setShowInviteModal(true)}>
                <UserPlus className="w-4 h-4 mr-1.5" />
                Invite Member
              </Button>
            </div>

            {teamMembers.length === 0 ? (
              <div className="text-center py-8">
                <Users className="w-8 h-8 text-text-secondary/40 mx-auto mb-3" />
                <p className="text-text-secondary text-sm">No team members yet</p>
                <p className="text-text-secondary/60 text-xs mt-1">Invite colleagues to collaborate on your workspace</p>
              </div>
            ) : (
              <div className="space-y-2">
                {teamMembers.map((member) => {
                  const roleColors: Record<TeamRole, string> = {
                    Admin: "bg-danger/15 text-danger border-danger/20",
                    Editor: "bg-accent/15 text-accent border-accent/20",
                    Viewer: "bg-blue-500/15 text-blue-400 border-blue-500/20",
                  };
                  return (
                    <div key={member.id} className="flex items-center gap-3 p-3 rounded-lg bg-surface-elevated/50 border border-border">
                      <div className="w-9 h-9 rounded-full bg-accent/20 flex items-center justify-center shrink-0">
                        <span className="text-sm font-semibold text-accent">{member.avatarInitials}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-text-primary truncate">{member.name}</p>
                        <p className="text-xs text-text-secondary truncate">{member.email}</p>
                      </div>
                      <span className={`inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded border ${roleColors[member.role]}`}>
                        {member.role}
                      </span>
                      <Button variant="ghost" size="sm" onClick={() => handleRemoveMember(member.id)} className="text-danger hover:text-danger shrink-0">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}

            <p className="mt-4 text-xs text-text-secondary/60 border-t border-border pt-4">
              Team collaboration features are in beta. Full role-based access coming soon.
            </p>
          </Card>
        </FadeIn>

        {/* System Info Card */}
        <FadeIn delay={0.6}>
          <SystemInfoCard userId={user?.id} />
        </FadeIn>

        {/* Data Retention Card */}
        <FadeIn delay={0.65}>
          <DataRetentionCard onSave={() => toastSuccess("Data retention settings saved")} />
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
              <label className="block text-sm font-medium text-text-secondary mb-2">Permission Scope</label>
              <div className="grid grid-cols-3 gap-2">
                {(["READ", "WRITE", "ADMIN"] as ApiKeyScope[]).map((scope) => (
                  <button
                    key={scope}
                    type="button"
                    onClick={() => setNewKeyScope(scope)}
                    className={`p-3 rounded-lg border text-left transition-colors ${
                      newKeyScope === scope
                        ? `${API_KEY_SCOPE_COLORS[scope]} border-current`
                        : "border-border bg-surface-elevated/30 hover:bg-surface-elevated/60"
                    }`}
                  >
                    <div className="text-xs font-semibold">{API_KEY_SCOPE_LABELS[scope]}</div>
                    <div className="text-[10px] text-text-secondary mt-0.5 leading-tight">
                      {scope === "READ" ? "List & read only" : scope === "WRITE" ? "Create & manage" : "Full admin access"}
                    </div>
                  </button>
                ))}
              </div>
              <p className="text-xs text-text-secondary/60 mt-1.5">
                {newKeyScope === "READ" && "Can list monitors, runs, and status pages. Cannot create or modify."}
                {newKeyScope === "WRITE" && "Can create, update, and delete monitors, alerts, and status pages."}
                {newKeyScope === "ADMIN" && "Full access including user management and system settings. Use with caution."}
              </p>
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

      {/* Invite Team Member Modal */}
      <Modal
        isOpen={showInviteModal}
        onClose={() => { setShowInviteModal(false); setInviteEmail(""); setInviteRole("Viewer"); }}
        title="Invite Team Member"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">Email Address</label>
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              className={inputClass}
              placeholder="colleague@company.com"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">Role</label>
            <div className="grid grid-cols-3 gap-2">
              {(["Admin", "Editor", "Viewer"] as TeamRole[]).map((role) => {
                const desc = role === "Admin" ? "Full access" : role === "Editor" ? "Create & edit" : "Read-only";
                const active = inviteRole === role;
                const colors = role === "Admin" ? "border-danger bg-danger/10 text-danger" : role === "Editor" ? "border-accent bg-accent/10 text-accent" : "border-blue-500 bg-blue-500/10 text-blue-400";
                return (
                  <button
                    key={role}
                    type="button"
                    onClick={() => setInviteRole(role)}
                    className={`flex flex-col items-start gap-1 px-3 py-2.5 rounded-lg border text-left transition-colors ${active ? colors : "border-border bg-surface-elevated/30 text-text-secondary hover:border-accent/50"}`}
                  >
                    <span className="font-medium text-sm">{role}</span>
                    <span className="text-[10px] opacity-70">{desc}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <Button variant="secondary" onClick={() => setShowInviteModal(false)} className="flex-1">Cancel</Button>
            <Button onClick={handleSendInvite} disabled={!inviteEmail.trim() || inviteSending} className="flex-1">
              {inviteSending ? (
                <span className="flex items-center gap-2">
                  <span className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                  Sending…
                </span>
              ) : (
                <>
                  <UserPlus className="w-4 h-4 mr-1.5" />
                  Send Invite
                </>
              )}
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

// ─────────────────────────────────────────────────────────────────────────────
// System Info Card
// ─────────────────────────────────────────────────────────────────────────────

interface SystemInfo {
  version: string;
  nodeVersion: string;
  uptime: number;
  database: string;
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  parts.push(`${m}m`);
  return parts.join(" ");
}

function SystemInfoCard({ userId }: { userId?: string }) {
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api<SystemInfo>("/v2/system/info", userId)
      .then(setInfo)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load system info"))
      .finally(() => setLoading(false));
  }, [userId]);

  const rows: Array<{ label: string; value: string }> = info
    ? [
        { label: "PulseDock Version", value: info.version },
        { label: "Node.js Version", value: info.nodeVersion },
        { label: "Uptime", value: formatUptime(Math.round(info.uptime)) },
        { label: "Database", value: info.database },
      ]
    : [];

  return (
    <Card>
      <div className="flex items-center gap-3 mb-5">
        <div className="p-2.5 rounded-xl bg-surface-elevated">
          <Server className="w-5 h-5 text-text-secondary" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-text-primary">System Info</h2>
          <p className="text-sm text-text-secondary mt-0.5">Runtime environment details</p>
        </div>
      </div>

      {loading && (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-9 rounded-lg bg-surface-elevated/50 animate-pulse" />
          ))}
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-danger/10 border border-danger/20">
          <AlertCircle className="w-4 h-4 text-danger mt-0.5 shrink-0" />
          <span className="text-danger text-sm">{error}</span>
        </div>
      )}

      {!loading && !error && info && (
        <dl className="divide-y divide-border">
          {rows.map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between py-2.5 px-1">
              <dt className="text-sm text-text-secondary">{label}</dt>
              <dd className="text-sm font-mono text-text-primary bg-surface-elevated px-2.5 py-1 rounded-md">{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Data Retention Card
// ─────────────────────────────────────────────────────────────────────────────

const RETENTION_OPTIONS = [
  { value: 7, label: "7 days" },
  { value: 30, label: "30 days" },
  { value: 90, label: "90 days" },
  { value: 365, label: "1 year" },
] as const;

function DataRetentionCard({ onSave }: { onSave: () => void }) {
  const [showForm, setShowForm] = useState(false);
  const [selected, setSelected] = useState<7 | 30 | 90 | 365>(90);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    // Simulate async save — backend implementation is a future task
    await new Promise((r) => setTimeout(r, 600));
    setSaving(false);
    setShowForm(false);
    onSave();
  };

  return (
    <Card>
      <div className="flex items-center gap-3 mb-5">
        <div className="p-2.5 rounded-xl bg-surface-elevated">
          <Database className="w-5 h-5 text-text-secondary" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-text-primary">Data Retention</h2>
          <p className="text-sm text-text-secondary mt-0.5">Control how long historical data is kept</p>
        </div>
      </div>

      <div className="flex items-start gap-3 p-4 rounded-lg bg-surface-elevated/50 border border-border mb-4">
        <Info className="w-4 h-4 text-accent shrink-0 mt-0.5" />
        <p className="text-sm text-text-secondary">
          Monitor check history is retained for <span className="text-text-primary font-medium">90 days</span>. Older data is automatically pruned.
        </p>
      </div>

      {!showForm ? (
        <Button variant="secondary" onClick={() => setShowForm(true)} className="flex items-center gap-2">
          Configure
        </Button>
      ) : (
        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium text-text-secondary mb-3">Retention Period</p>
            <div className="flex flex-wrap gap-2">
              {RETENTION_OPTIONS.map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => setSelected(value)}
                  className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    selected === value
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-border bg-surface-elevated text-text-secondary hover:border-accent/50 hover:text-text-primary"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button onClick={handleSave} disabled={saving} className="flex items-center gap-2">
              {saving ? (
                <>
                  <span className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                  Saving…
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Save
                </>
              )}
            </Button>
            <Button variant="secondary" onClick={() => setShowForm(false)} disabled={saving}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

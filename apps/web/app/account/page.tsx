"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Copy, Key, LogOut, Plus, Shield, Trash2, User } from "lucide-react";
import { api } from "../../lib/api";
import { clearSession, getUser } from "../../components/auth";
import { AppFrame } from "../../components/app-frame";
import { Card } from "../components/Card";
import { Button } from "../components/Button";
import { Badge } from "../components/Badge";
import { FadeIn } from "../components/FadeIn";
import { Modal } from "../components/Modal";

interface Me {
  id: string;
  email: string;
  role: "admin" | "user";
  mustChangePassword?: boolean;
}

interface Session {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  revokedAt: string | null;
  createdAt: string;
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

const inputClass =
  "w-full px-4 py-3 bg-surface border border-border rounded-lg text-text-primary placeholder-text-secondary focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent";

export default function AccountPage() {
  const router = useRouter();
  const [user, setUser] = useState<ReturnType<typeof getUser> | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [email, setEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

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
        setError("");
        const [profile, sess, keys] = await Promise.all([
          api<Me>("/v1/auth/me", userId),
          api<Session[]>("/v1/auth/sessions", userId),
          api<ApiKey[]>("/v1/api-keys", userId),
        ]);
        setMe(profile);
        setSessions(sess);
        setApiKeys(keys);
        setEmail(profile.email);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load account");
        router.push("/login");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [router]);

  const handleUpdateEmail = async () => {
    try {
      setError("");
      setSuccess("");
      await api("/v1/auth/profile", user?.id, {
        method: "PATCH",
        body: JSON.stringify({ email }),
      });
      setSuccess("Email updated successfully");
      if (me) setMe({ ...me, email });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update email");
    }
  };

  const handleChangePassword = async () => {
    try {
      setError("");
      setSuccess("");

      if (newPassword !== confirmPassword) {
        setError("Passwords don't match");
        return;
      }

      if (newPassword.length < 12) {
        setError("Password must be at least 12 characters");
        return;
      }

      await api("/v1/auth/change-password", user?.id, {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSuccess("Password changed. Please login again.");
      setTimeout(() => {
        void clearSession().then(() => router.push("/login"));
      }, 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to change password");
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
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to revoke session");
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
      setError(e instanceof Error ? e.message : "Failed to create API key");
    } finally {
      setCreatingKey(false);
    }
  };

  const handleCopyKey = async () => {
    if (!createdKey) return;
    await navigator.clipboard.writeText(createdKey.key);
    setKeyCopied(true);
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
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to revoke API key");
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
      <div className="space-y-6 max-w-2xl">
        {error && (
          <FadeIn>
            <div className="flex items-start gap-3 p-4 rounded-xl bg-danger/10 border border-danger/20">
              <AlertCircle className="w-5 h-5 text-danger mt-0.5 shrink-0" />
              <span className="text-danger text-sm">{error}</span>
            </div>
          </FadeIn>
        )}

        {success && (
          <FadeIn>
            <div className="flex items-start gap-3 p-4 rounded-xl bg-success/10 border border-success/20">
              <CheckCircle2 className="w-5 h-5 text-success mt-0.5 shrink-0" />
              <span className="text-success text-sm">{success}</span>
            </div>
          </FadeIn>
        )}

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

              <div className="flex items-center gap-2 py-1">
                <span className="text-sm text-text-secondary">Role:</span>
                <Badge variant={me?.role === "admin" ? "success" : "default"}>
                  {me?.role || "user"}
                </Badge>
              </div>

              <Button onClick={handleUpdateEmail} size="lg" className="w-full">
                Update Email
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
                />
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
                />
              </div>

              <p className="text-xs text-text-secondary">
                Password must be at least 12 characters long
              </p>

              <Button onClick={handleChangePassword} size="lg" className="w-full">
                Change Password
              </Button>
            </div>
          </Card>
        </FadeIn>

        {/* API Keys Section */}
        <FadeIn delay={0.2}>
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
        <FadeIn delay={0.3}>
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
    </AppFrame>
  );
}

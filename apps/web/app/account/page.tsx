"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, LogOut, Shield, User } from "lucide-react";
import { api } from "../../lib/api";
import { clearSession, getUser } from "../../components/auth";
import { AppFrame } from "../../components/app-frame";
import { Card } from "../components/Card";
import { Button } from "../components/Button";
import { FadeIn } from "../components/FadeIn";

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

export default function AccountPage() {
  const router = useRouter();
  const [user, setUser] = useState<ReturnType<typeof getUser> | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [email, setEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

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
        const [profile, sess] = await Promise.all([
          api<Me>("/v1/auth/me", userId),
          api<Session[]>("/v1/auth/sessions", userId),
        ]);
        setMe(profile);
        setSessions(sess);
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
        clearSession();
        router.push("/login");
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

  if (!user) return null;
  if (loading)
    return (
      <AppFrame title="Account">
        <div className="flex items-center justify-center py-20">
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
              <span className="text-success text-sm">{success}</span>
            </div>
          </FadeIn>
        )}

        {/* Profile Section */}
        <FadeIn>
          <Card>
            <div className="flex items-center gap-3 mb-6">
              <User className="w-6 h-6 text-accent" />
              <h2 className="text-xl font-bold">Profile</h2>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-2 bg-surface-elevated border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent"
                />
              </div>

              <div className="text-sm text-text-muted">
                Role: <span className="text-text-secondary font-medium">{me?.role}</span>
              </div>

              <Button onClick={handleUpdateEmail} className="w-full">
                Update Email
              </Button>
            </div>
          </Card>
        </FadeIn>

        {/* Security Section */}
        <FadeIn delay={0.1}>
          <Card>
            <div className="flex items-center gap-3 mb-6">
              <Shield className="w-6 h-6 text-accent" />
              <h2 className="text-xl font-bold">Security</h2>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">
                  Current Password
                </label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full px-4 py-2 bg-surface-elevated border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent"
                  placeholder="••••••••"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">
                  New Password
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-4 py-2 bg-surface-elevated border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent"
                  placeholder="••••••••"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-4 py-2 bg-surface-elevated border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent"
                  placeholder="••••••••"
                />
              </div>

              <p className="text-xs text-text-muted">
                Password must be at least 12 characters long
              </p>

              <Button onClick={handleChangePassword} className="w-full">
                Change Password
              </Button>
            </div>
          </Card>
        </FadeIn>

        {/* Sessions Section */}
        {sessions.length > 0 && (
          <FadeIn delay={0.2}>
            <Card>
              <h2 className="text-xl font-bold mb-4">Active Sessions</h2>
              <div className="space-y-3">
                {sessions.map((session) => (
                  <div
                    key={session.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-surface-elevated/50"
                  >
                    <div className="flex-1">
                      <p className="text-sm text-text-secondary">
                        {session.userAgent || "Unknown device"}
                      </p>
                      <p className="text-xs text-text-muted">
                        {session.ipAddress && `IP: ${session.ipAddress} • `}
                        {new Date(session.createdAt).toLocaleString()}
                      </p>
                      {session.revokedAt && (
                        <p className="text-xs text-danger">Revoked</p>
                      )}
                    </div>
                    {!session.revokedAt && (
                      <button
                        onClick={() => handleRevokeSession(session.id)}
                        className="text-danger hover:text-danger/80 text-sm transition-colors"
                      >
                        <LogOut className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          </FadeIn>
        )}
      </div>
    </AppFrame>
  );
}

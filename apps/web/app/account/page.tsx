"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, LogOut, Shield, User } from "lucide-react";
import { api } from "../../lib/api";
import { clearSession, getUser } from "../../components/auth";
import { AppFrame } from "../../components/app-frame";
import { Card } from "../components/Card";
import { Button } from "../components/Button";
import { Badge } from "../components/Badge";
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

const inputClass =
  "w-full px-4 py-3 bg-surface border border-border rounded-lg text-text-primary placeholder-text-secondary focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent";

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

        {/* Sessions Section */}
        <FadeIn delay={0.2}>
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
    </AppFrame>
  );
}

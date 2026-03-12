"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "../../lib/api";
import { setSession } from "../../components/auth";
import { FadeIn } from "../components/FadeIn";
import { AlertCircle, Monitor, Loader2 } from "lucide-react";

type LoginUser = {
  id: string;
  email: string;
  role: "admin" | "user";
  mustChangePassword?: boolean;
};

export default function LoginPage() {
  const [inviteToken, setInviteToken] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberUser, setRememberUser] = useState(true);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const invite = params.get("invite") ?? "";
    const reset = params.get("reset") ?? "";
    const queryEmail = params.get("email") ?? "";
    const rememberedEmail =
      localStorage.getItem("pulsedock_remembered_user") ?? "";

    setInviteToken(invite);
    setResetToken(reset);

    if (!invite && queryEmail) setEmail(queryEmail);
    else if (!invite && !reset && rememberedEmail) setEmail(rememberedEmail);
  }, []);

  useEffect(() => {
    async function loadInviteInfo() {
      if (!inviteToken) return;
      setInviteLoading(true);
      setError("");
      try {
        const data = await api<{
          email: string;
          role: "admin" | "user";
          expiresAt: string;
        }>("/v1/auth/invite-info", undefined, {
          method: "POST",
          body: JSON.stringify({ token: inviteToken }),
        });
        setEmail(data.email);
        setInfo(`Invite for ${data.email} (${data.role})`);
      } catch {
        setError("Invalid or expired invite link");
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
    setError("");
    setInfo("");
    try {
      const res = await api<{
        accessToken: string;
        refreshToken: string;
        user: LoginUser;
      }>("/v1/auth/login", undefined, {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });

      const isFirstLogin = Boolean(res.user.mustChangePassword);
      if (rememberUser && !isFirstLogin)
        localStorage.setItem(
          "pulsedock_remembered_user",
          email.trim().toLowerCase()
        );
      else localStorage.removeItem("pulsedock_remembered_user");

      const name =
        (res.user.email?.split("@")[0] || "user").trim() || "user";
      setSession(res.accessToken, res.refreshToken, {
        ...res.user,
        name,
      });
      router.push("/dashboard");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Login failed";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function acceptInvite() {
    if (inviteLoading) return;
    setLoading(true);
    setError("");
    setInfo("");
    try {
      await api("/v1/auth/accept-invite", undefined, {
        method: "POST",
        body: JSON.stringify({ token: inviteToken, password }),
      });
      await login();
    } catch {
      setError("Invite acceptance failed");
      setLoading(false);
    }
  }

  async function requestReset() {
    setLoading(true);
    setError("");
    setInfo("");
    try {
      await api<{ ok: boolean }>("/v1/auth/request-password-reset", undefined, {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setInfo(
        "If your account exists, reset instructions were sent by email."
      );
    } catch {
      setError("Could not request password reset");
    } finally {
      setLoading(false);
    }
  }

  async function confirmReset() {
    setLoading(true);
    setError("");
    setInfo("");
    try {
      await api("/v1/auth/reset-password", undefined, {
        method: "POST",
        body: JSON.stringify({ token: resetToken, newPassword: password }),
      });
      setInfo("Password reset complete. Please login with your new password.");
      setResetToken("");
    } catch {
      setError("Password reset failed");
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (inInviteFlow) return void acceptInvite();
    if (inResetFlow) return void confirmReset();
    if (forgotMode) return void requestReset();
    return void login();
  }

  const subtitle = inInviteFlow
    ? "Set your password to accept your invite"
    : inResetFlow
      ? "Set a new password for your account"
      : forgotMode
        ? "Request a password reset link"
        : "Sign in to your monitoring workspace";

  const buttonLabel = inInviteFlow
    ? "Accept Invite"
    : inResetFlow
      ? "Set New Password"
      : forgotMode
        ? "Request Reset Link"
        : "Sign in";

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative">
      {/* Background glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[20%] left-[30%] w-[500px] h-[500px] rounded-full bg-accent/5 blur-[120px]" />
      </div>

      <FadeIn>
        <div className="w-full max-w-md">
          {/* Logo */}
          <div className="flex items-center justify-center gap-2 mb-8">
            <Monitor className="w-6 h-6 text-accent" />
            <span className="text-2xl font-bold tracking-tight">PulseDock</span>
          </div>

          {/* Card */}
          <div className="bg-surface border border-border rounded-2xl p-8 shadow-2xl shadow-black/50">
            <p className="text-text-secondary text-sm text-center mb-6">
              {subtitle}
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Email */}
              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-text-secondary mb-1.5"
                >
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  disabled={inInviteFlow || inResetFlow}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-2.5 bg-surface-elevated border border-border rounded-xl text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-colors disabled:opacity-50"
                  placeholder="you@example.com"
                  autoComplete="email"
                />
              </div>

              {/* Password */}
              {(!forgotMode || inResetFlow || inInviteFlow) && (
                <div>
                  <label
                    htmlFor="password"
                    className="block text-sm font-medium text-text-secondary mb-1.5"
                  >
                    {inInviteFlow || inResetFlow
                      ? "Choose Password"
                      : "Password"}
                  </label>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-4 py-2.5 bg-surface-elevated border border-border rounded-xl text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-colors"
                    placeholder="••••••••"
                    autoComplete={
                      inInviteFlow || inResetFlow
                        ? "new-password"
                        : "current-password"
                    }
                  />
                </div>
              )}

              {/* Remember me */}
              {!inInviteFlow && !inResetFlow && !forgotMode && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rememberUser}
                    onChange={(e) => setRememberUser(e.target.checked)}
                    className="w-4 h-4 rounded border-border bg-surface-elevated text-accent focus:ring-accent/30"
                  />
                  <span className="text-sm text-text-secondary">
                    Remember me
                  </span>
                </label>
              )}

              {/* Error */}
              {error && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-danger/10 border border-danger/20 text-danger text-sm">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Info */}
              {info && (
                <div className="p-3 rounded-xl bg-accent/10 border border-accent/20 text-accent text-sm">
                  {info}
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={loading || inviteLoading}
                className="w-full bg-accent hover:bg-accent-hover text-bg font-semibold py-2.5 rounded-xl transition-all hover:shadow-[0_0_20px_rgba(88,166,255,0.2)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading && (
                  <Loader2 className="w-4 h-4 animate-spin" />
                )}
                {buttonLabel}
              </button>
            </form>

            {/* Forgot password link */}
            {!inInviteFlow && !inResetFlow && (
              <div className="mt-4 text-center">
                <button
                  type="button"
                  onClick={() => setForgotMode((v) => !v)}
                  className="text-sm text-accent hover:text-accent-hover transition-colors"
                >
                  {forgotMode ? "← Back to sign in" : "Forgot password?"}
                </button>
              </div>
            )}
          </div>

          {/* Back to home */}
          <div className="mt-6 text-center">
            <Link
              href="/"
              className="text-sm text-text-muted hover:text-text-secondary transition-colors"
            >
              ← Back to home
            </Link>
          </div>
        </div>
      </FadeIn>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "../../lib/api";
import { setSession } from "../../components/auth";
import { FadeIn } from "../components/FadeIn";
import { AlertCircle, Monitor, Loader2 } from "lucide-react";
import { PasswordStrength, passwordMeetsPolicy } from "../components/PasswordStrength";

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
  const [needsVerification, setNeedsVerification] = useState(false);
  const [loading, setLoading] = useState(false);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);
  // 2FA state
  const [totpStep, setTotpStep] = useState(false);
  const [totpTempToken, setTotpTempToken] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);
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

  type LoginResponse =
    | { accessToken: string; refreshToken: string; user: LoginUser }
    | { requires2fa: true; tempToken: string };

  function completeLogin(res: { accessToken: string; refreshToken: string; user: LoginUser }) {
    const isFirstLogin = Boolean(res.user.mustChangePassword);
    if (rememberUser && !isFirstLogin)
      localStorage.setItem("pulsedock_remembered_user", email.trim().toLowerCase());
    else localStorage.removeItem("pulsedock_remembered_user");
    const name = (res.user.email?.split("@")[0] || "user").trim() || "user";
    setSession(res.accessToken, res.refreshToken, { ...res.user, name });
    router.push("/dashboard");
  }

  async function login() {
    setLoading(true);
    setError("");
    setInfo("");
    try {
      const res = await api<LoginResponse>("/v1/auth/login", undefined, {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });

      if ("requires2fa" in res && res.requires2fa) {
        setTotpTempToken(res.tempToken);
        setTotpStep(true);
        setTotpCode("");
        setUseRecoveryCode(false);
        return;
      }

      completeLogin(res as { accessToken: string; refreshToken: string; user: LoginUser });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Login failed";
      if (msg === "email_not_verified") {
        setNeedsVerification(true);
        setError("");
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  async function verifyTotp() {
    if (!totpCode.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await api<{ accessToken: string; refreshToken: string; user: LoginUser }>(
        "/v1/auth/2fa/verify",
        undefined,
        {
          method: "POST",
          body: JSON.stringify({ tempToken: totpTempToken, code: totpCode.trim() }),
        },
      );
      completeLogin(res);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Invalid code");
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
    if (totpStep) return void verifyTotp();
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
        <div className="w-full max-w-2xl">
          {/* Logo */}
          <div className="flex items-center justify-center gap-3 mb-10">
            <Monitor className="w-10 h-10 text-accent" />
            <span className="text-4xl font-bold tracking-tight">PulseDock</span>
          </div>

          {/* Card */}
          <div className="bg-surface border border-border rounded-2xl p-12 shadow-2xl shadow-black/50">
            <p className="text-text-secondary text-sm text-center mb-6">
              {totpStep ? "Enter your authenticator code to continue" : subtitle}
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
            {totpStep && (
              <>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1.5">
                    {useRecoveryCode ? "Recovery Code" : "Authenticator Code"}
                  </label>
                  <input
                    type={useRecoveryCode ? "text" : "text"}
                    inputMode={useRecoveryCode ? "text" : "numeric"}
                    value={totpCode}
                    onChange={(e) => {
                      const val = useRecoveryCode
                        ? e.target.value
                        : e.target.value.replace(/\D/g, "").slice(0, 6);
                      setTotpCode(val);
                    }}
                    className="w-full px-4 py-3.5 bg-surface-elevated border border-border rounded-xl text-base text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-colors text-center tracking-[0.3em] text-lg"
                    placeholder={useRecoveryCode ? "xxxx-xxxx-xxxx" : "000000"}
                    maxLength={useRecoveryCode ? 14 : 6}
                    autoFocus
                    autoComplete="one-time-code"
                  />
                </div>

                {error && (
                  <div className="flex items-start gap-2 p-3 rounded-xl bg-danger/10 border border-danger/20 text-danger text-sm">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || totpCode.length < (useRecoveryCode ? 14 : 6)}
                  className="w-full bg-accent hover:bg-accent-hover text-bg font-semibold py-4 rounded-xl transition-all hover:shadow-[0_0_20px_rgba(88,166,255,0.2)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-base"
                >
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  Verify
                </button>

                <div className="text-center space-y-2">
                  <button
                    type="button"
                    onClick={() => { setUseRecoveryCode((v) => !v); setTotpCode(""); setError(""); }}
                    className="text-sm text-accent hover:text-accent-hover transition-colors"
                  >
                    {useRecoveryCode ? "← Use authenticator app" : "Use a recovery code instead"}
                  </button>
                  <br />
                  <button
                    type="button"
                    onClick={() => { setTotpStep(false); setTotpTempToken(""); setTotpCode(""); setError(""); setUseRecoveryCode(false); }}
                    className="text-sm text-text-muted hover:text-text-secondary transition-colors"
                  >
                    ← Back to login
                  </button>
                </div>
              </>
            )}
            {!totpStep && (
              <>
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
                  className="w-full px-4 py-3.5 bg-surface-elevated border border-border rounded-xl text-base text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-colors disabled:opacity-50"
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
                    className="w-full px-4 py-3.5 bg-surface-elevated border border-border rounded-xl text-base text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-colors"
                    placeholder="••••••••"
                    autoComplete={
                      inInviteFlow || inResetFlow
                        ? "new-password"
                        : "current-password"
                    }
                  />
                  {/* Show strength meter only when setting a new password */}
                  {(inInviteFlow || inResetFlow) && (
                    <PasswordStrength password={password} />
                  )}
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

              {/* Email not verified */}
              {needsVerification && (
                <div className="p-3 rounded-xl bg-accent/10 border border-accent/20 text-accent text-sm">
                  Please verify your email before signing in.{" "}
                  <a
                    href={`/verify-email?email=${encodeURIComponent(email)}`}
                    className="underline hover:text-accent-hover transition-colors"
                  >
                    Resend verification email
                  </a>
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={
                  loading ||
                  inviteLoading ||
                  ((inInviteFlow || inResetFlow) && !passwordMeetsPolicy(password))
                }
                className="w-full bg-accent hover:bg-accent-hover text-bg font-semibold py-4 rounded-xl transition-all hover:shadow-[0_0_20px_rgba(88,166,255,0.2)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-base"
              >
                {loading && (
                  <Loader2 className="w-4 h-4 animate-spin" />
                )}
                {buttonLabel}
              </button>
              </>
            )}
            </form>

            {/* Forgot password link */}
            {!totpStep && !inInviteFlow && !inResetFlow && (
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

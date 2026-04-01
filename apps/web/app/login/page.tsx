"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, API_BASE } from "../../lib/api";
import { setSession } from "../../components/auth";
import { FadeIn } from "../components/FadeIn";
import { AlertCircle, Monitor, Loader2, Shield, Eye, EyeOff } from "lucide-react";
import { PasswordStrength, passwordMeetsPolicy } from "../components/PasswordStrength";
import { LocaleSwitcher } from "../components/LocaleSwitcher";
import { useI18n } from "../../components/i18n-provider";
import { brand } from "../../lib/brand";

type LoginUser = {
  id: string;
  email: string;
  role: "admin" | "user";
  mustChangePassword?: boolean;
};

export default function LoginPage() {
  const { t } = useI18n();
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
  const [mailEnabled, setMailEnabled] = useState(false);
  // 2FA state
  const [totpStep, setTotpStep] = useState(false);
  const [totpTempToken, setTotpTempToken] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  // First-run setup state
  const [needsSetup, setNeedsSetup] = useState(false);
  const [setupLoading, setSetupLoading] = useState(true);
  const [setupEmail, setSetupEmail] = useState("");
  const [setupPassword, setSetupPassword] = useState("");
  const [setupConfirm, setSetupConfirm] = useState("");
  const [setupError, setSetupError] = useState("");
  const [setupSubmitting, setSetupSubmitting] = useState(false);
  const [pendingOAuthToken, setPendingOAuthToken] = useState("");
  const router = useRouter();

  useEffect(() => {
    api<{ needsSetup: boolean }>("/v1/auth/setup-status")
      .then((r) => setNeedsSetup(r.needsSetup))
      .catch(() => setNeedsSetup(false))
      .finally(() => setSetupLoading(false));
  }, []);

  useEffect(() => {
    api<{ enabled: boolean }>('/v1/auth/mail-configured')
      .then((r) => setMailEnabled(r.enabled))
      .catch(() => setMailEnabled(false));
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const invite = params.get("invite") ?? "";
    const reset = params.get("reset") ?? "";
    const queryEmail = params.get("email") ?? "";
    const oauthToken = params.get("token") ?? "";
    const oauthError = params.get("error") ?? "";
    const rememberedEmail =
      localStorage.getItem("pulsedock_remembered_user") ?? "";

    setInviteToken(invite);
    setResetToken(reset);

    if (oauthError) {
      setError("OAuth login failed. Please try again.");
    }
    if (oauthToken) {
      setPendingOAuthToken(oauthToken);
    }

    if (!invite && queryEmail) setEmail(queryEmail);
    else if (!invite && !reset && rememberedEmail) setEmail(rememberedEmail);

    // Handle OAuth2 callback token exchange
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

  // Handle OAuth2 token exchange after completeLogin is in scope
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!pendingOAuthToken) return;
    (async () => {
      try {
        const res = await api<{ accessToken: string; refreshToken: string; user: LoginUser }>(
          "/v1/auth/refresh",
          undefined,
          { method: "POST", body: JSON.stringify({ token: pendingOAuthToken }) }
        );
        completeLogin(res);
      } catch {
        setError("OAuth session exchange failed. Please try again.");
      }
    })();
  }, [pendingOAuthToken]);

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

  async function handleSetup(e: React.FormEvent) {
    e.preventDefault();
    setSetupError("");
    if (setupPassword !== setupConfirm) {
      setSetupError("Passwords do not match");
      return;
    }
    if (!passwordMeetsPolicy(setupPassword)) {
      setSetupError("Password does not meet the security policy");
      return;
    }
    setSetupSubmitting(true);
    try {
      await api<{ accessToken: string; refreshToken: string; user: LoginUser }>(
        "/v1/auth/setup",
        undefined,
        {
          method: "POST",
          body: JSON.stringify({ email: setupEmail, password: setupPassword }),
        },
      );
      // Log in with the new credentials
      const loginRes = await api<{ accessToken: string; refreshToken: string; user: LoginUser }>(
        "/v1/auth/login",
        undefined,
        {
          method: "POST",
          body: JSON.stringify({ email: setupEmail, password: setupPassword }),
        },
      );
      const name = (loginRes.user.email?.split("@")[0] || "user").trim() || "user";
      setSession(loginRes.accessToken, loginRes.refreshToken, { ...loginRes.user, name });
      router.push("/dashboard");
    } catch (err: unknown) {
      setSetupError(err instanceof Error ? err.message : "Setup failed");
    } finally {
      setSetupSubmitting(false);
    }
  }

  const subtitle = inInviteFlow
    ? t("login.subtitleInvite")
    : inResetFlow
      ? t("login.subtitleReset")
      : forgotMode
        ? t("login.subtitleForgot")
        : t("login.subtitleSignIn");

  const buttonLabel = inInviteFlow
    ? t("login.acceptInvite")
    : inResetFlow
      ? t("login.setNewPassword")
      : forgotMode
        ? t("login.requestResetLink")
        : t("login.signIn");

  if (setupLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
      </div>
    );
  }

  if (needsSetup) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-bg/95 backdrop-blur-sm">
        <FadeIn>
          <div className="w-full max-w-lg">
            {/* Logo */}
            <div className="flex items-center justify-center gap-3 mb-8">
              {brand.logoUrl ? (
                <img src={brand.logoUrl} alt={brand.name} className="h-10 max-w-[200px] object-contain" />
              ) : (
                <>
                  <Monitor className="w-10 h-10 text-accent" />
                  <span className="text-4xl font-bold tracking-tight">{brand.name}</span>
                </>
              )}
            </div>

            {/* Setup Card */}
            <div className="bg-surface border border-border rounded-2xl p-10 shadow-2xl shadow-black/50">
              <div className="flex items-center justify-center gap-2 mb-3">
                <Shield className="w-5 h-5 text-accent" />
                <h1 className="text-xl font-semibold text-text-primary">{`Welcome to ${brand.name}`}</h1>
              </div>
              <p className="text-text-secondary text-sm text-center mb-8">
                Set up your admin account to get started
              </p>

              <form onSubmit={handleSetup} className="space-y-4">
                {/* Email */}
                <div>
                  <label htmlFor="setup-email" className="block text-sm font-medium text-text-secondary mb-1.5">
                    Email
                  </label>
                  <input
                    id="setup-email"
                    type="email"
                    value={setupEmail}
                    onChange={(e) => setSetupEmail(e.target.value)}
                    className="w-full px-4 py-3.5 bg-surface-elevated border border-border rounded-xl text-base text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-colors"
                    placeholder="admin@example.com"
                    autoComplete="email"
                    required
                    autoFocus
                  />
                </div>

                {/* Password */}
                <div>
                  <label htmlFor="setup-password" className="block text-sm font-medium text-text-secondary mb-1.5">
                    Password
                  </label>
                  <input
                    id="setup-password"
                    type="password"
                    value={setupPassword}
                    onChange={(e) => setSetupPassword(e.target.value)}
                    className="w-full px-4 py-3.5 bg-surface-elevated border border-border rounded-xl text-base text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-colors"
                    placeholder="••••••••"
                    autoComplete="new-password"
                    required
                  />
                  <PasswordStrength password={setupPassword} />
                </div>

                {/* Confirm Password */}
                <div>
                  <label htmlFor="setup-confirm" className="block text-sm font-medium text-text-secondary mb-1.5">
                    Confirm Password
                  </label>
                  <input
                    id="setup-confirm"
                    type="password"
                    value={setupConfirm}
                    onChange={(e) => setSetupConfirm(e.target.value)}
                    className="w-full px-4 py-3.5 bg-surface-elevated border border-border rounded-xl text-base text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-colors"
                    placeholder="••••••••"
                    autoComplete="new-password"
                    required
                  />
                  {setupConfirm && setupPassword !== setupConfirm && (
                    <p className="mt-1.5 text-xs text-danger">Passwords do not match</p>
                  )}
                </div>

                {/* Error */}
                {setupError && (
                  <div className="flex items-start gap-2 p-3 rounded-xl bg-danger/10 border border-danger/20 text-danger text-sm">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>{setupError}</span>
                  </div>
                )}

                {/* Submit */}
                <button
                  type="submit"
                  disabled={
                    setupSubmitting ||
                    !setupEmail ||
                    !passwordMeetsPolicy(setupPassword) ||
                    setupPassword !== setupConfirm
                  }
                  className="w-full bg-accent hover:bg-accent-hover text-bg font-semibold py-4 rounded-xl transition-all hover:shadow-[0_0_20px_rgba(88,166,255,0.2)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-base"
                >
                  {setupSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  Create account &amp; sign in
                </button>
              </form>
            </div>
          </div>
        </FadeIn>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative">
      {/* Background glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[20%] left-[30%] w-[500px] h-[500px] rounded-full bg-accent/5 blur-[120px]" />
      </div>

      <FadeIn>
        <div className="w-full max-w-xl sm:max-w-2xl lg:max-w-3xl">
          {/* Logo */}
          <div className="mb-6 flex justify-center">
            <LocaleSwitcher />
          </div>
          <div className="flex items-center justify-center gap-3 mb-10">
            {brand.logoUrl ? (
              <img src={brand.logoUrl} alt={brand.name} className="h-10 max-w-[200px] object-contain" />
            ) : (
              <>
                <Monitor className="w-10 h-10 text-accent" />
                <span className="text-4xl font-bold tracking-tight">{brand.name}</span>
              </>
            )}
          </div>

          {/* Card */}
          <div className="bg-surface border border-border rounded-2xl p-12 shadow-2xl shadow-black/50">
            <p className="text-text-secondary text-sm text-center mb-6">
              {totpStep ? t("login.subtitleTotp") : subtitle}
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
            {totpStep && (
              <>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1.5">
                    {useRecoveryCode ? t("login.recoveryCode") : t("login.authenticatorCode")}
                  </label>
                  <input
                    type={useRecoveryCode ? "text" : "tel"}
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
                  {t("login.verify")}
                </button>

                <div className="text-center space-y-2">
                  <button
                    type="button"
                    onClick={() => { setUseRecoveryCode((v) => !v); setTotpCode(""); setError(""); }}
                    className="text-sm text-accent hover:text-accent-hover transition-colors"
                  >
                    {useRecoveryCode ? t("login.useAuthenticator") : t("login.useRecoveryCode")}
                  </button>
                  <br />
                  <button
                    type="button"
                    onClick={() => { setTotpStep(false); setTotpTempToken(""); setTotpCode(""); setError(""); setUseRecoveryCode(false); }}
                    className="text-sm text-text-muted hover:text-text-secondary transition-colors"
                  >
                    {t("login.backToLogin")}
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
                  {t("login.email")}
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
                      ? t("login.choosePassword")
                      : t("login.password")}
                  </label>
                  <div className="relative">
                    <input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-4 py-3.5 pr-12 bg-surface-elevated border border-border rounded-xl text-base text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-colors"
                      placeholder="••••••••"
                      autoComplete={
                        inInviteFlow || inResetFlow
                          ? "new-password"
                          : "current-password"
                      }
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-text-muted hover:text-text-secondary transition-colors"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
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
                    {t("login.rememberMe")}
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
                  {t("login.verifyEmailNotice")}{" "}
                  <a
                    href={`/verify-email?email=${encodeURIComponent(email)}`}
                    className="underline hover:text-accent-hover transition-colors"
                  >
                    {t("login.resendVerification")}
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

            {/* Forgot password link — only shown when SMTP is configured */}
            {!totpStep && !inInviteFlow && !inResetFlow && mailEnabled && (
              <div className="mt-4 text-center">
                <button
                  type="button"
                  onClick={() => setForgotMode((v) => !v)}
                  className="text-sm text-accent hover:text-accent-hover transition-colors"
                >
                  {forgotMode ? t("login.backToSignIn") : t("login.forgotPassword")}
                </button>
              </div>
            )}
          </div>

          {/* OAuth2 / SSO buttons */}
          {!totpStep && !inInviteFlow && !inResetFlow && !forgotMode && (
            <div className="mt-6">
              <div className="relative flex items-center gap-3 mb-4">
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-text-muted">or continue with</span>
                <div className="flex-1 h-px bg-border" />
              </div>
              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  onClick={() => { window.location.href = `${API_BASE}/v1/auth/oauth/github`; }}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-border bg-surface-elevated hover:bg-surface-elevated/80 text-text-secondary text-sm font-medium transition-all hover:border-border-hover"
                >
                  <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" aria-hidden="true">
                    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
                  </svg>
                  Continue with GitHub
                </button>
                <button
                  type="button"
                  onClick={() => { window.location.href = `${API_BASE}/v1/auth/oauth/google`; }}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-border bg-surface-elevated hover:bg-surface-elevated/80 text-text-secondary text-sm font-medium transition-all hover:border-border-hover"
                >
                  <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden="true">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  Continue with Google
                </button>
              </div>
            </div>
          )}

          {/* Back to home */}
          <div className="mt-6 text-center">
            <Link
              href="/"
              className="text-sm text-text-muted hover:text-text-secondary transition-colors"
            >
              {t("common.backToHome")}
            </Link>
          </div>
        </div>
      </FadeIn>
    </div>
  );
}

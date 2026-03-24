"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2, Copy, QrCode, RefreshCw, Smartphone, X } from "lucide-react";
import { api } from "../../../lib/api";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { Badge } from "../../components/Badge";
import { Modal } from "../../components/Modal";
import { inputClass, type Me, type TotpSetupData } from "./shared";

interface TwoFactorCardProps {
  me: Me;
  userId: string;
  onMeUpdate: (me: Me) => void;
  toastSuccess: (msg: string) => void;
  toastError: (msg: string) => void;
}

export function TwoFactorCard({ me, userId, onMeUpdate, toastSuccess, toastError }: TwoFactorCardProps) {
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

  const handle2FASetupStart = async () => {
    try {
      setTotpLoading(true);
      setTotpError("");
      const data = await api<TotpSetupData>("/v1/auth/2fa/setup", userId, { method: "POST" });
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
      const result = await api<{ recoveryCodes: string[] }>("/v1/auth/2fa/enable", userId, {
        method: "POST",
        body: JSON.stringify({ code: totpVerifyCode.trim() }),
      });
      setTotpRecoveryCodes(result.recoveryCodes);
      setTotpVerifyCode("");
      onMeUpdate({ ...me, totpEnabled: true });
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
      await api("/v1/auth/2fa/disable", userId, {
        method: "POST",
        body: JSON.stringify({ password: disablePassword, code: disableCode }),
      });
      onMeUpdate({ ...me, totpEnabled: false });
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
      const result = await api<{ recoveryCodes: string[] }>("/v1/auth/2fa/regenerate-recovery-codes", userId, {
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

  return (
    <>
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
    </>
  );
}

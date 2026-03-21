"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "../../lib/api";
import { FadeIn } from "../components/FadeIn";
import { Monitor, Mail, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { brand } from "../../lib/brand";

type PageState = "loading" | "success" | "error" | "check-email" | "resent";

export default function VerifyEmailPage() {
  const router = useRouter();
  const [state, setState] = useState<PageState>("loading");
  const [email, setEmail] = useState("");
  const [resending, setResending] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token") ?? "";
    const queryEmail = params.get("email") ?? "";

    if (queryEmail) setEmail(queryEmail);

    if (token) {
      void (async () => {
        try {
          await api("/v1/auth/verify-email", undefined, {
            method: "POST",
            body: JSON.stringify({ token }),
          });
          setState("success");
          setTimeout(() => router.push("/login"), 2000);
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : "Verification failed";
          setErrorMsg(msg);
          setState("error");
        }
      })();
    } else {
      setState("check-email");
    }
  }, [router]);

  async function resend() {
    if (!email || resending) return;
    setResending(true);
    try {
      await api("/v1/auth/resend-verification", undefined, {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setState("resent");
    } catch {
      setErrorMsg("Could not resend verification email. Please try again.");
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative">
      {/* Background glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[20%] left-[30%] w-[500px] h-[500px] rounded-full bg-accent/5 blur-[120px]" />
      </div>

      <FadeIn>
        <div className="w-full max-w-lg">
          {/* Logo */}
          <div className="flex items-center justify-center gap-3 mb-10">
            <Monitor className="w-10 h-10 text-accent" />
            <span className="text-4xl font-bold tracking-tight">{brand.name}</span>
          </div>

          {/* Card */}
          <div className="bg-surface border border-border rounded-2xl p-12 shadow-2xl shadow-black/50 text-center">
            {state === "loading" && (
              <>
                <Loader2 className="w-12 h-12 text-accent animate-spin mx-auto mb-4" />
                <h2 className="text-xl font-semibold mb-2">Verifying your email…</h2>
                <p className="text-text-secondary text-sm">Please wait a moment.</p>
              </>
            )}

            {state === "success" && (
              <>
                <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-4" />
                <h2 className="text-xl font-semibold mb-2">Email verified!</h2>
                <p className="text-text-secondary text-sm">Redirecting you to login…</p>
              </>
            )}

            {state === "error" && (
              <>
                <AlertCircle className="w-12 h-12 text-danger mx-auto mb-4" />
                <h2 className="text-xl font-semibold mb-2">Verification failed</h2>
                <p className="text-text-secondary text-sm mb-6">
                  {errorMsg || "The link may have expired or already been used."}
                </p>
                {email && (
                  <button
                    onClick={() => void resend()}
                    disabled={resending}
                    className="inline-flex items-center gap-2 bg-accent hover:bg-accent-hover text-bg font-semibold py-3 px-6 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {resending && <Loader2 className="w-4 h-4 animate-spin" />}
                    Resend verification email
                  </button>
                )}
              </>
            )}

            {state === "check-email" && (
              <>
                <Mail className="w-12 h-12 text-accent mx-auto mb-4" />
                <h2 className="text-xl font-semibold mb-2">Check your email</h2>
                {email && (
                  <p className="text-text-secondary text-sm mb-2">
                    We sent a verification link to <span className="text-text-primary font-medium">{email}</span>.
                  </p>
                )}
                <p className="text-text-secondary text-sm mb-6">
                  Click the link in the email to verify your account.
                </p>
                <button
                  onClick={() => void resend()}
                  disabled={resending || !email}
                  className="inline-flex items-center gap-2 bg-accent hover:bg-accent-hover text-bg font-semibold py-3 px-6 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {resending && <Loader2 className="w-4 h-4 animate-spin" />}
                  Resend verification email
                </button>
              </>
            )}

            {state === "resent" && (
              <>
                <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-4" />
                <h2 className="text-xl font-semibold mb-2">Email sent!</h2>
                <p className="text-text-secondary text-sm mb-4">
                  A new verification link has been sent
                  {email && <> to <span className="text-text-primary font-medium">{email}</span></>}.
                </p>
                <p className="text-text-muted text-xs">
                  Didn&apos;t receive it? Check your spam folder or wait a moment before requesting again.
                </p>
              </>
            )}
          </div>

          {/* Back to login */}
          <div className="mt-6 text-center">
            <Link
              href="/login"
              className="text-sm text-text-muted hover:text-text-secondary transition-colors"
            >
              ← Back to sign in
            </Link>
          </div>
        </div>
      </FadeIn>
    </div>
  );
}

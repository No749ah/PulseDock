"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "../../../lib/api";
import { Monitor, Users, CheckCircle, AlertCircle, Loader2, Shield } from "lucide-react";
import { brand } from "../../../lib/brand";
import { ROLE_COLORS, ROLE_DESC } from "./helpers";

type InviteInfo = {
  invite: {
    id: string;
    email: string;
    role: string;
    expiresAt: string;
  };
  owner: {
    email: string;
    displayName: string | null;
  };
};

type PageState = "loading" | "preview" | "accepting" | "accepted" | "error";

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [state, setState] = useState<PageState>("loading");
  const [inviteInfo, setInviteInfo] = useState<InviteInfo | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!token) return;
    void (async () => {
      try {
        const data = await api<InviteInfo>(`/v1/team/invite/${token}`);
        setInviteInfo(data);
        setState("preview");
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Invalid or expired invitation";
        setErrorMsg(msg);
        setState("error");
      }
    })();
  }, [token]);

  async function handleAccept() {
    if (!token) return;
    setState("accepting");
    try {
      await api(`/v1/team/invite/${token}/accept`, undefined, { method: "POST" });
      setState("accepted");
      setTimeout(() => router.push("/dashboard"), 2500);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to accept invitation";
      setErrorMsg(msg);
      setState("error");
    }
  }

  return (
    <div className="min-h-screen bg-bg flex flex-col items-center justify-center px-4">
      {/* Logo */}
      <Link href="/" className="flex items-center gap-2 mb-10 group">
        <div className="w-9 h-9 rounded-xl bg-accent/15 flex items-center justify-center group-hover:bg-accent/25 transition-colors">
          <Monitor className="w-5 h-5 text-accent" />
        </div>
        <span className="text-lg font-semibold tracking-tight">{brand.name}</span>
      </Link>

      <div className="w-full max-w-md">
        {/* Loading */}
        {state === "loading" && (
          <div className="flex flex-col items-center gap-4 py-12">
            <Loader2 className="w-8 h-8 text-accent animate-spin" />
            <p className="text-text-secondary text-sm">Loading invitation…</p>
          </div>
        )}

        {/* Preview */}
        {state === "preview" && inviteInfo && (
          <div className="rounded-2xl border border-border bg-surface p-8 space-y-6">
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="w-14 h-14 rounded-2xl bg-accent/10 flex items-center justify-center">
                <Users className="w-7 h-7 text-accent" />
              </div>
              <div>
                <h1 className="text-xl font-semibold">You&apos;ve been invited</h1>
                <p className="text-text-secondary text-sm mt-1">
                  Join <strong className="text-text-primary">
                    {inviteInfo.owner.displayName ?? inviteInfo.owner.email}
                  </strong>&apos;s workspace on {brand.name}
                </p>
              </div>
            </div>

            {/* Role badge */}
            <div className="rounded-xl border border-border bg-surface-elevated p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-text-secondary uppercase tracking-wider font-medium">Your role</span>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${ROLE_COLORS[inviteInfo.invite.role] ?? ROLE_COLORS.VIEWER}`}>
                  {inviteInfo.invite.role}
                </span>
              </div>
              <p className="text-sm text-text-secondary flex items-center gap-2">
                <Shield className="w-4 h-4 flex-shrink-0 text-accent" />
                {ROLE_DESC[inviteInfo.invite.role] ?? "Access to workspace"}
              </p>
            </div>

            {/* Invite for email */}
            <p className="text-xs text-center text-text-secondary">
              This invitation was sent to <strong className="text-text-primary">{inviteInfo.invite.email}</strong>
            </p>

            {/* CTA */}
            <div className="space-y-3">
              <button
                onClick={() => void handleAccept()}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-accent text-white font-semibold text-sm hover:bg-accent/90 active:scale-95 transition-all"
              >
                Accept Invitation
              </button>
              <p className="text-xs text-center text-text-secondary">
                You must be logged in to accept.{" "}
                <Link
                  href={`/login?next=/invite/${token}`}
                  className="text-accent hover:underline"
                >
                  Log in first →
                </Link>
              </p>
            </div>
          </div>
        )}

        {/* Accepting */}
        {state === "accepting" && (
          <div className="flex flex-col items-center gap-4 py-12">
            <Loader2 className="w-8 h-8 text-accent animate-spin" />
            <p className="text-text-secondary text-sm">Joining workspace…</p>
          </div>
        )}

        {/* Accepted */}
        {state === "accepted" && (
          <div className="rounded-2xl border border-border bg-surface p-8 flex flex-col items-center gap-4 text-center">
            <div className="w-14 h-14 rounded-full bg-green-500/10 flex items-center justify-center">
              <CheckCircle className="w-7 h-7 text-green-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">You&apos;re in!</h2>
              <p className="text-text-secondary text-sm mt-1">
                Redirecting you to the dashboard…
              </p>
            </div>
          </div>
        )}

        {/* Error */}
        {state === "error" && (
          <div className="rounded-2xl border border-border bg-surface p-8 flex flex-col items-center gap-4 text-center">
            <div className="w-14 h-14 rounded-full bg-red-500/10 flex items-center justify-center">
              <AlertCircle className="w-7 h-7 text-red-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Invitation error</h2>
              <p className="text-text-secondary text-sm mt-1">{errorMsg}</p>
            </div>
            <Link
              href="/"
              className="text-sm text-accent hover:underline"
            >
              Go to homepage →
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

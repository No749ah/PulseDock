"use client";

import { useState } from "react";

interface SubscriberFormWidgetProps {
  slug: string;
  title: string;
  description: string;
  buttonText: string;
  successMessage: string;
}

export function SubscriberFormWidget({
  slug,
  title,
  description,
  buttonText,
  successMessage,
}: SubscriberFormWidgetProps) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "duplicate" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !slug) return;
    setStatus("loading");
    try {
      const res = await fetch(`/v1/public/status/${slug}/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (res.status === 201) {
        setStatus("success");
      } else if (res.status === 409) {
        setStatus("duplicate");
      } else {
        const body = await res.json().catch(() => ({}));
        setErrorMsg((body as { message?: string }).message ?? "Subscription failed.");
        setStatus("error");
      }
    } catch {
      setErrorMsg("Network error. Please try again.");
      setStatus("error");
    }
  };

  return (
    <div className="rounded-xl border border-border bg-surface/50 p-5 space-y-3">
      <div>
        <div className="text-base font-semibold text-text-primary">{title}</div>
        <div className="mt-1 text-sm text-text-secondary">{description}</div>
      </div>
      {status === "success" ? (
        <div className="flex items-center gap-2 rounded-lg bg-green-500/10 px-4 py-3 text-sm text-green-400">
          <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          {successMessage}
        </div>
      ) : status === "duplicate" ? (
        <div className="flex items-center gap-2 rounded-lg bg-blue-500/10 px-4 py-3 text-sm text-blue-400">
          <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Already subscribed with this email.
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="email"
            required
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={status === "loading"}
            className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder-text-secondary/50 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={status === "loading" || !email}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {status === "loading" && (
              <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {buttonText}
          </button>
        </form>
      )}
      {status === "error" && (
        <p className="text-xs text-red-400">{errorMsg}</p>
      )}
    </div>
  );
}

"use client";

import React from "react";
import { Shield } from "lucide-react";
import { Card } from "../../../components/Card";
import { api } from "../../../../lib/api";
import { getUser } from "../../../../components/auth";

interface CertDetails {
  available?: boolean;
  reason?: string;
  status?: string;
  grade?: string;
  hostname?: string;
  latencyMs?: number;
  validFrom?: string;
  validTo?: string;
  daysRemaining?: number;
  subject?: { CN?: string; O?: string };
  issuer?: { CN?: string; O?: string };
  protocol?: string;
  cipher?: { name?: string; version?: string };
  fingerprint?: string;
  serialNumber?: string;
  sans?: string[];
}

interface Props {
  certDetails: Record<string, unknown> | null;
  certLoading: boolean;
  onCertDetailsLoaded: (details: Record<string, unknown>) => void;
  onLoadingChange: (loading: boolean) => void;
  monitorId: string;
}

const STATUS_COLORS: Record<string, string> = {
  valid: "text-success",
  expiring: "text-yellow-400",
  critical: "text-danger",
  expired: "text-danger",
};

const GRADE_COLORS: Record<string, string> = {
  good: "bg-success/15 text-success border-success/30",
  fair: "bg-yellow-400/15 text-yellow-400 border-yellow-400/30",
  warning: "bg-yellow-400/15 text-yellow-400 border-yellow-400/30",
  critical: "bg-danger/15 text-danger border-danger/30",
  expired: "bg-danger/15 text-danger border-danger/30",
};

export function CertificateTab({ certDetails, certLoading, onCertDetailsLoaded, onLoadingChange, monitorId }: Props) {
  const handleRefresh = async () => {
    const user = getUser();
    if (!user) return;
    onLoadingChange(true);
    try {
      const data = await api<Record<string, unknown>>(`/v1/monitors/${monitorId}/certificate`, user.id);
      onCertDetailsLoaded(data);
    } catch {
      onCertDetailsLoaded({ supported: true, available: false, reason: "Failed to fetch certificate details" });
    } finally {
      onLoadingChange(false);
    }
  };

  const cert = certDetails as CertDetails | null;
  const status = String(cert?.status ?? "unknown");
  const daysLeft = Number(cert?.daysRemaining ?? 0);

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-4">
        <Shield className="w-4 h-4 text-accent" />
        <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">TLS Certificate Details</h2>
        <button
          onClick={handleRefresh}
          className="ml-auto text-xs text-accent hover:underline flex items-center gap-1"
          disabled={certLoading}
        >
          {certLoading ? "Loading…" : "↻ Refresh"}
        </button>
      </div>

      {certLoading && (
        <div className="text-center py-8 text-text-muted text-sm">Fetching live certificate data…</div>
      )}

      {!certLoading && cert && !cert.available && (
        <div className="text-center py-8">
          <p className="text-text-secondary text-sm">{String(cert.reason ?? "Certificate details unavailable")}</p>
        </div>
      )}

      {!certLoading && cert?.available && (
        <div className="space-y-4">
          <div className={`flex items-center gap-3 p-3 rounded-xl border ${GRADE_COLORS[String(cert.grade ?? "good")]}`}>
            <Shield className="w-5 h-5 flex-shrink-0" />
            <div>
              <p className="font-semibold text-sm capitalize">
                {status === "valid"
                  ? "Valid Certificate"
                  : status === "expiring"
                  ? `Expiring Soon — ${daysLeft} days left`
                  : status === "critical"
                  ? `Critical — Only ${daysLeft} days left!`
                  : "Certificate Expired"}
              </p>
              <p className="text-xs opacity-75">
                {String(cert.hostname ?? "")} · Checked in {Number(cert.latencyMs ?? 0)}ms
              </p>
            </div>
            <span className={`ml-auto text-xs font-bold uppercase tracking-wide ${STATUS_COLORS[status]}`}>
              {String(cert.grade ?? "—").toUpperCase()}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">Subject</p>
              <p className="text-sm text-text-primary">{cert.subject?.CN ?? "—"}</p>
              {cert.subject?.O && <p className="text-xs text-text-secondary">{cert.subject.O}</p>}
            </div>

            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">Issuer</p>
              <p className="text-sm text-text-primary">{cert.issuer?.CN ?? "—"}</p>
              {cert.issuer?.O && <p className="text-xs text-text-secondary">{cert.issuer.O}</p>}
            </div>

            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">Valid From</p>
              <p className="text-sm text-text-primary">
                {cert.validFrom
                  ? new Date(cert.validFrom).toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })
                  : "—"}
              </p>
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">Valid To</p>
              <p className={`text-sm font-medium ${STATUS_COLORS[status] ?? "text-text-primary"}`}>
                {cert.validTo
                  ? new Date(cert.validTo).toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })
                  : "—"}
              </p>
            </div>

            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">TLS Protocol</p>
              <p className="text-sm text-text-primary font-mono">{String(cert.protocol ?? "—")}</p>
            </div>

            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">Cipher Suite</p>
              <p className="text-sm text-text-primary font-mono text-xs break-all">{cert.cipher?.name ?? "—"}</p>
            </div>

            <div className="space-y-1.5 md:col-span-2">
              <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">SHA-256 Fingerprint</p>
              <p className="text-xs text-text-secondary font-mono break-all">{String(cert.fingerprint ?? "—")}</p>
            </div>

            {cert.serialNumber && (
              <div className="space-y-1.5 md:col-span-2">
                <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">Serial Number</p>
                <p className="text-xs text-text-secondary font-mono">{String(cert.serialNumber)}</p>
              </div>
            )}
          </div>

          {cert.sans && cert.sans.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                Subject Alternative Names ({cert.sans.length})
              </p>
              <div className="flex flex-wrap gap-1.5">
                {cert.sans.map((san, i) => (
                  <span
                    key={i}
                    className="px-2 py-0.5 text-xs rounded-md bg-surface-elevated border border-border text-text-secondary font-mono"
                  >
                    {san}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

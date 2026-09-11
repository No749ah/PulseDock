"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Award, X, Copy, ExternalLink, Check, AlertTriangle } from "lucide-react";
import { api } from "../../../../lib/api";
import { getUser } from "../../../../components/auth";
import type { MonitorItem } from "./types";
import { PERIOD_OPTIONS, complianceColor, complianceLabel, formatPct, type PeriodDays } from "./certificateHelpers";

interface CertificateData {
  certificateId: string;
  monitorId: string;
  monitorName: string;
  monitorTarget: string;
  monitorType: string;
  issuedAt: string;
  periodDays: number;
  periodStart: string;
  periodEnd: string;
  uptimePct: number;
  avgLatencyMs: number | null;
  p95LatencyMs: number | null;
  totalChecks: number;
  successChecks: number;
  failedChecks: number;
  totalDowntimeMinutes: number;
  longestOutageMinutes: number;
  incidents: number;
  slaTarget: number | null;
  slaCompliant: boolean | null;
  title: string;
}


interface CertificateModalProps {
  monitor: MonitorItem;
  onClose: () => void;
  onGenerateShareToken: () => Promise<void>;
}

export function CertificateModal({ monitor, onClose, onGenerateShareToken }: CertificateModalProps) {
  const [periodDays, setPeriodDays] = useState<PeriodDays>(30);
  const [customTitle, setCustomTitle] = useState("");
  const [certData, setCertData] = useState<CertificateData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [generatingToken, setGeneratingToken] = useState(false);

  const fetchCertData = useCallback(async () => {
    const user = getUser();
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ periodDays: String(periodDays) });
      if (customTitle.trim()) params.set("title", customTitle.trim());
      const data = await api<CertificateData>(
        `/v1/monitors/${monitor.id}/uptime-certificate/data?${params.toString()}`,
        user.id,
      );
      setCertData(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load certificate data");
    } finally {
      setLoading(false);
    }
  }, [monitor.id, periodDays, customTitle]);

  useEffect(() => {
    void fetchCertData();
  }, [fetchCertData]);

  const publicCertUrl = monitor.shareToken
    ? `${window.location.origin}/api/v1/public/certificates/${monitor.id}?token=${monitor.shareToken}&periodDays=${periodDays}`
    : null;

  const handleCopyLink = async () => {
    if (!publicCertUrl) return;
    try {
      await navigator.clipboard.writeText(publicCertUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard not available
    }
  };

  const handleDownloadPdf = () => {
    if (!publicCertUrl) return;
    window.open(publicCertUrl, "_blank");
  };

  const handleGenerateToken = async () => {
    setGeneratingToken(true);
    try {
      await onGenerateShareToken();
    } finally {
      setGeneratingToken(false);
    }
  };

  const complianceColorClass = complianceColor(certData?.slaCompliant);
  const complianceLabelText = complianceLabel(certData?.slaCompliant);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-lg bg-surface-elevated border border-border rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
              <Award className="w-4 h-4 text-accent" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-text-primary">Uptime Certificate</h2>
              <p className="text-xs text-text-muted">{monitor.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">
          {/* Period selector */}
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-2">Period</label>
            <div className="flex gap-2">
              {PERIOD_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setPeriodDays(opt.value)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                    periodDays === opt.value
                      ? "bg-accent text-white border-accent"
                      : "bg-surface border-border text-text-secondary hover:border-accent/50 hover:text-text-primary"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Custom title */}
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-2">
              Custom Title <span className="text-text-muted">(optional)</span>
            </label>
            <input
              type="text"
              value={customTitle}
              onChange={(e) => setCustomTitle(e.target.value)}
              placeholder="Uptime Certificate"
              className="w-full px-3 py-2 text-sm bg-surface border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent/60 transition-colors"
            />
          </div>

          {/* Preview */}
          <div className="rounded-xl border border-border bg-surface p-4 space-y-3">
            {loading && (
              <div className="text-center py-4 text-sm text-text-muted">Loading certificate data…</div>
            )}
            {error && !loading && (
              <div className="text-center py-4 text-sm text-red-400">{error}</div>
            )}
            {certData && !loading && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-bold text-text-primary">
                    {formatPct(certData.uptimePct)}
                  </span>
                  <span className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${complianceColorClass}`}>
                    {complianceLabelText}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="text-text-muted">Total checks: <span className="text-text-primary font-medium">{certData.totalChecks.toLocaleString()}</span></div>
                  <div className="text-text-muted">Failed: <span className="text-text-primary font-medium">{certData.failedChecks.toLocaleString()}</span></div>
                  <div className="text-text-muted">Incidents: <span className="text-text-primary font-medium">{certData.incidents}</span></div>
                  <div className="text-text-muted">Downtime: <span className="text-text-primary font-medium">{certData.totalDowntimeMinutes} min</span></div>
                  {certData.avgLatencyMs !== null && (
                    <div className="text-text-muted">Avg latency: <span className="text-text-primary font-medium">{certData.avgLatencyMs}ms</span></div>
                  )}
                  {certData.p95LatencyMs !== null && (
                    <div className="text-text-muted">p95 latency: <span className="text-text-primary font-medium">{certData.p95LatencyMs}ms</span></div>
                  )}
                </div>
                <div className="text-xs text-text-muted">
                  {new Date(certData.periodStart).toLocaleDateString()} – {new Date(certData.periodEnd).toLocaleDateString()}
                </div>
              </>
            )}
          </div>

          {/* Share token warning */}
          {!monitor.shareToken && (
            <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-amber-300 font-medium mb-1">Share token required</p>
                <p className="text-xs text-amber-300/70 mb-2">
                  A share token is needed to generate a public certificate URL.
                </p>
                <button
                  onClick={handleGenerateToken}
                  disabled={generatingToken}
                  className="text-xs font-medium text-amber-300 underline underline-offset-2 hover:text-amber-200 disabled:opacity-50 transition-colors"
                >
                  {generatingToken ? "Generating…" : "Generate Share Token"}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="px-6 py-4 border-t border-border flex items-center gap-3 justify-end">
          <button
            onClick={handleCopyLink}
            disabled={!monitor.shareToken || !certData}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg border border-border bg-surface text-text-secondary hover:text-text-primary hover:border-border/80 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? "Copied!" : "Copy Share Link"}
          </button>
          <button
            onClick={handleDownloadPdf}
            disabled={!monitor.shareToken || !certData}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-accent text-white hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Download as PDF
          </button>
        </div>
      </div>
    </div>
  );
}

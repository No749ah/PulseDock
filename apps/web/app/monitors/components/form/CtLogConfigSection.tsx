"use client";

import React from "react";
import { inputClass } from "../../constants";
import type { MonitorFormData } from "../../types";

type CtLogFormData = MonitorFormData & {
  ctLogLookbackDays?: number;
  ctLogAlertOnNewSubdomains?: boolean;
  ctLogAlertOnWildcard?: boolean;
};

interface CtLogConfigSectionProps {
  formData: CtLogFormData;
  onSetFormData: (data: CtLogFormData) => void;
}

export function CtLogConfigSection({ formData, onSetFormData }: CtLogConfigSectionProps) {
  return (
    <>
      <div className="rounded-xl border border-accent/20 bg-accent/5 p-3">
        <p className="text-xs text-text-secondary leading-relaxed">
          <span className="font-medium text-text-primary">CT Log Monitor</span> — watches{" "}
          <a href="https://crt.sh" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">crt.sh</a>{" "}
          (Certificate Transparency logs) for new SSL/TLS certificates issued for your domain. Detects unauthorized certs, new subdomains, and wildcard issuance. Enter just the domain name (e.g.{" "}
          <code className="bg-surface-2 px-1 rounded">example.com</code>).
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">Lookback window (days)</label>
        <input
          type="number" min={1} max={30}
          value={formData.ctLogLookbackDays ?? 7}
          onChange={(e) => onSetFormData({ ...formData, ctLogLookbackDays: Math.min(30, Math.max(1, parseInt(e.target.value, 10) || 7)) })}
          className={inputClass}
          placeholder="7"
        />
        <p className="text-xs text-text-secondary mt-1">Certificates issued within this window trigger a yellow alert. Range: 1–30 days.</p>
      </div>

      <div className="flex items-center gap-3">
        <input type="checkbox" id="ctLogAlertOnNewSubdomains" checked={formData.ctLogAlertOnNewSubdomains ?? true} onChange={(e) => onSetFormData({ ...formData, ctLogAlertOnNewSubdomains: e.target.checked })} className="w-4 h-4 rounded border border-border bg-surface accent-accent" />
        <label htmlFor="ctLogAlertOnNewSubdomains" className="text-sm text-text-primary cursor-pointer">Alert on new subdomains</label>
      </div>

      <div className="flex items-center gap-3">
        <input type="checkbox" id="ctLogAlertOnWildcard" checked={formData.ctLogAlertOnWildcard ?? true} onChange={(e) => onSetFormData({ ...formData, ctLogAlertOnWildcard: e.target.checked })} className="w-4 h-4 rounded border border-border bg-surface accent-accent" />
        <label htmlFor="ctLogAlertOnWildcard" className="text-sm text-text-primary cursor-pointer">Alert on wildcard certificates</label>
      </div>
    </>
  );
}

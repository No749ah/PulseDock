"use client";

import React from "react";
import { inputClass } from "../../constants";
import type { MonitorFormData } from "../../types";

type WhoisFormData = MonitorFormData & { whoisWarnDays?: number; whoisCriticalDays?: number };

interface WhoisConfigSectionProps {
  formData: WhoisFormData;
  onSetFormData: (data: WhoisFormData) => void;
}

export function WhoisConfigSection({ formData, onSetFormData }: WhoisConfigSectionProps) {
  return (
    <>
      <div className="rounded-xl border border-accent/20 bg-accent/5 p-3">
        <p className="text-xs text-text-secondary leading-relaxed">
          <span className="font-medium text-text-primary">WHOIS Domain Expiry</span> — queries the WHOIS registry to find when your domain expires. Alerts you before the expiry date so you never let a domain lapse. Enter just the domain name (e.g.{" "}
          <code className="bg-surface-2 px-1 rounded">example.com</code>).
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1">Warn threshold <span className="text-xs text-text-muted">(days)</span></label>
          <input type="number" min={1} max={365} value={formData.whoisWarnDays ?? 30} onChange={(e) => onSetFormData({ ...formData, whoisWarnDays: Math.max(1, Number(e.target.value)) })} className={inputClass} />
          <p className="mt-1 text-xs text-text-secondary">Yellow warning when expiry is within this many days (default: 30).</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1">Critical threshold <span className="text-xs text-text-muted">(days)</span></label>
          <input type="number" min={1} max={90} value={formData.whoisCriticalDays ?? 7} onChange={(e) => onSetFormData({ ...formData, whoisCriticalDays: Math.max(1, Number(e.target.value)) })} className={inputClass} />
          <p className="mt-1 text-xs text-text-secondary">Red alert when expiry is within this many days (default: 7).</p>
        </div>
      </div>
    </>
  );
}

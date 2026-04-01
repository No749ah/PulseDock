"use client";

import React from "react";
import { inputClass } from "../../constants";
import type { MonitorFormData } from "../../types";

type DnsFormData = MonitorFormData & {
  dnsRecordType?: string;
  dnsExpectedValue?: string;
  dnsTimeoutMs?: number;
  dnsDetectChanges?: boolean;
};

interface DnsConfigSectionProps {
  formData: DnsFormData;
  onSetFormData: (data: DnsFormData) => void;
}

export function DnsConfigSection({ formData, onSetFormData }: DnsConfigSectionProps) {
  return (
    <>
      <div className="rounded-xl border border-accent/20 bg-accent/5 p-3">
        <p className="text-xs text-text-secondary leading-relaxed">
          <span className="font-medium text-text-primary">DNS Lookup</span> — resolves the target hostname via DNS and measures lookup latency. Optionally assert a specific value in the result.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">Record Type</label>
        <select
          value={formData.dnsRecordType ?? "A"}
          onChange={(e) => onSetFormData({ ...formData, dnsRecordType: e.target.value })}
          className={inputClass}
        >
          {["A", "AAAA", "MX", "TXT", "CNAME", "NS"].map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <p className="mt-1 text-xs text-text-secondary">DNS record type to look up. Default: A (IPv4).</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">
          Expected value <span className="text-xs text-text-muted">(optional)</span>
        </label>
        <input
          type="text"
          value={formData.dnsExpectedValue ?? ""}
          onChange={(e) => onSetFormData({ ...formData, dnsExpectedValue: e.target.value })}
          placeholder="e.g. 1.2.3.4 or mail.example.com."
          className={inputClass}
        />
        <p className="mt-1 text-xs text-text-secondary">Check warns if the DNS result does not contain this value. Leave blank to only verify the lookup succeeds.</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">
          Timeout <span className="text-xs text-text-muted">(ms, optional)</span>
        </label>
        <input
          type="number" min="500" max="30000"
          value={formData.dnsTimeoutMs ?? 10000}
          onChange={(e) => onSetFormData({ ...formData, dnsTimeoutMs: Number(e.target.value) })}
          className={inputClass}
        />
      </div>

      <div className="flex items-start gap-3 p-3 rounded-xl border border-border bg-surface/50">
        <input
          id="detectChanges"
          type="checkbox"
          checked={formData.dnsDetectChanges ?? false}
          onChange={(e) => onSetFormData({ ...formData, dnsDetectChanges: e.target.checked })}
          className="mt-0.5 h-4 w-4 rounded border-border accent-accent cursor-pointer"
        />
        <div>
          <label htmlFor="detectChanges" className="block text-sm font-medium text-text-primary cursor-pointer">Alert on record change</label>
          <p className="mt-0.5 text-xs text-text-secondary leading-relaxed">
            Stores the current DNS records as a baseline on first check. Alerts if records change (added or removed). Useful for detecting DNS hijacking or accidental record changes.
          </p>
        </div>
      </div>
    </>
  );
}

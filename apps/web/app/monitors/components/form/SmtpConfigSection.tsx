"use client";

import React from "react";
import { inputClass } from "../../constants";
import { brand } from "../../../../lib/brand";
import type { MonitorFormData } from "../../types";

type SmtpFormData = MonitorFormData & { ehlo?: string; checkTls?: boolean };

interface SmtpConfigSectionProps {
  formData: SmtpFormData;
  onSetFormData: (data: SmtpFormData) => void;
}

export function SmtpConfigSection({ formData, onSetFormData }: SmtpConfigSectionProps) {
  return (
    <>
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">EHLO Hostname</label>
        <input
          type="text"
          value={formData.ehlo ?? "pulsedock.monitor"}
          onChange={(e) => onSetFormData({ ...formData, ehlo: e.target.value })}
          placeholder="pulsedock.monitor"
          className={inputClass}
        />
        <p className="mt-1 text-xs text-text-secondary">The hostname sent in the EHLO command (default: pulsedock.monitor).</p>
      </div>
      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          id="smtpCheckTls"
          checked={formData.checkTls ?? false}
          onChange={(e) => onSetFormData({ ...formData, checkTls: e.target.checked })}
          className="w-4 h-4 rounded border border-border bg-surface accent-accent"
        />
        <label htmlFor="smtpCheckTls" className="text-sm text-text-primary cursor-pointer">
          Test STARTTLS upgrade (port 587 / STARTTLS required)
        </label>
      </div>
      <p className="text-xs text-text-secondary -mt-1">
        When enabled, {brand.name} sends STARTTLS after EHLO. Warns if STARTTLS is advertised but connection fails.
      </p>
    </>
  );
}

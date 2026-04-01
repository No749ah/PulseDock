"use client";

import React from "react";
import { inputClass } from "../../constants";
import type { MonitorFormData } from "../../types";

type PingFormData = MonitorFormData & { pingCount?: number; pingMaxLossPct?: number };

interface PingConfigSectionProps {
  formData: PingFormData;
  onSetFormData: (data: PingFormData) => void;
}

export function PingConfigSection({ formData, onSetFormData }: PingConfigSectionProps) {
  return (
    <>
      <div className="rounded-xl border border-accent/20 bg-accent/5 p-3">
        <p className="text-xs text-text-secondary leading-relaxed">
          <span className="font-medium text-text-primary">ICMP Ping</span> — sends ping packets to the target host and measures round-trip latency and packet loss.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">Ping Count</label>
        <input
          type="number" min="1" max="10"
          value={formData.pingCount ?? 3}
          onChange={(e) => onSetFormData({ ...formData, pingCount: Math.min(10, Math.max(1, Number(e.target.value))) })}
          className={inputClass}
        />
        <p className="mt-1 text-xs text-text-secondary">Number of ICMP packets to send (1–10). Default: 3.</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">
          Max packet loss % before warning <span className="text-xs text-text-muted">(optional)</span>
        </label>
        <input
          type="number" min="0" max="100"
          value={formData.pingMaxLossPct ?? ""}
          onChange={(e) => onSetFormData({ ...formData, pingMaxLossPct: e.target.value === "" ? undefined : Number(e.target.value) })}
          placeholder="e.g. 20 (any loss = warn by default)"
          className={inputClass}
        />
        <p className="mt-1 text-xs text-text-secondary">Any packet loss triggers a warning by default. Set a threshold (0–100%) to allow some loss before alerting.</p>
      </div>
    </>
  );
}

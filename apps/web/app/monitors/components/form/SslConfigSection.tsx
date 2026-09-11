"use client";

import React from "react";
import { inputClass } from "../../constants";
import type { MonitorFormData } from "../../types";

type SslFormData = MonitorFormData & { sslWarnDays?: number };

interface SslConfigSectionProps {
  formData: SslFormData;
  onSetFormData: (data: SslFormData) => void;
}

export function SslConfigSection({ formData, onSetFormData }: SslConfigSectionProps) {
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-accent/20 bg-accent/5 p-3">
        <p className="text-xs text-text-secondary leading-relaxed">
          <span className="font-medium text-text-primary">SSL Certificate Check</span> — verifies certificate validity and expiry for the target domain.
        </p>
      </div>
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">Warn threshold (days)</label>
        <input
          type="number"
          min="1"
          max="365"
          value={formData.sslWarnDays ?? 30}
          onChange={(e) => onSetFormData({ ...formData, sslWarnDays: Math.max(1, Number(e.target.value) || 30) })}
          className={inputClass}
        />
      </div>
    </div>
  );
}

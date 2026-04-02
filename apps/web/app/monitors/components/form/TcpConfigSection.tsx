"use client";

import React from "react";
import { inputClass } from "../../constants";
import type { MonitorFormData } from "../../types";

type TcpFormData = MonitorFormData & { tcpTimeoutMs?: number };

interface TcpConfigSectionProps {
  formData: TcpFormData;
  onSetFormData: (data: TcpFormData) => void;
}

export function TcpConfigSection({ formData, onSetFormData }: TcpConfigSectionProps) {
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-accent/20 bg-accent/5 p-3">
        <p className="text-xs text-text-secondary leading-relaxed">
          <span className="font-medium text-text-primary">TCP Port Check</span> — validates that a TCP socket can be opened to the target host:port.
        </p>
      </div>
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">Connection timeout (ms)</label>
        <input
          type="number"
          min="500"
          max="60000"
          value={formData.tcpTimeoutMs ?? formData.timeoutMs ?? 5000}
          onChange={(e) => onSetFormData({ ...formData, tcpTimeoutMs: parseInt(e.target.value, 10) || 5000 })}
          className={inputClass}
        />
      </div>
    </div>
  );
}

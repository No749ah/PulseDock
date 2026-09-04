"use client";

import React from "react";
import { getApiBase } from "../../../../lib/api";
import { Button } from "../../../components/Button";
import { inputClass } from "../../constants";
import type { MonitorFormData } from "../../types";

type HeartbeatFormData = MonitorFormData;

interface HeartbeatConfigSectionProps {
  formData: HeartbeatFormData;
  formErrors: Record<string, string>;
  onSetFormData: (data: HeartbeatFormData) => void;
  onCopySuccess: (msg: string) => void;
}

export function HeartbeatConfigSection({ formData, formErrors, onSetFormData, onCopySuccess }: HeartbeatConfigSectionProps) {
  return (
    <>
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">
          Alert if no ping for (minutes) <span className="text-danger" aria-hidden="true">*</span>
        </label>
        <input
          type="number"
          min="1"
          max="1440"
          value={formData.heartbeatTimeoutMin}
          onChange={(e) => {
            const value = Math.max(1, Number(e.target.value || 1));
            onSetFormData({ ...formData, heartbeatTimeoutMin: value });
          }}
          className={inputClass}
        />
        {formErrors.heartbeatTimeoutMin && (
          <p role="alert" className="mt-1 text-xs text-danger">{formErrors.heartbeatTimeoutMin}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">Ping URL</label>
        <div className="flex items-center gap-2">
          <input
            type="text"
            readOnly
            value={`${getApiBase()}/v1/heartbeat/${formData.heartbeatToken || "<token>"}`}
            className={`${inputClass} font-mono text-xs`}
          />
          <Button
            type="button"
            variant="secondary"
            onClick={async () => {
              const url = `${getApiBase()}/v1/heartbeat/${formData.heartbeatToken || "<token>"}`;
              await navigator.clipboard.writeText(url);
              onCopySuccess("Heartbeat URL copied");
            }}
          >
            Copy
          </Button>
        </div>
        <p className="mt-1 text-xs text-text-secondary">Call this URL with POST from your cron job or app to mark it healthy.</p>
      </div>
    </>
  );
}

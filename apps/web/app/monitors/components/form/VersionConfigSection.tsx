"use client";

import React from "react";
import { inputClass } from "../../constants";

type VersionFormData = {
  versionProvider?: string;
  versionTargetUrl?: string;
  versionRepo?: string;
  versionAuthType?: string;
  versionInstanceUrl?: string;
  versionHeaders?: string;
};

interface VersionConfigSectionProps {
  formData: VersionFormData;
  onSetFormData: (data: VersionFormData) => void;
}

export function VersionConfigSection({ formData, onSetFormData }: VersionConfigSectionProps) {
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-accent/20 bg-accent/5 p-3">
        <p className="text-xs text-text-secondary leading-relaxed">
          <span className="font-medium text-text-primary">Version Monitor Config</span> — provider-specific options for release/version checks.
        </p>
      </div>
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">Provider</label>
        <select
          className={inputClass}
          value={formData.versionProvider ?? "github"}
          onChange={(e) => onSetFormData({ ...formData, versionProvider: e.target.value })}
        >
          <option value="github">GitHub</option>
          <option value="docker">Docker Hub</option>
          <option value="custom">Custom</option>
        </select>
      </div>
    </div>
  );
}

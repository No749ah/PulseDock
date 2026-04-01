"use client";

import React from "react";
import { inputClass } from "../../constants";
import type { MonitorFormData } from "../../types";

type BrowserFormData = MonitorFormData & {
  browserExpectedText?: string;
  browserSelector?: string;
  browserStatusCodesRaw?: string;
};

interface BrowserConfigSectionProps {
  formData: BrowserFormData;
  onSetFormData: (data: BrowserFormData) => void;
}

export function BrowserConfigSection({ formData, onSetFormData }: BrowserConfigSectionProps) {
  return (
    <>
      <div className="rounded-xl border border-accent/20 bg-accent/5 p-3">
        <p className="text-xs text-text-secondary leading-relaxed">
          <span className="font-medium text-text-primary">Browser / Page Check</span> — fetches your URL with a browser-like User-Agent and verifies the page loads successfully (2xx/3xx). Optionally assert that a specific text or HTML element is present.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">
          Expected text <span className="text-xs text-text-muted">(optional)</span>
        </label>
        <input
          type="text"
          value={formData.browserExpectedText ?? ""}
          onChange={(e) => onSetFormData({ ...formData, browserExpectedText: e.target.value })}
          placeholder='"Welcome" or "Dashboard"'
          className={inputClass}
        />
        <p className="mt-1 text-xs text-text-secondary">Check fails if this text is not found in the page HTML (case-insensitive).</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">
          CSS selector <span className="text-xs text-text-muted">(optional)</span>
        </label>
        <input
          type="text"
          value={formData.browserSelector ?? ""}
          onChange={(e) => onSetFormData({ ...formData, browserSelector: e.target.value })}
          placeholder='e.g. #app, .nav-bar, [data-testid="login"], main'
          className={`${inputClass} font-mono text-xs`}
        />
        <p className="mt-1 text-xs text-text-secondary">
          Check fails if this selector does not match any element. Supports:{" "}
          <code className="bg-surface-2 px-1 rounded">#id</code>,{" "}
          <code className="bg-surface-2 px-1 rounded">.class</code>,{" "}
          <code className="bg-surface-2 px-1 rounded">tag</code>,{" "}
          <code className="bg-surface-2 px-1 rounded">[attr]</code>,{" "}
          <code className="bg-surface-2 px-1 rounded">tag.class</code>,{" "}
          <code className="bg-surface-2 px-1 rounded">tag#id</code>
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">
          Allowed status codes <span className="text-xs text-text-muted">(optional, default: 2xx–3xx)</span>
        </label>
        <input
          type="text"
          value={formData.browserStatusCodesRaw ?? ""}
          onChange={(e) => onSetFormData({ ...formData, browserStatusCodesRaw: e.target.value })}
          placeholder="200, 301, 302"
          className={inputClass}
        />
        <p className="mt-1 text-xs text-text-secondary">Comma-separated list. Leave blank to accept any 2xx or 3xx response.</p>
      </div>
    </>
  );
}

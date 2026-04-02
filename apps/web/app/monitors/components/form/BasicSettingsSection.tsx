"use client";

import React from "react";
import { X } from "lucide-react";
import { MonitorTemplates } from "../../../components/MonitorTemplates";
import type { MonitorTemplate } from "../../../components/MonitorTemplates";
import { targetPlaceholder, targetHelperText } from "../../../components/timeUtils";
import { inputClass } from "../../constants";
import type { MonitorFormData, MonitorPlugin, TagItem } from "../../types";

interface BasicSettingsSectionProps {
  mode: "create" | "edit";
  showTemplates: boolean;
  formData: MonitorFormData;
  formErrors: Record<string, string>;
  formTouched: Record<string, boolean>;
  tagInput: string;
  selectedTags: string[];
  allTags: TagItem[];
  folders: { id: string; name: string }[];
  availablePlugins: MonitorPlugin[];
  selectedPlugin: MonitorPlugin | null;
  onSetShowTemplates: (v: boolean) => void;
  onSetFormData: (data: MonitorFormData) => void;
  onSetFormErrors: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  onSetFormTouched: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  onSetTagInput: (v: string) => void;
  onSetSelectedTags: React.Dispatch<React.SetStateAction<string[]>>;
  onApplyTemplate: (t: MonitorTemplate) => void;
}

export function BasicSettingsSection({
  mode,
  showTemplates,
  formData,
  formErrors,
  formTouched,
  tagInput,
  selectedTags,
  allTags,
  folders,
  availablePlugins,
  selectedPlugin,
  onSetShowTemplates,
  onSetFormData,
  onSetFormErrors,
  onSetFormTouched,
  onSetTagInput,
  onSetSelectedTags,
  onApplyTemplate,
}: BasicSettingsSectionProps) {
  return (
    <>
      {mode === "create" && showTemplates && (
        <div className="rounded-xl border border-border/60 p-3 bg-surface-elevated/30">
          <MonitorTemplates onSelect={onApplyTemplate} />
          <div className="mt-3 pt-3 border-t border-border/40">
            <button
              type="button"
              onClick={() => onSetShowTemplates(false)}
              className="text-xs text-text-secondary hover:text-accent transition-colors"
            >
              Start from scratch →
            </button>
          </div>
        </div>
      )}

      {mode === "create" && !showTemplates && (
        <button
          type="button"
          onClick={() => onSetShowTemplates(true)}
          className="text-xs text-text-secondary hover:text-accent transition-colors flex items-center gap-1"
        >
          ← Use a template
        </button>
      )}

      {/* Monitor Name */}
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">
          Monitor Name <span className="text-danger" aria-hidden="true">*</span>
        </label>
        <input
          type="text"
          value={formData.name}
          onChange={(e) => {
            onSetFormData({ ...formData, name: e.target.value });
            if (formTouched.name) onSetFormErrors((prev) => ({ ...prev, name: e.target.value.trim().length < 2 ? "Name must be at least 2 characters" : "" }));
          }}
          onBlur={() => onSetFormTouched((t) => ({ ...t, name: true }))}
          className={`${inputClass} ${formTouched.name && formErrors.name ? "border-danger focus:ring-danger" : ""}`}
          placeholder="My API"
          aria-required="true"
          aria-invalid={formTouched.name && !!formErrors.name}
          aria-describedby={formErrors.name ? "name-error" : undefined}
        />
        {formTouched.name && formErrors.name && (
          <p id="name-error" role="alert" className="mt-1 text-xs text-danger">{formErrors.name}</p>
        )}
      </div>

      {/* Type + Plugin */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1">Type</label>
          <select
            value={formData.type}
            onChange={(e) => {
              const nextType = e.target.value as typeof formData.type;
              onSetFormData({
                ...formData,
                type: nextType,
                pluginId: "",
                expectedText: "",
                heartbeatTimeoutMin: nextType === "HEARTBEAT" ? formData.heartbeatTimeoutMin || 5 : formData.heartbeatTimeoutMin,
                heartbeatToken: nextType === "HEARTBEAT" ? (formData.heartbeatToken || crypto.randomUUID()) : formData.heartbeatToken,
              });
            }}
            className={inputClass}
          >
            <option value="HTTP">HTTP Check</option>
            <option value="TCP">TCP Port</option>
            <option value="SSL_CERT">SSL Certificate</option>
            <option value="HEARTBEAT">Heartbeat</option>
            <option value="DNS">DNS Lookup</option>
            <option value="PING">ICMP Ping</option>
            <option value="SMTP">SMTP Email Server</option>
            <option value="FTP">FTP Server</option>
            <option value="IMAP">IMAP Mail Server</option>
            <option value="POP3">POP3 Mail Server</option>
            <option value="BROWSER">Browser / Page Check</option>
            <option value="WHOIS">WHOIS Domain Expiry</option>
            <option value="CT_LOG">CT Log Monitor</option>
            <option value="GRAPHQL">GraphQL API Monitor</option>
            <option value="TRANSACTION">Multi-Step Transaction</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1">Check Plugin</label>
          <select
            value={formData.pluginId}
            onChange={(e) => onSetFormData({ ...formData, pluginId: e.target.value, expectedText: "" })}
            className={inputClass}
          >
            <option value="">Built-in check logic</option>
            {availablePlugins.map((plugin) => (
              <option key={plugin.id} value={plugin.id}>
                {plugin.displayName}
              </option>
            ))}
          </select>
          {selectedPlugin?.description && (
            <p className="mt-1 text-xs text-text-secondary">{selectedPlugin.description}</p>
          )}
        </div>
      </div>

      {/* Expected response text (plugin-specific) */}
      {formData.pluginId === "http.response-match" && (
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1">
            Expected response text <span className="text-danger" aria-hidden="true">*</span>
          </label>
          <input
            type="text"
            value={formData.expectedText}
            onChange={(e) => {
              onSetFormData({ ...formData, expectedText: e.target.value });
              if (formTouched.expectedText) onSetFormErrors((prev) => ({ ...prev, expectedText: !e.target.value.trim() ? "Expected text is required" : "" }));
            }}
            onBlur={() => onSetFormTouched((t) => ({ ...t, expectedText: true }))}
            className={`${inputClass} ${formTouched.expectedText && formErrors.expectedText ? "border-danger focus:ring-danger" : ""}`}
            placeholder={selectedPlugin?.configFields?.[0]?.placeholder ?? "OK"}
            aria-invalid={formTouched.expectedText && !!formErrors.expectedText}
          />
          {formTouched.expectedText && formErrors.expectedText ? (
            <p role="alert" className="mt-1 text-xs text-danger">{formErrors.expectedText}</p>
          ) : (
            <p className="mt-1 text-xs text-text-secondary">
              {selectedPlugin?.configFields?.[0]?.helpText ?? "Case-sensitive substring that must be present in the response body."}
            </p>
          )}
        </div>
      )}

      {/* Target */}
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">
          Target <span className="text-danger" aria-hidden="true">*</span>
        </label>
        <input
          type="text"
          value={formData.target}
          onChange={(e) => {
            onSetFormData({ ...formData, target: e.target.value });
            if (formTouched.target) {
              let err = "";
              const nextTarget = e.target.value.trim();
              if (!nextTarget) err = "Target is required";
              else if (formData.type === "HTTP") { try { new URL(nextTarget); } catch { err = "Must be a valid URL"; } }
              else if (formData.type === "TCP" && !/^[^:\s]+:\d+$/.test(nextTarget)) err = "Must be host:port";
              else if (formData.type === "SMTP" && !/^[^:\s]+:\d+$/.test(nextTarget)) err = "Must be host:port (e.g. mail.example.com:25)";
              onSetFormErrors((prev) => ({ ...prev, target: err }));
            }
          }}
          onBlur={() => onSetFormTouched((t) => ({ ...t, target: true }))}
          className={`${inputClass} ${formTouched.target && formErrors.target ? "border-danger focus:ring-danger" : ""}`}
          placeholder={targetPlaceholder(formData.type)}
          aria-required="true"
          aria-invalid={formTouched.target && !!formErrors.target}
          aria-describedby={formErrors.target ? "target-error" : "target-hint"}
        />
        {formTouched.target && formErrors.target ? (
          <p id="target-error" role="alert" className="mt-1 text-xs text-danger">{formErrors.target}</p>
        ) : (
          <p id="target-hint" className="mt-1 text-xs text-text-secondary">{targetHelperText(formData.type)}</p>
        )}
      </div>


      {/* Tags */}
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">Tags</label>
        {selectedTags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {selectedTags.map((tag) => {
              const tagObj = allTags.find((t) => t.name === tag);
              return (
                <span
                  key={tag}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                  style={{ backgroundColor: (tagObj?.color ?? "#6366f1") + "22", color: tagObj?.color ?? "#6366f1" }}
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => onSetSelectedTags((prev) => prev.filter((t) => t !== tag))}
                    aria-label={`Remove tag ${tag}`}
                    className="hover:opacity-70"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              );
            })}
          </div>
        )}
        <input
          type="text"
          value={tagInput}
          onChange={(e) => onSetTagInput(e.target.value)}
          onKeyDown={(e) => {
            if ((e.key === "Enter" || e.key === ",") && tagInput.trim()) {
              e.preventDefault();
              const newTag = tagInput.trim().replace(/,+$/, "").trim();
              if (newTag && !selectedTags.includes(newTag)) {
                onSetSelectedTags((prev) => [...prev, newTag]);
              }
              onSetTagInput("");
            }
          }}
          className={inputClass}
          placeholder="Type a tag name, press Enter or comma"
        />
        {allTags.filter((t) => !selectedTags.includes(t.name)).length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {allTags
              .filter((t) => !selectedTags.includes(t.name))
              .map((tag) => (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => onSetSelectedTags((prev) => [...prev, tag.name])}
                  className="px-2 py-0.5 rounded-full text-xs border transition-colors hover:opacity-80"
                  style={{ borderColor: tag.color + "80", color: tag.color }}
                >
                  + {tag.name}
                </button>
              ))}
          </div>
        )}
      </div>

      {/* Folder */}
      {folders.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1">Project</label>
          <select
            value={formData.folderId}
            onChange={(e) => onSetFormData({ ...formData, folderId: e.target.value })}
            className={inputClass}
          >
            <option value="">(No project)</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Enabled toggle */}
      <label className="flex items-center gap-3 py-1">
        <input
          type="checkbox"
          checked={formData.enabled}
          onChange={(e) => onSetFormData({ ...formData, enabled: e.target.checked })}
          className="w-5 h-5 rounded border-border bg-surface text-accent focus:ring-accent"
        />
        <span className="text-sm text-text-primary">Enabled</span>
      </label>
    </>
  );
}

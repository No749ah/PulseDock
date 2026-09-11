"use client";

import React from "react";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import type { MonitorTemplate } from "../../components/MonitorTemplates";
import { inputClass } from "../constants";
import type { MonitorPlugin, TagItem, MonitorFormData, MonitorFormDataExtended, TransactionStep } from "../types";

// Sub-components
import { BasicSettingsSection } from "./form/BasicSettingsSection";
import { HttpConfigSection } from "./form/HttpConfigSection";
import { SmtpConfigSection } from "./form/SmtpConfigSection";
import { HeartbeatConfigSection } from "./form/HeartbeatConfigSection";
import { TcpConfigSection } from "./form/TcpConfigSection";
import { SslConfigSection } from "./form/SslConfigSection";
import { DnsConfigSection } from "./form/DnsConfigSection";
import { PingConfigSection } from "./form/PingConfigSection";
import { BrowserConfigSection } from "./form/BrowserConfigSection";
import { WhoisConfigSection } from "./form/WhoisConfigSection";
import { FtpConfigSection, ImapConfigSection, Pop3ConfigSection } from "./form/FtpImapPop3ConfigSection";
import { CtLogConfigSection } from "./form/CtLogConfigSection";
import { GraphqlConfigSection } from "./form/GraphqlConfigSection";
import { TransactionStepBuilder } from "./form/TransactionStepBuilder";
import { AdvancedSettingsSection } from "./form/AdvancedSettingsSection";
import { AlertChannelsSection } from "./form/AlertChannelsSection";

// Re-export inputClass so consumers that import it from here still work
export { inputClass };

interface MonitorFormModalProps {
  isOpen: boolean;
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
  onClose: () => void;
  onCancel: () => void;
  onSubmit: () => void;
  onSetShowTemplates: (v: boolean) => void;
  onSetFormData: (data: MonitorFormData) => void;
  onSetFormErrors: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  onSetFormTouched: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  onSetTagInput: (v: string) => void;
  onSetSelectedTags: React.Dispatch<React.SetStateAction<string[]>>;
  onApplyTemplate: (t: MonitorTemplate) => void;
  onCopySuccess: (msg: string) => void;
}

export function MonitorFormModal({
  isOpen,
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
  onClose,
  onCancel,
  onSubmit,
  onSetShowTemplates,
  onSetFormData,
  onSetFormErrors,
  onSetFormTouched,
  onSetTagInput,
  onSetSelectedTags,
  onApplyTemplate,
  onCopySuccess,
}: MonitorFormModalProps) {
  // Cast helpers — sections use extended type internally
  const fd = formData as MonitorFormDataExtended & {
    ehlo?: string;
    checkTls?: boolean;
    dnsRecordType?: string;
    dnsExpectedValue?: string;
    dnsTimeoutMs?: number;
    dnsDetectChanges?: boolean;
    pingCount?: number;
    pingMaxLossPct?: number;
    browserExpectedText?: string;
    browserSelector?: string;
    browserStatusCodesRaw?: string;
    whoisWarnDays?: number;
    whoisCriticalDays?: number;
    ctLogLookbackDays?: number;
    ctLogAlertOnNewSubdomains?: boolean;
    ctLogAlertOnWildcard?: boolean;
    transactionSteps?: TransactionStep[];
    adaptiveIntervalEnabled?: boolean;
    adaptiveIntervalDownSec?: number | null;
    adaptiveIntervalDegradedSec?: number | null;
    statusWebhookUrl?: string;
    statusWebhookSecret?: string;
    priority?: number;
    downtimeCostPerHour?: number | null;
  };

  // Unified setter that casts back to MonitorFormData for parent
  const setFd = (data: typeof fd) => onSetFormData(data as MonitorFormData);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={mode === "create" ? "New Monitor" : "Edit Monitor"}
      size="xl"
      actions={
        <>
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={onSubmit}>
            {mode === "create" ? "Create" : "Update"}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {/* ── Basic Settings ─────────────────────────────────────────────────── */}
        <BasicSettingsSection
          mode={mode}
          showTemplates={showTemplates}
          formData={formData}
          formErrors={formErrors}
          formTouched={formTouched}
          tagInput={tagInput}
          selectedTags={selectedTags}
          allTags={allTags}
          folders={folders}
          availablePlugins={availablePlugins}
          selectedPlugin={selectedPlugin}
          onSetShowTemplates={onSetShowTemplates}
          onSetFormData={onSetFormData}
          onSetFormErrors={onSetFormErrors}
          onSetFormTouched={onSetFormTouched}
          onSetTagInput={onSetTagInput}
          onSetSelectedTags={onSetSelectedTags}
          onApplyTemplate={onApplyTemplate}
        />

        {/* ── Type-specific config ────────────────────────────────────────────── */}

        {formData.type === "HTTP" && (
          <HttpConfigSection formData={fd} onSetFormData={setFd} />
        )}

        {formData.type === "HEARTBEAT" && (
          <HeartbeatConfigSection formData={fd} formErrors={formErrors} onSetFormData={setFd} onCopySuccess={onCopySuccess} />
        )}

        {formData.type === "TCP" && (
          <TcpConfigSection formData={fd} onSetFormData={setFd} />
        )}

        {formData.type === "SSL_CERT" && (
          <SslConfigSection formData={fd} onSetFormData={setFd} />
        )}

        {formData.type === "SMTP" && (
          <SmtpConfigSection formData={fd} onSetFormData={setFd} />
        )}

        {formData.type === "DNS" && (
          <DnsConfigSection formData={fd} onSetFormData={setFd} />
        )}

        {formData.type === "PING" && (
          <PingConfigSection formData={fd} onSetFormData={setFd} />
        )}

        {formData.type === "BROWSER" && (
          <BrowserConfigSection formData={fd} onSetFormData={setFd} />
        )}

        {formData.type === "WHOIS" && (
          <WhoisConfigSection formData={fd} onSetFormData={setFd} />
        )}

        {formData.type === "FTP" && (
          <FtpConfigSection formData={fd} onSetFormData={setFd} />
        )}

        {formData.type === "IMAP" && (
          <ImapConfigSection formData={fd} onSetFormData={setFd} />
        )}

        {formData.type === "POP3" && (
          <Pop3ConfigSection formData={fd} onSetFormData={setFd} />
        )}

        {formData.type === "CT_LOG" && (
          <CtLogConfigSection formData={fd} onSetFormData={setFd} />
        )}

        {formData.type === "GRAPHQL" && (
          <GraphqlConfigSection formData={fd} onSetFormData={setFd} />
        )}

        {formData.type === "TRANSACTION" && (
          <TransactionStepBuilder
            steps={fd.transactionSteps ?? []}
            onChange={(steps) => setFd({ ...fd, transactionSteps: steps })}
            inputClass={inputClass}
          />
        )}

        <AlertChannelsSection />

        {/* ── Advanced Settings ───────────────────────────────────────────────── */}
        <AdvancedSettingsSection
          formData={fd}
          formErrors={formErrors}
          formTouched={formTouched}
          onSetFormData={setFd}
          onSetFormErrors={onSetFormErrors}
          onSetFormTouched={onSetFormTouched}
        />
      </div>
    </Modal>
  );
}

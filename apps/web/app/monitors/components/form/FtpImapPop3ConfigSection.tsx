"use client";

import React from "react";
import type { MonitorFormData } from "../../types";

type TlsFormData = MonitorFormData & { checkTls?: boolean };

interface Props {
  formData: TlsFormData;
  onSetFormData: (data: TlsFormData) => void;
}

export function FtpConfigSection({ formData, onSetFormData }: Props) {
  return (
    <>
      <div className="rounded-xl border border-accent/20 bg-accent/5 p-3">
        <p className="text-xs text-text-secondary leading-relaxed">
          <span className="font-medium text-text-primary">FTP Server</span> — connects to the FTP server and reads the 220 banner. Optionally tests AUTH TLS support. Enter{" "}
          <code className="bg-surface-2 px-1 rounded">host:port</code> (default port: 21).
        </p>
      </div>
      <div className="flex items-center gap-3">
        <input type="checkbox" id="ftpCheckTls" checked={formData.checkTls ?? false} onChange={(e) => onSetFormData({ ...formData, checkTls: e.target.checked })} className="w-4 h-4 rounded border border-border bg-surface accent-accent" />
        <label htmlFor="ftpCheckTls" className="text-sm text-text-primary cursor-pointer">Test AUTH TLS (FTPS explicit)</label>
      </div>
      <p className="text-xs text-text-secondary -mt-1">When enabled, sends AUTH TLS after banner. Warns if TLS is not supported, fails if connection error occurs.</p>
    </>
  );
}

export function ImapConfigSection({ formData, onSetFormData }: Props) {
  return (
    <>
      <div className="rounded-xl border border-accent/20 bg-accent/5 p-3">
        <p className="text-xs text-text-secondary leading-relaxed">
          <span className="font-medium text-text-primary">IMAP Mail Server</span> — connects to the IMAP server and reads the greeting. Optionally tests STARTTLS support. Enter{" "}
          <code className="bg-surface-2 px-1 rounded">host:port</code> (default port: 143 plain, 993 TLS).
        </p>
      </div>
      <div className="flex items-center gap-3">
        <input type="checkbox" id="imapCheckTls" checked={formData.checkTls ?? false} onChange={(e) => onSetFormData({ ...formData, checkTls: e.target.checked })} className="w-4 h-4 rounded border border-border bg-surface accent-accent" />
        <label htmlFor="imapCheckTls" className="text-sm text-text-primary cursor-pointer">Test STARTTLS upgrade</label>
      </div>
      <p className="text-xs text-text-secondary -mt-1">When enabled, sends STARTTLS after greeting. Warns if not supported.</p>
    </>
  );
}

export function Pop3ConfigSection({ formData, onSetFormData }: Props) {
  return (
    <>
      <div className="rounded-xl border border-accent/20 bg-accent/5 p-3">
        <p className="text-xs text-text-secondary leading-relaxed">
          <span className="font-medium text-text-primary">POP3 Mail Server</span> — connects to the POP3 server and reads the +OK greeting. Optionally tests STLS support. Enter{" "}
          <code className="bg-surface-2 px-1 rounded">host:port</code> (default port: 110 plain, 995 TLS).
        </p>
      </div>
      <div className="flex items-center gap-3">
        <input type="checkbox" id="pop3CheckTls" checked={formData.checkTls ?? false} onChange={(e) => onSetFormData({ ...formData, checkTls: e.target.checked })} className="w-4 h-4 rounded border border-border bg-surface accent-accent" />
        <label htmlFor="pop3CheckTls" className="text-sm text-text-primary cursor-pointer">Test STLS upgrade</label>
      </div>
      <p className="text-xs text-text-secondary -mt-1">When enabled, sends STLS command after greeting. Warns if not supported.</p>
    </>
  );
}

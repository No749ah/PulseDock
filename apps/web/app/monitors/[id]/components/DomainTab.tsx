"use client";

import React from "react";
import { Globe } from "lucide-react";
import { Card } from "../../../components/Card";
import type { MonitorItem, MonitorRun } from "./types";

interface Props {
  monitor: MonitorItem;
  runs: MonitorRun[];
  lastRun: MonitorRun | null;
}

export function DomainTab({ monitor, runs, lastRun }: Props) {
  let daysRemaining: number | null = null;
  let expiryDate: string | null = null;
  let domainName: string | null = null;
  let expiryStatus: "green" | "yellow" | "red" | "unknown" = "unknown";
  let notPublished = false;
  let notFound = false;

  const msg = lastRun?.message ?? "";

  const domainMatch = msg.match(/["\u201c\u201d]([^"\u201c\u201d]+)["\u201c\u201d]/);
  if (domainMatch) domainName = domainMatch[1];
  if (!domainName) {
    const whoisMatch = msg.match(/WHOIS:\s+([^\s\u2014\u2013]+)/);
    if (whoisMatch) domainName = whoisMatch[1];
  }

  const expiresMatch = msg.match(/expires in (\d+)d \((\d{4}-\d{2}-\d{2})\)/);
  if (expiresMatch) {
    daysRemaining = parseInt(expiresMatch[1], 10);
    expiryDate = expiresMatch[2];
  }

  const expiredMatch = msg.match(/expired on (\d{4}-\d{2}-\d{2})/);
  if (expiredMatch) {
    expiryDate = expiredMatch[1];
    daysRemaining = 0;
  }

  if (lastRun?.level === "green") expiryStatus = "green";
  else if (lastRun?.level === "yellow") expiryStatus = "yellow";
  else if (lastRun?.level === "red") expiryStatus = "red";

  if (msg.includes("expiry date not published")) notPublished = true;
  if (msg.includes("not found in WHOIS")) notFound = true;

  const statusBannerClass =
    expiryStatus === "green"
      ? "bg-success/10 border-success/30 text-success"
      : expiryStatus === "yellow"
      ? "bg-yellow-400/10 border-yellow-400/30 text-yellow-400"
      : expiryStatus === "red"
      ? "bg-danger/10 border-danger/30 text-danger"
      : "bg-surface-elevated border-border text-text-secondary";

  const expiryBarWidth =
    daysRemaining !== null && daysRemaining > 0 ? Math.min(100, Math.round((daysRemaining / 365) * 100)) : 0;

  const expiryBarColor =
    expiryStatus === "green" ? "bg-success" : expiryStatus === "yellow" ? "bg-yellow-400" : "bg-danger";

  const whoisRuns = runs.slice(0, 30);

  const levelColors: Record<string, string> = {
    green: "text-success",
    yellow: "text-yellow-400",
    red: "text-danger",
  };

  return (
    <Card className="p-4 space-y-5">
      <div className="flex items-center gap-2">
        <Globe className="w-4 h-4 text-accent" />
        <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">WHOIS Domain Expiry</h2>
      </div>

      <div className={`flex items-start gap-3 p-4 rounded-xl border ${statusBannerClass}`}>
        <Globe className="w-5 h-5 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm">
            {notFound
              ? "Domain not found in WHOIS"
              : notPublished
              ? "Expiry date not published by registrar"
              : daysRemaining !== null && daysRemaining <= 0
              ? "Domain has expired"
              : daysRemaining !== null
              ? `Expires in ${daysRemaining} day${daysRemaining !== 1 ? "s" : ""}`
              : "No data yet — run a check to see expiry info"}
          </p>
          {domainName && <p className="text-xs opacity-75 mt-0.5 font-mono">{domainName}</p>}
          {expiryDate && (
            <p className="text-xs opacity-75 mt-0.5">
              Expiry date:{" "}
              <span className="font-medium">
                {new Date(expiryDate + "T00:00:00Z").toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </span>
            </p>
          )}
        </div>
        {daysRemaining !== null && daysRemaining > 0 && (
          <div className="text-right flex-shrink-0">
            <p className="text-3xl font-bold tabular-nums leading-none">{daysRemaining}</p>
            <p className="text-xs opacity-75 mt-0.5">days left</p>
          </div>
        )}
      </div>

      {daysRemaining !== null && daysRemaining > 0 && (
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs text-text-muted">
            <span>Today</span>
            <span>{daysRemaining}d remaining out of 365d shown</span>
            <span>Expiry: {expiryDate ?? "—"}</span>
          </div>
          <div className="h-2 bg-surface-elevated rounded-full overflow-hidden border border-border">
            <div
              className={`h-full rounded-full transition-all duration-500 ${expiryBarColor}`}
              style={{ width: `${expiryBarWidth}%` }}
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 rounded-lg bg-surface-elevated border border-border">
          <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-1">Warn Threshold</p>
          <p className="text-lg font-bold text-yellow-400 tabular-nums">
            {(monitor.config as { warnDays?: number } | null)?.warnDays ?? 30}d
          </p>
          <p className="text-xs text-text-secondary">Yellow alert below this</p>
        </div>
        <div className="p-3 rounded-lg bg-surface-elevated border border-border">
          <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-1">Critical Threshold</p>
          <p className="text-lg font-bold text-danger tabular-nums">
            {(monitor.config as { criticalDays?: number } | null)?.criticalDays ?? 7}d
          </p>
          <p className="text-xs text-text-secondary">Red alert below this</p>
        </div>
      </div>

      {whoisRuns.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">Recent Checks</p>
          <div className="space-y-1.5 max-h-72 overflow-y-auto">
            {whoisRuns.map((run, idx) => {
              const runDaysMatch = run.message?.match(/expires in (\d+)d/);
              const runDays = runDaysMatch ? parseInt(runDaysMatch[1], 10) : null;
              return (
                <div
                  key={idx}
                  className="flex items-center gap-3 py-1.5 px-2 rounded-lg hover:bg-white/3 transition-colors"
                >
                  <span
                    className={`text-xs font-medium w-12 tabular-nums ${
                      run.level ? (levelColors[run.level] ?? "text-text-secondary") : "text-text-secondary"
                    }`}
                  >
                    {run.level?.toUpperCase() ?? "—"}
                  </span>
                  <span className="text-xs text-text-muted w-36 flex-shrink-0">
                    {new Date(run.checkedAt).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <span className="text-xs text-text-secondary truncate flex-1">
                    {runDays !== null
                      ? `${runDays}d remaining`
                      : run.message?.length && run.message.length > 60
                      ? run.message.slice(0, 60) + "…"
                      : (run.message ?? "—")}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {whoisRuns.length === 0 && (
        <div className="text-center py-6 text-text-muted text-sm">
          No checks yet — trigger a manual check to see domain expiry data.
        </div>
      )}
    </Card>
  );
}

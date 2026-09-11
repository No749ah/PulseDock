"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Server } from "lucide-react";
import { api } from "../../../lib/api";
import { Card } from "../../components/Card";
import { brand } from "../../../lib/brand";

interface SystemInfo {
  version: string;
  nodeVersion: string;
  uptime: number;
  database: string;
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  parts.push(`${m}m`);
  return parts.join(" ");
}

export function SystemInfoCard({ userId }: { userId?: string }) {
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api<SystemInfo>("/v2/system/info", userId)
      .then(setInfo)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load system info"))
      .finally(() => setLoading(false));
  }, [userId]);

  const rows: Array<{ label: string; value: string }> = info
    ? [
        { label: `${brand.name} Version`, value: info.version },
        { label: "Node.js Version", value: info.nodeVersion },
        { label: "Uptime", value: formatUptime(Math.round(info.uptime)) },
        { label: "Database", value: info.database },
      ]
    : [];

  return (
    <Card>
      <div className="flex items-center gap-3 mb-5">
        <div className="p-2.5 rounded-xl bg-surface-elevated">
          <Server className="w-5 h-5 text-text-secondary" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-text-primary">System Info</h2>
          <p className="text-sm text-text-secondary mt-0.5">Runtime environment details</p>
        </div>
      </div>

      {loading && (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-9 rounded-lg bg-surface-elevated/50 animate-pulse" />
          ))}
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-danger/10 border border-danger/20">
          <AlertCircle className="w-4 h-4 text-danger mt-0.5 shrink-0" />
          <span className="text-danger text-sm">{error}</span>
        </div>
      )}

      {!loading && !error && info && (
        <dl className="divide-y divide-border">
          {rows.map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between py-2.5 px-1">
              <dt className="text-sm text-text-secondary">{label}</dt>
              <dd className="text-sm font-mono text-text-primary bg-surface-elevated px-2.5 py-1 rounded-md">{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </Card>
  );
}

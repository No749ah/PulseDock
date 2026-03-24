"use client";

import { useState } from "react";
import { CheckCircle2, Copy, Database, Info, Key } from "lucide-react";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { brand } from "../../../lib/brand";

export function GrafanaIntegrationCard() {
  const [copied, setCopied] = useState(false);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const datasourceUrl = `${origin}/api/v1/grafana`;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(datasourceUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card>
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2.5 rounded-xl bg-accent/10">
          <Database className="w-5 h-5 text-accent" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-text-primary">Grafana Integration</h2>
          <p className="text-xs text-text-secondary mt-0.5">Connect {brand.name} to Grafana using the SimpleJSON datasource plugin</p>
        </div>
      </div>

      <div className="space-y-4">
        {/* Datasource URL */}
        <div>
          <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2">Datasource URL</label>
          <div className="flex items-center gap-2">
            <code className="flex-1 px-4 py-3 bg-surface border border-border rounded-lg text-sm font-mono text-text-primary break-all">
              {datasourceUrl}
            </code>
            <Button variant="secondary" size="sm" onClick={handleCopy} className="shrink-0" title="Copy datasource URL">
              {copied ? (
                <CheckCircle2 className="w-4 h-4 text-success" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </Button>
          </div>
        </div>

        {/* Auth instructions */}
        <div className="flex items-start gap-3 p-4 rounded-lg bg-surface-elevated/50 border border-border">
          <Key className="w-4 h-4 text-accent shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-text-primary">Authentication</p>
            <p className="text-xs text-text-secondary mt-0.5">
              Use an API key (<code className="font-mono">pdck_...</code>) as Bearer token in Grafana datasource settings.
              Set <strong className="text-text-primary">Authorization header</strong>:{" "}
              <code className="font-mono text-xs bg-surface px-1.5 py-0.5 rounded">Bearer pdck_...</code>
            </p>
          </div>
        </div>

        {/* Available metrics */}
        <div>
          <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2">Available Metrics</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {[
              { metric: "<monitorName>.uptime", desc: "Uptime percentage" },
              { metric: "<monitorName>.latency", desc: "Response time (ms)" },
              { metric: "<monitorName>.status", desc: "Current status (0/1)" },
              { metric: "all_monitors.table", desc: "All monitors overview" },
            ].map(({ metric, desc }) => (
              <div key={metric} className="flex flex-col gap-0.5 px-3 py-2.5 rounded-lg bg-surface-elevated/50 border border-border">
                <code className="text-xs font-mono text-accent">{metric}</code>
                <span className="text-[11px] text-text-secondary">{desc}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Docs link */}
        <a
          href="https://grafana.com/grafana/plugins/simpod-json-datasource/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm text-accent hover:text-accent/80 transition-colors"
        >
          <Info className="w-4 h-4" />
          Grafana SimpleJSON plugin docs
        </a>
      </div>
    </Card>
  );
}

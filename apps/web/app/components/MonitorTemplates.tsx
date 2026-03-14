"use client";

import { Zap } from "lucide-react";

export interface MonitorTemplate {
  label: string;
  description: string;
  name: string;
  type: "HTTP" | "GIT_RELEASE" | "DOCKER_IMAGE";
  target: string;
  intervalSec: number;
  pluginId?: string;
  expectedText?: string;
}

export const MONITOR_TEMPLATES: MonitorTemplate[] = [
  // HTTP templates
  {
    label: "HTTP Health Check",
    description: "Poll any HTTP endpoint every 60s",
    name: "My API Health",
    type: "HTTP",
    target: "https://api.example.com/health",
    intervalSec: 60,
  },
  {
    label: "HTTP Response Match",
    description: "Verify a specific text is present in the response body",
    name: "Website Uptime",
    type: "HTTP",
    target: "https://example.com",
    intervalSec: 120,
    pluginId: "http.response-match",
    expectedText: "OK",
  },
  // GitHub Release templates
  {
    label: "GitHub Release",
    description: "Track the latest release of any GitHub repo",
    name: "My Repo Releases",
    type: "GIT_RELEASE",
    target: "owner/repo",
    intervalSec: 3600,
  },
  {
    label: "Node.js Releases",
    description: "Track the official Node.js release",
    name: "Node.js",
    type: "GIT_RELEASE",
    target: "nodejs/node",
    intervalSec: 3600,
  },
  {
    label: "PostgreSQL Releases",
    description: "Track PostgreSQL upstream releases",
    name: "PostgreSQL",
    type: "GIT_RELEASE",
    target: "postgres/postgres",
    intervalSec: 3600,
  },
  // Docker Image templates
  {
    label: "Docker Hub Image",
    description: "Track latest tag of any Docker Hub image",
    name: "My Docker Image",
    type: "DOCKER_IMAGE",
    target: "library/nginx",
    intervalSec: 3600,
  },
  {
    label: "postgres:latest",
    description: "Track the official Postgres Docker image",
    name: "postgres Docker",
    type: "DOCKER_IMAGE",
    target: "library/postgres",
    intervalSec: 3600,
  },
  {
    label: "redis:latest",
    description: "Track the official Redis Docker image",
    name: "redis Docker",
    type: "DOCKER_IMAGE",
    target: "library/redis",
    intervalSec: 3600,
  },
];

interface Props {
  onSelect: (template: MonitorTemplate) => void;
}

const TYPE_COLORS: Record<MonitorTemplate["type"], string> = {
  HTTP: "text-blue-400",
  GIT_RELEASE: "text-purple-400",
  DOCKER_IMAGE: "text-cyan-400",
};

const TYPE_LABELS: Record<MonitorTemplate["type"], string> = {
  HTTP: "HTTP",
  GIT_RELEASE: "Git",
  DOCKER_IMAGE: "Docker",
};

export function MonitorTemplates({ onSelect }: Props) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-text-secondary">
        <Zap className="w-4 h-4" />
        <span className="text-sm font-medium">Quick Templates</span>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {MONITOR_TEMPLATES.map((t) => (
          <button
            key={`${t.type}-${t.label}`}
            type="button"
            onClick={() => onSelect(t)}
            className="text-left px-3 py-2.5 rounded-lg border border-border hover:border-accent/40 hover:bg-surface-elevated/60 transition-all group"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="text-sm font-medium text-text-primary group-hover:text-accent transition-colors leading-snug">
                {t.label}
              </span>
              <span className={`text-[10px] font-semibold uppercase tracking-wider shrink-0 mt-0.5 ${TYPE_COLORS[t.type]}`}>
                {TYPE_LABELS[t.type]}
              </span>
            </div>
            <p className="text-xs text-text-secondary mt-0.5 leading-snug">{t.description}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

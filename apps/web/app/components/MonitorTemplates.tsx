"use client";

import { useState } from "react";
import { Zap, Server, Globe } from "lucide-react";

export interface MonitorTemplate {
  label: string;
  description: string;
  name: string;
  type: "HTTP" | "GIT_RELEASE" | "DOCKER_IMAGE";
  target: string;
  intervalSec: number;
  pluginId?: string;
  expectedText?: string;
  config?: {
    appVersionEndpoint?: string;
    appAuthType?: 'none' | 'token';
  };
  /** If true, template target is a placeholder URL and user must update it */
  requiresUrl?: boolean;
}

interface TemplateGroup {
  id: string;
  label: string;
  icon: React.ReactNode;
  templates: MonitorTemplate[];
}

const GENERAL_TEMPLATES: MonitorTemplate[] = [
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
];

const VERSION_TEMPLATES: MonitorTemplate[] = [
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

/** Self-hosted app uptime templates — target is a placeholder URL, user must update it */
const SELF_HOSTED_TEMPLATES: MonitorTemplate[] = [
  // Container / Orchestration
  {
    label: "Portainer",
    description: "Portainer CE/EE health endpoint",
    name: "Portainer Health",
    type: "HTTP",
    target: "https://portainer.example.com/api/system/status",
    intervalSec: 60,
    config: { appVersionEndpoint: '/api/status', appAuthType: 'none' },
    requiresUrl: true,
  },
  {
    label: "Gitea",
    description: "Gitea instance health check",
    name: "Gitea Health",
    type: "HTTP",
    target: "https://gitea.example.com/api/healthz",
    intervalSec: 60,
    config: { appVersionEndpoint: '/api/v1/version', appAuthType: 'none' },
    requiresUrl: true,
  },
  {
    label: "GitLab CE",
    description: "GitLab CE/-EE health endpoint",
    name: "GitLab Health",
    type: "HTTP",
    target: "https://gitlab.example.com/-/health",
    intervalSec: 60,
    // Version requires auth
    config: { appVersionEndpoint: '/api/v4/version', appAuthType: 'token' },
    requiresUrl: true,
  },
  {
    label: "Grafana",
    description: "Grafana health API",
    name: "Grafana Health",
    type: "HTTP",
    target: "https://grafana.example.com/api/health",
    intervalSec: 60,
    config: { appVersionEndpoint: '/api/health', appAuthType: 'none' },
    requiresUrl: true,
  },
  {
    label: "Nextcloud",
    description: "Nextcloud status endpoint",
    name: "Nextcloud Health",
    type: "HTTP",
    target: "https://nextcloud.example.com/status.php",
    intervalSec: 60,
    config: { appVersionEndpoint: '/status.php', appAuthType: 'none' },
    requiresUrl: true,
  },
  {
    label: "Uptime Kuma",
    description: "Uptime Kuma API status",
    name: "Uptime Kuma Health",
    type: "HTTP",
    target: "https://kuma.example.com/api/entry-page",
    intervalSec: 60,
    // Version requires auth
    config: { appVersionEndpoint: '/api/entry-page', appAuthType: 'token' },
    requiresUrl: true,
  },
  {
    label: "ArgoCD",
    description: "ArgoCD API server health",
    name: "ArgoCD Health",
    type: "HTTP",
    target: "https://argocd.example.com/healthz",
    intervalSec: 120,
    config: { appVersionEndpoint: '/api/version', appAuthType: 'none' },
    requiresUrl: true,
  },
  {
    label: "Vault",
    description: "HashiCorp Vault health endpoint",
    name: "Vault Health",
    type: "HTTP",
    target: "https://vault.example.com/v1/sys/health",
    intervalSec: 60,
    config: { appVersionEndpoint: '/v1/sys/health', appAuthType: 'none' },
    requiresUrl: true,
  },
  {
    label: "Mattermost",
    description: "Mattermost system ping",
    name: "Mattermost Health",
    type: "HTTP",
    target: "https://chat.example.com/api/v4/system/ping",
    intervalSec: 60,
    config: { appVersionEndpoint: '/api/v4/config/client?format=old', appAuthType: 'none' },
    requiresUrl: true,
  },
  {
    label: "Jellyfin",
    description: "Jellyfin media server health",
    name: "Jellyfin Health",
    type: "HTTP",
    target: "https://jellyfin.example.com/health",
    intervalSec: 120,
    config: { appVersionEndpoint: '/System/Info/Public', appAuthType: 'none' },
    requiresUrl: true,
  },
  {
    label: "Immich",
    description: "Immich photo server health",
    name: "Immich Health",
    type: "HTTP",
    target: "https://immich.example.com/api/server-info/ping",
    intervalSec: 120,
    // Version requires auth
    config: { appVersionEndpoint: '/api/server/info', appAuthType: 'token' },
    requiresUrl: true,
  },
  {
    label: "n8n",
    description: "n8n workflow automation health",
    name: "n8n Health",
    type: "HTTP",
    target: "https://n8n.example.com/healthz",
    intervalSec: 120,
    // Version requires auth
    config: { appVersionEndpoint: '/rest/settings', appAuthType: 'token' },
    requiresUrl: true,
  },
  {
    label: "Traefik",
    description: "Traefik proxy health endpoint",
    name: "Traefik Health",
    type: "HTTP",
    target: "https://traefik.example.com/ping",
    intervalSec: 60,
    config: { appVersionEndpoint: '/api/version', appAuthType: 'none' },
    requiresUrl: true,
  },
  {
    label: "MinIO",
    description: "MinIO object storage health",
    name: "MinIO Health",
    type: "HTTP",
    target: "https://minio.example.com/minio/health/live",
    intervalSec: 60,
    // Version requires auth
    config: { appVersionEndpoint: '/api/v1/service/status', appAuthType: 'token' },
    requiresUrl: true,
  },
  {
    label: "Keycloak",
    description: "Keycloak IAM health endpoint",
    name: "Keycloak Health",
    type: "HTTP",
    target: "https://auth.example.com/health",
    intervalSec: 60,
    // Version requires auth
    config: { appVersionEndpoint: '/admin/serverinfo', appAuthType: 'token' },
    requiresUrl: true,
  },
  {
    label: "Home Assistant",
    description: "Home Assistant API status",
    name: "Home Assistant Health",
    type: "HTTP",
    target: "https://homeassistant.example.com/api/",
    intervalSec: 60,
    // Version requires auth
    config: { appVersionEndpoint: '/api/config', appAuthType: 'token' },
    requiresUrl: true,
  },
  {
    label: "Prometheus",
    description: "Prometheus metrics server",
    name: "Prometheus Health",
    type: "HTTP",
    target: "https://prometheus.example.com/-/healthy",
    intervalSec: 60,
    config: { appVersionEndpoint: '/api/v1/status/buildinfo', appAuthType: 'none' },
    requiresUrl: true,
  },
  {
    label: "Authentik",
    description: "Authentik SSO health check",
    name: "Authentik Health",
    type: "HTTP",
    target: "https://auth.example.com/-/health/ready/",
    intervalSec: 60,
    // Version requires auth
    config: { appVersionEndpoint: '/-/api/v3/admin/version/', appAuthType: 'token' },
    requiresUrl: true,
  },
  {
    label: "Authelia",
    description: "Authelia auth proxy health",
    name: "Authelia Health",
    type: "HTTP",
    target: "https://auth.example.com/api/health",
    intervalSec: 60,
    // Version requires auth
    config: { appVersionEndpoint: '/api/configuration', appAuthType: 'token' },
    requiresUrl: true,
  },
  {
    label: "Plausible Analytics",
    description: "Plausible analytics server",
    name: "Plausible Health",
    type: "HTTP",
    target: "https://analytics.example.com/api/health",
    intervalSec: 120,
    // Version requires auth
    config: { appVersionEndpoint: '', appAuthType: 'token' },
    requiresUrl: true,
  },
];

export const MONITOR_TEMPLATES: MonitorTemplate[] = [
  ...GENERAL_TEMPLATES,
  ...SELF_HOSTED_TEMPLATES,
];

const TEMPLATE_GROUPS: TemplateGroup[] = [
  {
    id: "general",
    label: "General",
    icon: <Globe className="w-4 h-4" />,
    templates: GENERAL_TEMPLATES,
  },
  {
    id: "self-hosted",
    label: "Self-Hosted Apps",
    icon: <Server className="w-4 h-4" />,
    templates: SELF_HOSTED_TEMPLATES,
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
  const [activeGroup, setActiveGroup] = useState("general");
  const group = TEMPLATE_GROUPS.find((g) => g.id === activeGroup) ?? TEMPLATE_GROUPS[0];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-text-secondary">
        <Zap className="w-4 h-4" />
        <span className="text-sm font-medium">Quick Templates</span>
      </div>

      {/* Group tabs */}
      <div className="flex gap-1 rounded-lg bg-surface p-1 border border-border">
        {TEMPLATE_GROUPS.map((g) => (
          <button
            key={g.id}
            type="button"
            onClick={() => setActiveGroup(g.id)}
            className={`flex items-center gap-1.5 flex-1 justify-center px-2 py-1.5 text-xs font-medium rounded-md transition-all ${
              activeGroup === g.id
                ? "bg-bg text-text-primary shadow-sm border border-border"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            {g.icon}
            <span className="hidden sm:inline">{g.label}</span>
          </button>
        ))}
      </div>

      {/* Self-hosted notice */}
      {activeGroup === "self-hosted" && (
        <p className="text-xs text-text-secondary bg-surface rounded-lg px-3 py-2 border border-border">
          💡 Replace <code className="text-accent font-mono">example.com</code> with your instance domain after selecting.
        </p>
      )}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {group.templates.map((t) => (
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

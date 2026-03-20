/**
 * Tool Variant Definitions
 *
 * Platform/edition variants for tools that have multiple deployment types
 * (OSS/EE, CE/EE, Docker/Kubernetes/Cloud, etc.).
 *
 * Variants override or supplement the base registry entry fields when a
 * user selects a specific platform in the setup UI. This enables accurate
 * version endpoint auto-configuration per deployment type.
 *
 * Format: Map<toolId, ToolVariant[]>
 *
 * Evidence policy: each variant must reference its endpoint docs via evidenceUrl.
 */

import type { ToolVariant } from './types';

export const TOOL_VARIANTS: Record<string, ToolVariant[]> = {

  'gitlab-ce': [
    {
      id: 'ce',
      label: 'Community Edition (CE / Self-Hosted)',
      description: 'GitLab CE running on your own server. Requires admin API token to fetch version.',
      requiresInstanceUrl: true,
      authRequired: true,
      urlPlaceholder: 'https://gitlab.example.com',
      versionSource: {
        type: 'json-path',
        urlTemplate: '{{instanceUrl}}/api/v4/version',
        jsonPath: '$.version',
        authRequired: true,
      },
      latestSource: {
        type: 'gitlab-releases',
        target: 'gitlab-org/gitlab-foss',
        host: 'gitlab.com',
      },
      evidenceUrl: 'https://docs.gitlab.com/ee/api/version.html',
    },
    {
      id: 'ee',
      label: 'Enterprise Edition (EE / Self-Hosted)',
      description: 'GitLab EE on your own server. Same version API as CE.',
      requiresInstanceUrl: true,
      authRequired: true,
      urlPlaceholder: 'https://gitlab.example.com',
      versionSource: {
        type: 'json-path',
        urlTemplate: '{{instanceUrl}}/api/v4/version',
        jsonPath: '$.version',
        authRequired: true,
      },
      latestSource: {
        type: 'github-releases',
        target: 'gitlabhq/gitlabhq',
      },
      evidenceUrl: 'https://docs.gitlab.com/ee/api/version.html',
    },
    {
      id: 'cloud',
      label: 'GitLab.com (Cloud)',
      description: 'GitLab SaaS — tracks upstream release version via GitHub.',
      requiresInstanceUrl: false,
      authRequired: false,
      latestSource: {
        type: 'github-releases',
        target: 'gitlabhq/gitlabhq',
      },
      versionSource: {
        type: 'github-releases',
        target: 'gitlabhq/gitlabhq',
      },
      evidenceUrl: 'https://gitlab.com/gitlab-org/gitlab/-/releases',
    },
  ],

  'grafana': [
    {
      id: 'oss',
      label: 'Grafana OSS (Self-Hosted)',
      description: 'Open-source Grafana running locally or on a server. Version available unauthenticated.',
      requiresInstanceUrl: true,
      authRequired: false,
      urlPlaceholder: 'https://grafana.example.com',
      versionSource: {
        type: 'json-path',
        urlTemplate: '{{instanceUrl}}/api/health',
        jsonPath: '$.version',
        jsonPathExtractors: ['version'],
        authRequired: false,
        endpointFallbacks: ['/api/health', '/api/v1/health'],
      },
      latestSource: {
        type: 'github-releases',
        target: 'grafana/grafana',
      },
      evidenceUrl: 'https://grafana.com/docs/grafana/latest/developers/http_api/other/#health-api',
    },
    {
      id: 'enterprise',
      label: 'Grafana Enterprise (Self-Hosted)',
      description: 'Grafana Enterprise — same API endpoints, may require auth.',
      requiresInstanceUrl: true,
      authRequired: true,
      urlPlaceholder: 'https://grafana.example.com',
      versionSource: {
        type: 'json-path',
        urlTemplate: '{{instanceUrl}}/api/health',
        jsonPath: '$.version',
        authRequired: false,
        endpointFallbacks: ['/api/health'],
      },
      latestSource: {
        type: 'github-releases',
        target: 'grafana/grafana',
      },
      evidenceUrl: 'https://grafana.com/docs/grafana/latest/developers/http_api/other/#health-api',
    },
    {
      id: 'cloud',
      label: 'Grafana Cloud',
      description: 'Grafana Cloud — tracks latest OSS release; no instance URL needed.',
      requiresInstanceUrl: false,
      authRequired: false,
      versionSource: {
        type: 'github-releases',
        target: 'grafana/grafana',
      },
      latestSource: {
        type: 'github-releases',
        target: 'grafana/grafana',
      },
      evidenceUrl: 'https://github.com/grafana/grafana/releases',
    },
  ],

  'prometheus': [
    {
      id: 'standalone',
      label: 'Prometheus (Standalone)',
      description: 'Standard Prometheus server. Version available unauthenticated at /api/v1/status/buildinfo.',
      requiresInstanceUrl: true,
      authRequired: false,
      urlPlaceholder: 'https://prometheus.example.com',
      versionSource: {
        type: 'json-path',
        urlTemplate: '{{instanceUrl}}/api/v1/status/buildinfo',
        jsonPath: '$.data.version',
        jsonPathExtractors: ['data.version', 'version'],
        authRequired: false,
        endpointFallbacks: ['/api/v1/status/buildinfo', '/status'],
      },
      latestSource: {
        type: 'github-releases',
        target: 'prometheus/prometheus',
      },
      evidenceUrl: 'https://prometheus.io/docs/prometheus/latest/querying/api/#build-information',
    },
    {
      id: 'kubernetes',
      label: 'Prometheus (Kubernetes / kube-prometheus-stack)',
      description: 'Prometheus deployed via kube-prometheus-stack Helm chart. Typically behind ingress with auth.',
      requiresInstanceUrl: true,
      authRequired: true,
      urlPlaceholder: 'https://prometheus.k8s.example.com',
      versionSource: {
        type: 'json-path',
        urlTemplate: '{{instanceUrl}}/api/v1/status/buildinfo',
        jsonPath: '$.data.version',
        authRequired: false,
        endpointFallbacks: ['/api/v1/status/buildinfo'],
      },
      latestSource: {
        type: 'github-releases',
        target: 'prometheus/prometheus',
      },
      evidenceUrl: 'https://prometheus.io/docs/prometheus/latest/querying/api/#build-information',
      tags: ['kubernetes', 'helm', 'kube-prometheus'],
    },
  ],

  'portainer': [
    {
      id: 'ce',
      label: 'Portainer CE (Community Edition)',
      description: 'Free, open-source. Version at /api/system/version (no auth required on newer builds).',
      requiresInstanceUrl: true,
      authRequired: false,
      urlPlaceholder: 'https://portainer.example.com',
      versionSource: {
        type: 'json-path',
        urlTemplate: '{{instanceUrl}}/api/system/version',
        jsonPath: '$.ServerVersion',
        jsonPathExtractors: ['ServerVersion', 'server'],
        authRequired: false,
        endpointFallbacks: ['/api/system/version', '/api/status'],
      },
      latestSource: {
        type: 'github-releases',
        target: 'portainer/portainer',
      },
      evidenceUrl: 'https://docs.portainer.io/api/docs#tag/System/operation/SystemVersion',
    },
    {
      id: 'be',
      label: 'Portainer Business Edition (BE/EE)',
      description: 'Commercial version — same API endpoints, may require auth token.',
      requiresInstanceUrl: true,
      authRequired: true,
      urlPlaceholder: 'https://portainer.example.com',
      versionSource: {
        type: 'json-path',
        urlTemplate: '{{instanceUrl}}/api/system/version',
        jsonPath: '$.ServerVersion',
        authRequired: true,
        endpointFallbacks: ['/api/system/version', '/api/status'],
      },
      latestSource: {
        type: 'github-releases',
        target: 'portainer/portainer',
      },
      evidenceUrl: 'https://docs.portainer.io/api/docs#tag/System/operation/SystemVersion',
    },
  ],

  'keycloak': [
    {
      id: 'quarkus',
      label: 'Keycloak (Quarkus / v17+)',
      description: 'Modern Keycloak (v17+) — /admin/serverinfo requires admin token.',
      requiresInstanceUrl: true,
      authRequired: true,
      urlPlaceholder: 'https://keycloak.example.com',
      versionSource: {
        type: 'json-path',
        urlTemplate: '{{instanceUrl}}/admin/serverinfo',
        jsonPath: '$.systemInfo.version',
        authRequired: true,
      },
      latestSource: {
        type: 'github-releases',
        target: 'keycloak/keycloak',
      },
      evidenceUrl: 'https://www.keycloak.org/docs-api/latest/rest-api/#_serverinforepresentation',
    },
    {
      id: 'wildfly',
      label: 'Keycloak (Wildfly / v16 and earlier)',
      description: 'Legacy Keycloak on Wildfly. Uses /auth prefix.',
      requiresInstanceUrl: true,
      authRequired: true,
      urlPlaceholder: 'https://keycloak.example.com',
      versionSource: {
        type: 'json-path',
        urlTemplate: '{{instanceUrl}}/auth/admin/serverinfo',
        jsonPath: '$.systemInfo.version',
        authRequired: true,
        endpointFallbacks: ['/auth/admin/serverinfo', '/admin/serverinfo'],
      },
      latestSource: {
        type: 'github-releases',
        target: 'keycloak/keycloak',
      },
      evidenceUrl: 'https://www.keycloak.org/docs-api/latest/rest-api/#_serverinforepresentation',
    },
  ],

  'authentik': [
    {
      id: 'docker-compose',
      label: 'Authentik (Docker Compose)',
      description: 'Standard Docker Compose deployment. Requires API token.',
      requiresInstanceUrl: true,
      authRequired: true,
      urlPlaceholder: 'https://authentik.example.com',
      versionSource: {
        type: 'json-path',
        urlTemplate: '{{instanceUrl}}/-/api/v3/admin/version/',
        jsonPath: '$.version_current',
        authRequired: true,
      },
      latestSource: {
        type: 'github-releases',
        target: 'goauthentik/authentik',
      },
      evidenceUrl: 'https://docs.goauthentik.io/developer-docs/api/reference/admin-version-retrieve/',
    },
    {
      id: 'kubernetes',
      label: 'Authentik (Kubernetes / Helm)',
      description: 'Helm chart deployment — same API, typically behind ingress.',
      requiresInstanceUrl: true,
      authRequired: true,
      urlPlaceholder: 'https://authentik.k8s.example.com',
      versionSource: {
        type: 'json-path',
        urlTemplate: '{{instanceUrl}}/-/api/v3/admin/version/',
        jsonPath: '$.version_current',
        authRequired: true,
      },
      latestSource: {
        type: 'github-releases',
        target: 'goauthentik/authentik',
      },
      evidenceUrl: 'https://docs.goauthentik.io/developer-docs/api/reference/admin-version-retrieve/',
      tags: ['kubernetes', 'helm'],
    },
  ],

  'vault': [
    {
      id: 'oss',
      label: 'HashiCorp Vault OSS',
      description: 'Open-source Vault. /v1/sys/health returns version unauthenticated.',
      requiresInstanceUrl: true,
      authRequired: false,
      urlPlaceholder: 'https://vault.example.com',
      versionSource: {
        type: 'json-path',
        urlTemplate: '{{instanceUrl}}/v1/sys/health',
        jsonPath: '$.version',
        authRequired: false,
        endpointFallbacks: ['/v1/sys/health', '/v1/sys/seal-status'],
      },
      latestSource: {
        type: 'github-releases',
        target: 'hashicorp/vault',
      },
      evidenceUrl: 'https://developer.hashicorp.com/vault/api-docs/system/health',
    },
    {
      id: 'enterprise',
      label: 'HashiCorp Vault Enterprise',
      description: 'Vault Enterprise — same health endpoint, returns "+ent" version suffix.',
      requiresInstanceUrl: true,
      authRequired: false,
      urlPlaceholder: 'https://vault.example.com',
      versionSource: {
        type: 'json-path',
        urlTemplate: '{{instanceUrl}}/v1/sys/health',
        jsonPath: '$.version',
        authRequired: false,
        endpointFallbacks: ['/v1/sys/health'],
      },
      latestSource: {
        type: 'github-releases',
        target: 'hashicorp/vault',
      },
      evidenceUrl: 'https://developer.hashicorp.com/vault/api-docs/system/health',
    },
    {
      id: 'kubernetes',
      label: 'HashiCorp Vault (Kubernetes / Helm)',
      description: 'Vault deployed via Helm. May be behind ingress/auth proxy.',
      requiresInstanceUrl: true,
      authRequired: false,
      urlPlaceholder: 'https://vault.k8s.example.com',
      versionSource: {
        type: 'json-path',
        urlTemplate: '{{instanceUrl}}/v1/sys/health',
        jsonPath: '$.version',
        authRequired: false,
      },
      latestSource: {
        type: 'github-releases',
        target: 'hashicorp/vault',
      },
      evidenceUrl: 'https://developer.hashicorp.com/vault/api-docs/system/health',
      tags: ['kubernetes', 'helm'],
    },
  ],

  'gitea': [
    {
      id: 'standalone',
      label: 'Gitea (Standalone)',
      description: 'Single-server Gitea deployment. Version endpoint is public.',
      requiresInstanceUrl: true,
      authRequired: false,
      urlPlaceholder: 'https://gitea.example.com',
      versionSource: {
        type: 'json-path',
        urlTemplate: '{{instanceUrl}}/api/v1/version',
        jsonPath: '$.version',
        authRequired: false,
        endpointFallbacks: ['/api/v1/version'],
      },
      latestSource: {
        type: 'github-releases',
        target: 'go-gitea/gitea',
      },
      evidenceUrl: 'https://gitea.com/api/swagger#tag/miscellaneous/operation/getVersion',
    },
    {
      id: 'docker',
      label: 'Gitea (Docker)',
      description: 'Running via Docker or Docker Compose. Same API as standalone.',
      requiresInstanceUrl: true,
      authRequired: false,
      urlPlaceholder: 'https://gitea.example.com',
      versionSource: {
        type: 'json-path',
        urlTemplate: '{{instanceUrl}}/api/v1/version',
        jsonPath: '$.version',
        authRequired: false,
      },
      latestSource: {
        type: 'docker-hub',
        target: 'gitea/gitea',
      },
      evidenceUrl: 'https://gitea.com/api/swagger#tag/miscellaneous/operation/getVersion',
      tags: ['docker'],
    },
  ],

  'argocd': [
    {
      id: 'standalone',
      label: 'ArgoCD (Kubernetes)',
      description: 'Standard ArgoCD deployment on Kubernetes. Version at /api/version (no auth).',
      requiresInstanceUrl: true,
      authRequired: false,
      urlPlaceholder: 'https://argocd.example.com',
      versionSource: {
        type: 'json-path',
        urlTemplate: '{{instanceUrl}}/api/version',
        jsonPath: '$.Version',
        jsonPathExtractors: ['Version', 'version'],
        authRequired: false,
        endpointFallbacks: ['/api/version', '/api/v1/version'],
      },
      latestSource: {
        type: 'github-releases',
        target: 'argoproj/argo-cd',
      },
      evidenceUrl: 'https://argo-cd.readthedocs.io/en/stable/developer-guide/api-docs/',
    },
    {
      id: 'core',
      label: 'ArgoCD Core (no UI)',
      description: 'ArgoCD Core mode — API server may be disabled; track via GitHub releases only.',
      requiresInstanceUrl: false,
      authRequired: false,
      versionSource: {
        type: 'github-releases',
        target: 'argoproj/argo-cd',
      },
      latestSource: {
        type: 'github-releases',
        target: 'argoproj/argo-cd',
      },
      evidenceUrl: 'https://github.com/argoproj/argo-cd/releases',
    },
  ],

  'nextcloud': [
    {
      id: 'docker',
      label: 'Nextcloud (Docker / Apache)',
      description: 'Standard Docker deployment. Status endpoint available unauthenticated.',
      requiresInstanceUrl: true,
      authRequired: false,
      urlPlaceholder: 'https://nextcloud.example.com',
      versionSource: {
        type: 'json-path',
        urlTemplate: '{{instanceUrl}}/status.php',
        jsonPath: '$.version',
        jsonPathExtractors: ['version', 'versionstring'],
        authRequired: false,
        endpointFallbacks: ['/status.php', '/ocs/v2.php/apps/serverinfo/api/v1/info'],
      },
      latestSource: {
        type: 'github-releases',
        target: 'nextcloud/server',
      },
      evidenceUrl: 'https://docs.nextcloud.com/server/latest/developer_manual/client_apis/OCS/ocs-status-api.html',
    },
    {
      id: 'snap',
      label: 'Nextcloud (Snap)',
      description: 'Nextcloud Snap package — same HTTP API, different install path.',
      requiresInstanceUrl: true,
      authRequired: false,
      urlPlaceholder: 'https://nextcloud.example.com',
      versionSource: {
        type: 'json-path',
        urlTemplate: '{{instanceUrl}}/status.php',
        jsonPath: '$.version',
        authRequired: false,
      },
      latestSource: {
        type: 'github-releases',
        target: 'nextcloud/server',
      },
      evidenceUrl: 'https://docs.nextcloud.com/server/latest/developer_manual/client_apis/OCS/ocs-status-api.html',
    },
  ],

  'mattermost': [
    {
      id: 'self-hosted',
      label: 'Mattermost (Self-Hosted / Team Edition)',
      description: 'Free self-hosted. /api/v4/system/ping returns version.',
      requiresInstanceUrl: true,
      authRequired: false,
      urlPlaceholder: 'https://mattermost.example.com',
      versionSource: {
        type: 'json-path',
        urlTemplate: '{{instanceUrl}}/api/v4/system/ping',
        jsonPath: '$.server_version',
        authRequired: false,
        endpointFallbacks: ['/api/v4/system/ping', '/api/v4/config/client'],
      },
      latestSource: {
        type: 'github-releases',
        target: 'mattermost/mattermost',
      },
      evidenceUrl: 'https://api.mattermost.com/#tag/system/operation/GetPing',
    },
    {
      id: 'enterprise',
      label: 'Mattermost Enterprise Edition (E0/E10/E20)',
      description: 'Enterprise Mattermost — same API, may require token for full access.',
      requiresInstanceUrl: true,
      authRequired: false,
      urlPlaceholder: 'https://mattermost.example.com',
      versionSource: {
        type: 'json-path',
        urlTemplate: '{{instanceUrl}}/api/v4/system/ping',
        jsonPath: '$.server_version',
        authRequired: false,
      },
      latestSource: {
        type: 'github-releases',
        target: 'mattermost/mattermost',
      },
      evidenceUrl: 'https://api.mattermost.com/#tag/system/operation/GetPing',
    },
  ],

  'jellyfin': [
    {
      id: 'docker',
      label: 'Jellyfin (Docker)',
      description: 'Docker deployment. System info endpoint available without auth.',
      requiresInstanceUrl: true,
      authRequired: false,
      urlPlaceholder: 'https://jellyfin.example.com',
      versionSource: {
        type: 'json-path',
        urlTemplate: '{{instanceUrl}}/System/Info/Public',
        jsonPath: '$.Version',
        jsonPathExtractors: ['Version', 'version'],
        authRequired: false,
        endpointFallbacks: ['/System/Info/Public', '/health'],
      },
      latestSource: {
        type: 'github-releases',
        target: 'jellyfin/jellyfin',
      },
      evidenceUrl: 'https://api.jellyfin.org/#tag/System/operation/GetPublicSystemInfo',
    },
    {
      id: 'linuxserver',
      label: 'Jellyfin (LinuxServer.io image)',
      description: 'LinuxServer.io Docker image — same API, may include extra mods.',
      requiresInstanceUrl: true,
      authRequired: false,
      urlPlaceholder: 'https://jellyfin.example.com',
      versionSource: {
        type: 'json-path',
        urlTemplate: '{{instanceUrl}}/System/Info/Public',
        jsonPath: '$.Version',
        authRequired: false,
      },
      latestSource: {
        type: 'docker-hub',
        target: 'linuxserver/jellyfin',
      },
      evidenceUrl: 'https://api.jellyfin.org/#tag/System/operation/GetPublicSystemInfo',
      tags: ['linuxserver', 'docker'],
    },
  ],

  'minio': [
    {
      id: 'standalone',
      label: 'MinIO (Standalone / Single Node)',
      description: 'Single-node MinIO. Version at /minio/health/live and via mc admin info.',
      requiresInstanceUrl: true,
      authRequired: true,
      urlPlaceholder: 'https://minio.example.com',
      versionSource: {
        type: 'json-path',
        urlTemplate: '{{instanceUrl}}/minio/health/cluster',
        jsonPath: '$.WriteQuorum',
        authRequired: false,
        endpointFallbacks: ['/minio/health/live', '/minio/health/cluster'],
      },
      latestSource: {
        type: 'github-releases',
        target: 'minio/minio',
      },
      evidenceUrl: 'https://min.io/docs/minio/linux/reference/minio-server/minio-server.html#health-check',
    },
    {
      id: 'distributed',
      label: 'MinIO (Distributed / Multi-Node)',
      description: 'Multi-node MinIO cluster. Same API endpoints.',
      requiresInstanceUrl: true,
      authRequired: true,
      urlPlaceholder: 'https://minio.example.com',
      versionSource: {
        type: 'json-path',
        urlTemplate: '{{instanceUrl}}/minio/health/cluster',
        jsonPath: '$.WriteQuorum',
        authRequired: false,
      },
      latestSource: {
        type: 'github-releases',
        target: 'minio/minio',
      },
      evidenceUrl: 'https://min.io/docs/minio/linux/reference/minio-server/minio-server.html#health-check',
      tags: ['distributed', 'cluster'],
    },
    {
      id: 'kubernetes',
      label: 'MinIO (Kubernetes Operator)',
      description: 'MinIO Operator on Kubernetes. Uses Operator Console for management.',
      requiresInstanceUrl: true,
      authRequired: true,
      urlPlaceholder: 'https://minio-console.k8s.example.com',
      versionSource: {
        type: 'github-releases',
        target: 'minio/minio',
      },
      latestSource: {
        type: 'github-releases',
        target: 'minio/minio',
      },
      evidenceUrl: 'https://github.com/minio/minio/releases',
      tags: ['kubernetes', 'operator'],
    },
  ],

  'n8n': [
    {
      id: 'docker',
      label: 'n8n (Docker / Self-Hosted)',
      description: 'Self-hosted n8n via Docker. Version at /healthz.',
      requiresInstanceUrl: true,
      authRequired: false,
      urlPlaceholder: 'https://n8n.example.com',
      versionSource: {
        type: 'json-path',
        urlTemplate: '{{instanceUrl}}/healthz',
        jsonPath: '$.runningMode',
        authRequired: false,
        endpointFallbacks: ['/healthz', '/api/v1/info'],
      },
      latestSource: {
        type: 'npm-registry',
        target: 'n8n',
      },
      evidenceUrl: 'https://docs.n8n.io/api/',
      tags: ['docker'],
    },
    {
      id: 'npm',
      label: 'n8n (npm / Node.js)',
      description: 'n8n installed globally via npm.',
      requiresInstanceUrl: true,
      authRequired: false,
      urlPlaceholder: 'https://n8n.example.com',
      versionSource: {
        type: 'npm-registry',
        target: 'n8n',
      },
      latestSource: {
        type: 'npm-registry',
        target: 'n8n',
      },
      evidenceUrl: 'https://www.npmjs.com/package/n8n',
    },
    {
      id: 'cloud',
      label: 'n8n Cloud',
      description: 'n8n managed cloud — tracks latest npm release.',
      requiresInstanceUrl: false,
      authRequired: false,
      versionSource: {
        type: 'npm-registry',
        target: 'n8n',
      },
      latestSource: {
        type: 'npm-registry',
        target: 'n8n',
      },
      evidenceUrl: 'https://www.npmjs.com/package/n8n',
    },
  ],

  'home-assistant': [
    {
      id: 'haos',
      label: 'Home Assistant OS (HAOS)',
      description: 'Full Home Assistant OS. Version at /api/config (requires long-lived token).',
      requiresInstanceUrl: true,
      authRequired: true,
      urlPlaceholder: 'https://homeassistant.local:8123',
      versionSource: {
        type: 'json-path',
        urlTemplate: '{{instanceUrl}}/api/config',
        jsonPath: '$.version',
        authRequired: true,
        endpointFallbacks: ['/api/config', '/api/'],
      },
      latestSource: {
        type: 'github-releases',
        target: 'home-assistant/core',
      },
      evidenceUrl: 'https://developers.home-assistant.io/docs/api/rest/',
    },
    {
      id: 'container',
      label: 'Home Assistant Container (Docker)',
      description: 'Docker container mode. Same API, no Supervisor.',
      requiresInstanceUrl: true,
      authRequired: true,
      urlPlaceholder: 'https://homeassistant.example.com',
      versionSource: {
        type: 'json-path',
        urlTemplate: '{{instanceUrl}}/api/config',
        jsonPath: '$.version',
        authRequired: true,
      },
      latestSource: {
        type: 'github-releases',
        target: 'home-assistant/core',
      },
      evidenceUrl: 'https://developers.home-assistant.io/docs/api/rest/',
      tags: ['docker'],
    },
    {
      id: 'supervised',
      label: 'Home Assistant Supervised',
      description: 'Supervised install with Supervisor on generic Linux.',
      requiresInstanceUrl: true,
      authRequired: true,
      urlPlaceholder: 'https://homeassistant.example.com:8123',
      versionSource: {
        type: 'json-path',
        urlTemplate: '{{instanceUrl}}/api/config',
        jsonPath: '$.version',
        authRequired: true,
      },
      latestSource: {
        type: 'github-releases',
        target: 'home-assistant/core',
      },
      evidenceUrl: 'https://developers.home-assistant.io/docs/api/rest/',
    },
  ],

};

/**
 * Get variants for a tool by ID.
 * Returns empty array if no variants are defined.
 */
export function getToolVariants(toolId: string): ToolVariant[] {
  return TOOL_VARIANTS[toolId] ?? [];
}

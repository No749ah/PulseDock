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

  'wordpress': [
    {
      id: 'docker',
      label: 'WordPress (Docker / Self-Hosted)',
      description: 'Self-hosted WordPress via Docker or LAMP stack. No auth needed for WP REST API.',
      requiresInstanceUrl: true,
      authRequired: false,
      urlPlaceholder: 'https://wordpress.example.com',
      versionSource: {
        type: 'json-path',
        urlTemplate: '{{instanceUrl}}/wp-json',
        jsonPath: '$.namespaces.0',
        authRequired: false,
        endpointFallbacks: ['/wp-json', '/?rest_route=/'],
      },
      latestSource: {
        type: 'github-releases',
        target: 'WordPress/WordPress',
      },
      evidenceUrl: 'https://developer.wordpress.org/rest-api/',
    },
    {
      id: 'multisite',
      label: 'WordPress Multisite',
      description: 'WordPress Multisite network. Same REST API per site.',
      requiresInstanceUrl: true,
      authRequired: false,
      urlPlaceholder: 'https://wordpress.example.com',
      versionSource: {
        type: 'json-path',
        urlTemplate: '{{instanceUrl}}/wp-json',
        jsonPath: '$.namespaces.0',
        authRequired: false,
        endpointFallbacks: ['/wp-json'],
      },
      latestSource: {
        type: 'github-releases',
        target: 'WordPress/WordPress',
      },
      evidenceUrl: 'https://developer.wordpress.org/rest-api/',
      tags: ['multisite'],
    },
    {
      id: 'cloud',
      label: 'WP Engine / WordPress.com (Cloud)',
      description: 'Managed WordPress hosting — tracks upstream release via GitHub.',
      requiresInstanceUrl: false,
      authRequired: false,
      versionSource: {
        type: 'github-releases',
        target: 'WordPress/WordPress',
      },
      latestSource: {
        type: 'github-releases',
        target: 'WordPress/WordPress',
      },
      evidenceUrl: 'https://github.com/WordPress/WordPress/releases',
    },
  ],

  'traefik': [
    {
      id: 'docker',
      label: 'Traefik (Docker / Standalone)',
      description: 'Traefik running as a Docker container. Version API available unauthenticated.',
      requiresInstanceUrl: true,
      authRequired: false,
      urlPlaceholder: 'https://traefik.example.com',
      versionSource: {
        type: 'json-path',
        urlTemplate: '{{instanceUrl}}/api/version',
        jsonPath: '$.Version',
        jsonPathExtractors: ['Version', 'version'],
        authRequired: false,
        endpointFallbacks: ['/api/version', '/api/overview'],
      },
      latestSource: {
        type: 'github-releases',
        target: 'traefik/traefik',
      },
      evidenceUrl: 'https://doc.traefik.io/traefik/operations/api/#version',
    },
    {
      id: 'kubernetes',
      label: 'Traefik (Kubernetes Ingress)',
      description: 'Traefik deployed as Kubernetes ingress controller. API may require auth depending on exposure.',
      requiresInstanceUrl: true,
      authRequired: false,
      urlPlaceholder: 'https://traefik.k8s.example.com',
      versionSource: {
        type: 'json-path',
        urlTemplate: '{{instanceUrl}}/api/version',
        jsonPath: '$.Version',
        authRequired: false,
        endpointFallbacks: ['/api/version', '/api/overview'],
      },
      latestSource: {
        type: 'github-releases',
        target: 'traefik/traefik',
      },
      evidenceUrl: 'https://doc.traefik.io/traefik/operations/api/#version',
      tags: ['kubernetes', 'ingress'],
    },
  ],

  'forgejo': [
    {
      id: 'standalone',
      label: 'Forgejo (Standalone)',
      description: 'Self-hosted Forgejo instance. Version endpoint is public (same API as Gitea).',
      requiresInstanceUrl: true,
      authRequired: false,
      urlPlaceholder: 'https://forgejo.example.com',
      versionSource: {
        type: 'json-path',
        urlTemplate: '{{instanceUrl}}/api/v1/version',
        jsonPath: '$.version',
        authRequired: false,
        endpointFallbacks: ['/api/v1/version'],
      },
      latestSource: {
        type: 'github-releases',
        target: 'forgejo/forgejo',
      },
      evidenceUrl: 'https://codeberg.org/forgejo/forgejo',
    },
    {
      id: 'docker',
      label: 'Forgejo (Docker)',
      description: 'Forgejo running via Docker or Docker Compose. Same API as standalone.',
      requiresInstanceUrl: true,
      authRequired: false,
      urlPlaceholder: 'https://forgejo.example.com',
      versionSource: {
        type: 'json-path',
        urlTemplate: '{{instanceUrl}}/api/v1/version',
        jsonPath: '$.version',
        authRequired: false,
      },
      latestSource: {
        type: 'github-releases',
        target: 'forgejo/forgejo',
      },
      evidenceUrl: 'https://codeberg.org/forgejo/forgejo',
      tags: ['docker'],
    },
  ],

  'sonarqube': [
    {
      id: 'community',
      label: 'SonarQube Community Edition (CE)',
      description: 'Free CE edition. /api/server/version returns plain text version string.',
      requiresInstanceUrl: true,
      authRequired: false,
      urlPlaceholder: 'https://sonarqube.example.com',
      versionSource: {
        type: 'json-path',
        urlTemplate: '{{instanceUrl}}/api/server/version',
        jsonPath: '',
        authRequired: false,
        endpointFallbacks: ['/api/server/version', '/api/system/status'],
      },
      latestSource: {
        type: 'github-releases',
        target: 'SonarSource/sonarqube',
      },
      evidenceUrl: 'https://docs.sonarsource.com/sonarqube/latest/extension-guide/web-api/',
    },
    {
      id: 'developer',
      label: 'SonarQube Developer Edition (DE)',
      description: 'Paid Developer Edition — same API endpoint, may require auth token.',
      requiresInstanceUrl: true,
      authRequired: true,
      urlPlaceholder: 'https://sonarqube.example.com',
      versionSource: {
        type: 'json-path',
        urlTemplate: '{{instanceUrl}}/api/server/version',
        jsonPath: '',
        authRequired: false,
        endpointFallbacks: ['/api/server/version'],
      },
      latestSource: {
        type: 'github-releases',
        target: 'SonarSource/sonarqube',
      },
      evidenceUrl: 'https://docs.sonarsource.com/sonarqube/latest/extension-guide/web-api/',
    },
    {
      id: 'enterprise',
      label: 'SonarQube Enterprise Edition (EE) / DCE',
      description: 'Enterprise or Data Center Edition — same version API, auth typically required.',
      requiresInstanceUrl: true,
      authRequired: true,
      urlPlaceholder: 'https://sonarqube.example.com',
      versionSource: {
        type: 'json-path',
        urlTemplate: '{{instanceUrl}}/api/server/version',
        jsonPath: '',
        authRequired: false,
      },
      latestSource: {
        type: 'github-releases',
        target: 'SonarSource/sonarqube',
      },
      evidenceUrl: 'https://docs.sonarsource.com/sonarqube/latest/extension-guide/web-api/',
    },
    {
      id: 'cloud',
      label: 'SonarQube Cloud (SonarCloud)',
      description: 'Managed cloud offering — tracks upstream release via GitHub.',
      requiresInstanceUrl: false,
      authRequired: false,
      versionSource: {
        type: 'github-releases',
        target: 'SonarSource/sonarqube',
      },
      latestSource: {
        type: 'github-releases',
        target: 'SonarSource/sonarqube',
      },
      evidenceUrl: 'https://github.com/SonarSource/sonarqube/releases',
    },
  ],

  'uptime-kuma': [
    {
      id: 'docker',
      label: 'Uptime Kuma (Docker)',
      description: 'Docker deployment. No public unauthenticated version endpoint — tracks via GitHub releases.',
      requiresInstanceUrl: true,
      authRequired: false,
      urlPlaceholder: 'https://uptime.example.com',
      versionSource: {
        type: 'github-releases',
        target: 'louislam/uptime-kuma',
      },
      latestSource: {
        type: 'github-releases',
        target: 'louislam/uptime-kuma',
      },
      evidenceUrl: 'https://github.com/louislam/uptime-kuma/releases',
      tags: ['docker'],
    },
    {
      id: 'npm',
      label: 'Uptime Kuma (npm / Node.js)',
      description: 'Installed via npm. Tracks upstream release via GitHub.',
      requiresInstanceUrl: true,
      authRequired: false,
      urlPlaceholder: 'https://uptime.example.com',
      versionSource: {
        type: 'github-releases',
        target: 'louislam/uptime-kuma',
      },
      latestSource: {
        type: 'github-releases',
        target: 'louislam/uptime-kuma',
      },
      evidenceUrl: 'https://github.com/louislam/uptime-kuma/releases',
    },
  ],

  'immich': [
    {
      id: 'docker',
      label: 'Immich (Docker Compose)',
      description: 'Standard Docker Compose deployment. Version at /api/server/about (no auth).',
      requiresInstanceUrl: true,
      authRequired: false,
      urlPlaceholder: 'https://immich.example.com',
      versionSource: {
        type: 'json-path',
        urlTemplate: '{{instanceUrl}}/api/server/about',
        jsonPath: '$.version',
        authRequired: false,
        endpointFallbacks: ['/api/server/about', '/api/server-info/about'],
      },
      latestSource: {
        type: 'github-releases',
        target: 'immich-app/immich',
      },
      evidenceUrl: 'https://immich.app/docs/api/',
      tags: ['docker'],
    },
    {
      id: 'kubernetes',
      label: 'Immich (Kubernetes / Helm)',
      description: 'Helm chart deployment on Kubernetes. Same API endpoint.',
      requiresInstanceUrl: true,
      authRequired: false,
      urlPlaceholder: 'https://immich.k8s.example.com',
      versionSource: {
        type: 'json-path',
        urlTemplate: '{{instanceUrl}}/api/server/about',
        jsonPath: '$.version',
        authRequired: false,
        endpointFallbacks: ['/api/server/about', '/api/server-info/about'],
      },
      latestSource: {
        type: 'github-releases',
        target: 'immich-app/immich',
      },
      evidenceUrl: 'https://immich.app/docs/api/',
      tags: ['kubernetes', 'helm'],
    },
  ],

  'ghost': [
    {
      id: 'self-hosted',
      label: 'Ghost (Self-Hosted)',
      description: 'Self-hosted Ghost via Ghost CLI or Docker. Tracks release via GitHub.',
      requiresInstanceUrl: true,
      authRequired: false,
      urlPlaceholder: 'https://ghost.example.com',
      versionSource: {
        type: 'github-releases',
        target: 'TryGhost/Ghost',
      },
      latestSource: {
        type: 'github-releases',
        target: 'TryGhost/Ghost',
      },
      evidenceUrl: 'https://ghost.org/docs/api/',
      tags: ['docker'],
    },
    {
      id: 'ghost-pro',
      label: 'Ghost Pro (Cloud)',
      description: 'Managed Ghost Pro hosting — tracks upstream release via GitHub.',
      requiresInstanceUrl: false,
      authRequired: false,
      versionSource: {
        type: 'github-releases',
        target: 'TryGhost/Ghost',
      },
      latestSource: {
        type: 'github-releases',
        target: 'TryGhost/Ghost',
      },
      evidenceUrl: 'https://github.com/TryGhost/Ghost/releases',
    },
  ],

  'plausible': [
    {
      id: 'self-hosted',
      label: 'Plausible (Self-Hosted)',
      description: 'Self-hosted Plausible Analytics. No public version endpoint — tracks upstream release via GitHub.',
      requiresInstanceUrl: true,
      authRequired: false,
      urlPlaceholder: 'https://plausible.example.com',
      versionSource: {
        type: 'github-releases',
        target: 'plausible/analytics',
      },
      latestSource: {
        type: 'github-releases',
        target: 'plausible/analytics',
      },
      evidenceUrl: 'https://github.com/plausible/analytics/releases',
    },
    {
      id: 'cloud',
      label: 'Plausible Cloud',
      description: 'Managed Plausible Cloud — tracks upstream release via GitHub.',
      requiresInstanceUrl: false,
      authRequired: false,
      versionSource: {
        type: 'github-releases',
        target: 'plausible/analytics',
      },
      latestSource: {
        type: 'github-releases',
        target: 'plausible/analytics',
      },
      evidenceUrl: 'https://github.com/plausible/analytics/releases',
    },
  ],

  'jenkins': [
    {
      id: 'war',
      label: 'Standalone WAR / Bare-metal',
      description: 'Jenkins running as a standalone WAR or system service on a server.',
      requiresInstanceUrl: true,
      authRequired: false,
      urlPlaceholder: 'http://jenkins.example.com:8080',
      versionSource: {
        type: 'json-path',
        urlTemplate: '{{instanceUrl}}/api/json?tree=version',
        jsonPath: '$.version',
        authRequired: false,
      },
      latestSource: {
        type: 'github-releases',
        target: 'jenkinsci/jenkins',
      },
      evidenceUrl: 'https://www.jenkins.io/doc/book/using/remote-access-api/',
    },
    {
      id: 'docker',
      label: 'Docker Container',
      description: 'Jenkins running in a Docker container (official jenkins/jenkins image).',
      requiresInstanceUrl: true,
      authRequired: false,
      urlPlaceholder: 'http://jenkins.example.com:8080',
      versionSource: {
        type: 'json-path',
        urlTemplate: '{{instanceUrl}}/api/json?tree=version',
        jsonPath: '$.version',
        authRequired: false,
      },
      latestSource: {
        type: 'docker-hub',
        target: 'jenkins/jenkins',
      },
      evidenceUrl: 'https://hub.docker.com/r/jenkins/jenkins',
    },
  ],

  'elasticsearch': [
    {
      id: 'self-hosted',
      label: 'Self-Hosted (Bare-metal / VM)',
      description: 'Elasticsearch running on your own server.',
      requiresInstanceUrl: true,
      authRequired: false,
      urlPlaceholder: 'http://elasticsearch.example.com:9200',
      versionSource: {
        type: 'json-path',
        urlTemplate: '{{instanceUrl}}/',
        jsonPath: '$.version.number',
        authRequired: false,
      },
      latestSource: {
        type: 'github-releases',
        target: 'elastic/elasticsearch',
      },
      evidenceUrl: 'https://www.elastic.co/guide/en/elasticsearch/reference/current/rest-api.html',
    },
    {
      id: 'docker',
      label: 'Docker / Docker Compose',
      description: 'Elasticsearch running in a Docker container.',
      requiresInstanceUrl: true,
      authRequired: false,
      urlPlaceholder: 'http://localhost:9200',
      versionSource: {
        type: 'json-path',
        urlTemplate: '{{instanceUrl}}/',
        jsonPath: '$.version.number',
        authRequired: false,
      },
      latestSource: {
        type: 'docker-hub',
        target: 'elastic/elasticsearch',
      },
      evidenceUrl: 'https://hub.docker.com/r/elastic/elasticsearch',
    },
  ],

  'vaultwarden': [
    {
      id: 'docker',
      label: 'Docker (vaultwarden/server)',
      description: 'Vaultwarden (Bitwarden-compatible server) running via Docker.',
      requiresInstanceUrl: true,
      authRequired: false,
      urlPlaceholder: 'https://vault.example.com',
      versionSource: {
        type: 'json-path',
        urlTemplate: '{{instanceUrl}}/alive',
        jsonPath: undefined,
        authRequired: false,
      },
      latestSource: {
        type: 'github-releases',
        target: 'dani-garcia/vaultwarden',
      },
      evidenceUrl: 'https://github.com/dani-garcia/vaultwarden/wiki',
    },
    {
      id: 'docker-compose',
      label: 'Docker Compose',
      description: 'Vaultwarden deployed via Docker Compose with optional reverse proxy.',
      requiresInstanceUrl: true,
      authRequired: false,
      urlPlaceholder: 'https://vault.example.com',
      versionSource: {
        type: 'json-path',
        urlTemplate: '{{instanceUrl}}/alive',
        jsonPath: undefined,
        authRequired: false,
      },
      latestSource: {
        type: 'github-releases',
        target: 'dani-garcia/vaultwarden',
      },
      evidenceUrl: 'https://github.com/dani-garcia/vaultwarden/wiki/Using-Docker-Compose',
    },
  ],

  'nginx-proxy-manager': [
    {
      id: 'docker',
      label: 'Docker (official image)',
      description: 'Nginx Proxy Manager running via Docker Compose.',
      requiresInstanceUrl: true,
      authRequired: false,
      urlPlaceholder: 'http://npm.example.com:81',
      versionSource: {
        type: 'json-path',
        urlTemplate: '{{instanceUrl}}/api/',
        jsonPath: undefined,
        authRequired: false,
      },
      latestSource: {
        type: 'github-releases',
        target: 'NginxProxyManager/nginx-proxy-manager',
      },
      evidenceUrl: 'https://nginxproxymanager.com/setup/',
    },
  ],

  'pihole': [
    {
      id: 'docker',
      label: 'Docker (pihole/pihole)',
      description: 'Pi-hole running in a Docker container.',
      requiresInstanceUrl: true,
      authRequired: false,
      urlPlaceholder: 'http://pihole.example.com',
      versionSource: {
        type: 'json-path',
        urlTemplate: '{{instanceUrl}}/admin/api.php?versions',
        jsonPath: '$.core_current',
        authRequired: false,
      },
      latestSource: {
        type: 'docker-hub',
        target: 'pihole/pihole',
      },
      evidenceUrl: 'https://docs.pi-hole.net/api/',
    },
    {
      id: 'native',
      label: 'Native (Raspberry Pi / Linux)',
      description: 'Pi-hole installed natively on Raspberry Pi or Linux.',
      requiresInstanceUrl: true,
      authRequired: false,
      urlPlaceholder: 'http://pi.hole',
      versionSource: {
        type: 'json-path',
        urlTemplate: '{{instanceUrl}}/admin/api.php?versions',
        jsonPath: '$.core_current',
        authRequired: false,
      },
      latestSource: {
        type: 'github-releases',
        target: 'pi-hole/pi-hole',
      },
      evidenceUrl: 'https://docs.pi-hole.net/api/',
    },
  ],

  'adguard-home': [
    {
      id: 'docker',
      label: 'Docker (adguard/adguardhome)',
      description: 'AdGuard Home running in a Docker container.',
      requiresInstanceUrl: true,
      authRequired: true,
      urlPlaceholder: 'http://adguard.example.com:3000',
      versionSource: {
        type: 'json-path',
        urlTemplate: '{{instanceUrl}}/control/status',
        jsonPath: '$.version',
        authRequired: true,
      },
      latestSource: {
        type: 'github-releases',
        target: 'AdguardTeam/AdGuardHome',
      },
      evidenceUrl: 'https://adguard-dns.io/kb/adguard-home/api/',
    },
    {
      id: 'native',
      label: 'Native Binary',
      description: 'AdGuard Home installed as a native binary on Linux/macOS.',
      requiresInstanceUrl: true,
      authRequired: true,
      urlPlaceholder: 'http://192.168.1.1:3000',
      versionSource: {
        type: 'json-path',
        urlTemplate: '{{instanceUrl}}/control/status',
        jsonPath: '$.version',
        authRequired: true,
      },
      latestSource: {
        type: 'github-releases',
        target: 'AdguardTeam/AdGuardHome',
      },
      evidenceUrl: 'https://github.com/AdguardTeam/AdGuardHome/wiki/Getting-Started',
    },
  ],

  'syncthing': [
    {
      id: 'docker',
      label: 'Docker (syncthing/syncthing)',
      description: 'Syncthing running in a Docker container.',
      requiresInstanceUrl: true,
      authRequired: true,
      urlPlaceholder: 'http://syncthing.example.com:8384',
      versionSource: {
        type: 'json-path',
        urlTemplate: '{{instanceUrl}}/rest/system/version',
        jsonPath: '$.version',
        authRequired: true,
      },
      latestSource: {
        type: 'github-releases',
        target: 'syncthing/syncthing',
      },
      evidenceUrl: 'https://docs.syncthing.net/dev/rest.html',
    },
    {
      id: 'native',
      label: 'Native Binary',
      description: 'Syncthing installed natively on Linux, macOS, or Windows.',
      requiresInstanceUrl: true,
      authRequired: true,
      urlPlaceholder: 'http://localhost:8384',
      versionSource: {
        type: 'json-path',
        urlTemplate: '{{instanceUrl}}/rest/system/version',
        jsonPath: '$.version',
        authRequired: true,
      },
      latestSource: {
        type: 'github-releases',
        target: 'syncthing/syncthing',
      },
      evidenceUrl: 'https://docs.syncthing.net/dev/rest.html#system-endpoints',
    },
  ],

  'meilisearch': [
    {
      id: 'docker',
      label: 'Docker (getmeili/meilisearch)',
      description: 'Meilisearch running in a Docker container.',
      requiresInstanceUrl: true,
      authRequired: false,
      urlPlaceholder: 'http://meilisearch.example.com:7700',
      versionSource: {
        type: 'json-path',
        urlTemplate: '{{instanceUrl}}/version',
        jsonPath: '$.pkgVersion',
        authRequired: false,
      },
      latestSource: {
        type: 'github-releases',
        target: 'meilisearch/meilisearch',
      },
      evidenceUrl: 'https://www.meilisearch.com/docs/reference/api/version',
    },
    {
      id: 'cloud',
      label: 'Meilisearch Cloud',
      description: 'Meilisearch hosted on Meilisearch Cloud (cloud.meilisearch.com).',
      requiresInstanceUrl: true,
      authRequired: true,
      urlPlaceholder: 'https://your-project.meilisearch.io',
      versionSource: {
        type: 'json-path',
        urlTemplate: '{{instanceUrl}}/version',
        jsonPath: '$.pkgVersion',
        authRequired: true,
      },
      latestSource: {
        type: 'github-releases',
        target: 'meilisearch/meilisearch',
      },
      evidenceUrl: 'https://www.meilisearch.com/docs/reference/api/version',
    },
  ],

  'influxdb': [
    {
      id: 'v2-docker',
      label: 'InfluxDB v2 — Docker',
      description: 'InfluxDB v2 (Flux query language) running in Docker.',
      requiresInstanceUrl: true,
      authRequired: true,
      urlPlaceholder: 'http://influxdb.example.com:8086',
      versionSource: {
        type: 'json-path',
        urlTemplate: '{{instanceUrl}}/health',
        jsonPath: undefined,
        authRequired: false,
      },
      latestSource: {
        type: 'docker-hub',
        target: 'influxdb',
      },
      evidenceUrl: 'https://docs.influxdata.com/influxdb/v2/api/',
    },
    {
      id: 'v1-docker',
      label: 'InfluxDB v1 — Docker',
      description: 'InfluxDB v1.x (InfluxQL query language) running in Docker.',
      requiresInstanceUrl: true,
      authRequired: false,
      urlPlaceholder: 'http://influxdb.example.com:8086',
      versionSource: {
        type: 'json-path',
        urlTemplate: '{{instanceUrl}}/ping',
        jsonPath: undefined,
        authRequired: false,
      },
      latestSource: {
        type: 'docker-hub',
        target: 'influxdb',
      },
      evidenceUrl: 'https://docs.influxdata.com/influxdb/v1/tools/api/',
    },
  ],

  'plex': [
    {
      id: 'docker',
      label: 'Docker (plexinc/pms-docker)',
      description: 'Plex Media Server running in a Docker container.',
      requiresInstanceUrl: true,
      authRequired: true,
      urlPlaceholder: 'http://plex.example.com:32400',
      versionSource: {
        type: 'json-path',
        urlTemplate: '{{instanceUrl}}/identity',
        jsonPath: '$.MediaContainer.version',
        authRequired: false,
      },
      latestSource: {
        type: 'json-path',
        urlTemplate: 'https://plex.tv/api/downloads/5.json',
        jsonPath: '$.computer.Linux.version',
        authRequired: false,
      },
      evidenceUrl: 'https://www.plexopedia.com/plex-media-server/api/server/identity/',
    },
    {
      id: 'native',
      label: 'Native Install (Linux/Windows/macOS)',
      description: 'Plex Media Server installed natively on the host OS.',
      requiresInstanceUrl: true,
      authRequired: false,
      urlPlaceholder: 'http://localhost:32400',
      versionSource: {
        type: 'json-path',
        urlTemplate: '{{instanceUrl}}/identity',
        jsonPath: '$.MediaContainer.version',
        authRequired: false,
      },
      latestSource: {
        type: 'json-path',
        urlTemplate: 'https://plex.tv/api/downloads/5.json',
        jsonPath: '$.computer.Linux.version',
        authRequired: false,
      },
      evidenceUrl: 'https://www.plexopedia.com/plex-media-server/api/server/identity/',
    },
  ],

  'netdata': [
    {
      id: 'docker',
      label: 'Docker (netdata/netdata)',
      description: 'Netdata real-time monitoring running in Docker.',
      requiresInstanceUrl: true,
      authRequired: false,
      urlPlaceholder: 'http://netdata.example.com:19999',
      versionSource: {
        type: 'json-path',
        urlTemplate: '{{instanceUrl}}/api/v1/info',
        jsonPath: '$.version',
        authRequired: false,
      },
      latestSource: {
        type: 'github-releases',
        target: 'netdata/netdata',
      },
      evidenceUrl: 'https://learn.netdata.cloud/docs/agent/web/api',
    },
    {
      id: 'native',
      label: 'Native (systemd service)',
      description: 'Netdata installed natively as a system service.',
      requiresInstanceUrl: true,
      authRequired: false,
      urlPlaceholder: 'http://localhost:19999',
      versionSource: {
        type: 'json-path',
        urlTemplate: '{{instanceUrl}}/api/v1/info',
        jsonPath: '$.version',
        authRequired: false,
      },
      latestSource: {
        type: 'github-releases',
        target: 'netdata/netdata',
      },
      evidenceUrl: 'https://learn.netdata.cloud/docs/agent/web/api',
    },
  ],

  'gogs': [
    {
      id: 'docker',
      label: 'Docker (gogs/gogs)',
      description: 'Gogs self-hosted Git service running in Docker.',
      requiresInstanceUrl: true,
      authRequired: false,
      urlPlaceholder: 'http://gogs.example.com:3000',
      versionSource: {
        type: 'json-path',
        urlTemplate: '{{instanceUrl}}/api/v1/version',
        jsonPath: '$.version',
        authRequired: false,
      },
      latestSource: {
        type: 'github-releases',
        target: 'gogs/gogs',
      },
      evidenceUrl: 'https://github.com/gogs/go-gogs-client/wiki/Administration-Miscellaneous',
    },
    {
      id: 'native',
      label: 'Native Binary',
      description: 'Gogs running as a native binary on Linux.',
      requiresInstanceUrl: true,
      authRequired: false,
      urlPlaceholder: 'http://gogs.example.com:3000',
      versionSource: {
        type: 'json-path',
        urlTemplate: '{{instanceUrl}}/api/v1/version',
        jsonPath: '$.version',
        authRequired: false,
      },
      latestSource: {
        type: 'github-releases',
        target: 'gogs/gogs',
      },
      evidenceUrl: 'https://gogs.io/docs/installation',
    },
  ],

  'rancher': [
    {
      id: 'docker',
      label: 'Docker (rancher/rancher)',
      description: 'Rancher multi-cluster Kubernetes management platform running in Docker.',
      requiresInstanceUrl: true,
      authRequired: true,
      urlPlaceholder: 'https://rancher.example.com',
      versionSource: {
        type: 'json-path',
        urlTemplate: '{{instanceUrl}}/v3/settings/server-version',
        jsonPath: '$.value',
        authRequired: true,
      },
      latestSource: {
        type: 'github-releases',
        target: 'rancher/rancher',
      },
      evidenceUrl: 'https://ranchermanager.docs.rancher.com/reference-guides/cluster-configuration/rancher-server-configuration/rke1-cluster-configuration',
    },
    {
      id: 'rke2',
      label: 'RKE2 / Kubernetes Cluster',
      description: 'Rancher deployed on RKE2 or a managed Kubernetes cluster.',
      requiresInstanceUrl: true,
      authRequired: true,
      urlPlaceholder: 'https://rancher.example.com',
      versionSource: {
        type: 'json-path',
        urlTemplate: '{{instanceUrl}}/v3/settings/server-version',
        jsonPath: '$.value',
        authRequired: true,
      },
      latestSource: {
        type: 'github-releases',
        target: 'rancher/rancher',
      },
      evidenceUrl: 'https://ranchermanager.docs.rancher.com/getting-started/installation-and-upgrade/install-upgrade-on-a-kubernetes-cluster',
    },
  ],

  'woodpecker-ci': [
    {
      id: 'docker',
      label: 'Docker Compose (server + agent)',
      description: 'Woodpecker CI server + agent running via Docker Compose.',
      requiresInstanceUrl: true,
      authRequired: true,
      urlPlaceholder: 'http://woodpecker.example.com',
      versionSource: {
        type: 'json-path',
        urlTemplate: '{{instanceUrl}}/api/version',
        jsonPath: '$.source',
        authRequired: false,
      },
      latestSource: {
        type: 'github-releases',
        target: 'woodpecker-ci/woodpecker',
      },
      evidenceUrl: 'https://woodpecker-ci.org/docs/next/api-usage',
    },
  ],

  'docker-engine': [
    {
      id: 'docker',
      label: 'Docker Engine (Docker socket / local API)',
      description: 'Docker Engine running locally — version via Docker API. Requires Docker socket or TCP API to be exposed.',
      requiresInstanceUrl: true,
      authRequired: false,
      urlPlaceholder: 'http://localhost:2375',
      versionSource: {
        type: 'json-path',
        urlTemplate: '{{instanceUrl}}/version',
        jsonPath: '$.Version',
        authRequired: false,
      },
      latestSource: {
        type: 'github-releases',
        target: 'moby/moby',
      },
      evidenceUrl: 'https://docs.docker.com/engine/api/v1.43/#tag/System/operation/SystemVersion',
    },
  ],

  'authelia': [
    {
      id: 'docker',
      label: 'Docker',
      description: 'Authelia running via Docker. No native version endpoint — tracks upstream GitHub releases.',
      requiresInstanceUrl: true,
      authRequired: false,
      urlPlaceholder: 'https://auth.example.com',
      versionSource: {
        type: 'github-releases',
        target: 'authelia/authelia',
      },
      latestSource: {
        type: 'github-releases',
        target: 'authelia/authelia',
      },
      evidenceUrl: 'https://github.com/authelia/authelia/releases',
    },
    {
      id: 'bare-metal',
      label: 'Bare-metal / Binary',
      description: 'Authelia installed as a binary. No native version endpoint — tracks upstream GitHub releases.',
      requiresInstanceUrl: true,
      authRequired: false,
      urlPlaceholder: 'https://auth.example.com',
      versionSource: {
        type: 'github-releases',
        target: 'authelia/authelia',
      },
      latestSource: {
        type: 'github-releases',
        target: 'authelia/authelia',
      },
      evidenceUrl: 'https://github.com/authelia/authelia/releases',
    },
  ],

  'rabbitmq': [
    {
      id: 'docker',
      label: 'Docker',
      description: 'RabbitMQ in Docker. Version via management API.',
      requiresInstanceUrl: true,
      authRequired: true,
      urlPlaceholder: 'http://rabbitmq.example.com:15672',
      versionSource: {
        type: 'json-path',
        urlTemplate: '{{instanceUrl}}/api/overview',
        jsonPath: '$.rabbitmq_version',
        authRequired: true,
      },
      latestSource: {
        type: 'github-releases',
        target: 'rabbitmq/rabbitmq-server',
      },
      evidenceUrl: 'https://rawcdn.githack.com/rabbitmq/rabbitmq-management/v3.12.0/priv/www/api/index.html',
    },
    {
      id: 'bare-metal',
      label: 'Bare-metal / Debian / RPM',
      description: 'RabbitMQ installed natively. Management plugin must be enabled for version API.',
      requiresInstanceUrl: true,
      authRequired: true,
      urlPlaceholder: 'http://localhost:15672',
      versionSource: {
        type: 'json-path',
        urlTemplate: '{{instanceUrl}}/api/overview',
        jsonPath: '$.rabbitmq_version',
        authRequired: true,
      },
      latestSource: {
        type: 'github-releases',
        target: 'rabbitmq/rabbitmq-server',
      },
      evidenceUrl: 'https://rawcdn.githack.com/rabbitmq/rabbitmq-management/v3.12.0/priv/www/api/index.html',
    },
  ],

  'nats': [
    {
      id: 'docker',
      label: 'Docker',
      description: 'NATS running via Docker. Version via monitoring endpoint.',
      requiresInstanceUrl: true,
      authRequired: false,
      urlPlaceholder: 'http://nats.example.com:8222',
      versionSource: {
        type: 'json-path',
        urlTemplate: '{{instanceUrl}}/varz',
        jsonPath: '$.version',
        authRequired: false,
      },
      latestSource: {
        type: 'github-releases',
        target: 'nats-io/nats-server',
      },
      evidenceUrl: 'https://docs.nats.io/running-a-nats-service/nats_admin/monitoring#general-information',
    },
    {
      id: 'bare-metal',
      label: 'Bare-metal / Binary',
      description: 'NATS Server binary. Monitoring port 8222 must be enabled.',
      requiresInstanceUrl: true,
      authRequired: false,
      urlPlaceholder: 'http://localhost:8222',
      versionSource: {
        type: 'json-path',
        urlTemplate: '{{instanceUrl}}/varz',
        jsonPath: '$.version',
        authRequired: false,
      },
      latestSource: {
        type: 'github-releases',
        target: 'nats-io/nats-server',
      },
      evidenceUrl: 'https://docs.nats.io/running-a-nats-service/nats_admin/monitoring#general-information',
    },
  ],

  'node-red': [
    {
      id: 'docker',
      label: 'Docker',
      description: 'Node-RED in Docker. Version via admin API.',
      requiresInstanceUrl: true,
      authRequired: false,
      urlPlaceholder: 'http://node-red.example.com:1880',
      versionSource: {
        type: 'json-path',
        urlTemplate: '{{instanceUrl}}/red/settings',
        jsonPath: '$.version',
        authRequired: false,
      },
      latestSource: {
        type: 'npm-registry',
        target: 'node-red',
      },
      evidenceUrl: 'https://nodered.org/docs/api/admin/methods/get/settings/',
    },
    {
      id: 'npm',
      label: 'npm / bare-metal',
      description: 'Node-RED installed via npm or as a system service.',
      requiresInstanceUrl: true,
      authRequired: false,
      urlPlaceholder: 'http://localhost:1880',
      versionSource: {
        type: 'json-path',
        urlTemplate: '{{instanceUrl}}/red/settings',
        jsonPath: '$.version',
        authRequired: false,
      },
      latestSource: {
        type: 'npm-registry',
        target: 'node-red',
      },
      evidenceUrl: 'https://nodered.org/docs/api/admin/methods/get/settings/',
    },
  ],

  'matrix-synapse': [
    {
      id: 'docker',
      label: 'Docker',
      description: 'Matrix Synapse in Docker. Version via federation endpoint.',
      requiresInstanceUrl: true,
      authRequired: false,
      urlPlaceholder: 'https://matrix.example.com',
      versionSource: {
        type: 'json-path',
        urlTemplate: '{{instanceUrl}}/_matrix/federation/v1/version',
        jsonPath: '$.server.version',
        authRequired: false,
      },
      latestSource: {
        type: 'github-releases',
        target: 'element-hq/synapse',
      },
      evidenceUrl: 'https://spec.matrix.org/v1.8/server-server-api/#get_matrixfederationv1version',
    },
    {
      id: 'bare-metal',
      label: 'Bare-metal / pip',
      description: 'Synapse installed via pip or Debian packages.',
      requiresInstanceUrl: true,
      authRequired: false,
      urlPlaceholder: 'https://matrix.example.com',
      versionSource: {
        type: 'json-path',
        urlTemplate: '{{instanceUrl}}/_matrix/federation/v1/version',
        jsonPath: '$.server.version',
        authRequired: false,
      },
      latestSource: {
        type: 'github-releases',
        target: 'element-hq/synapse',
      },
      evidenceUrl: 'https://spec.matrix.org/v1.8/server-server-api/#get_matrixfederationv1version',
    },
  ],

  'rocketchat': [
    {
      id: 'docker',
      label: 'Docker',
      description: 'Rocket.Chat in Docker. Version via REST API info endpoint.',
      requiresInstanceUrl: true,
      authRequired: false,
      urlPlaceholder: 'https://chat.example.com',
      versionSource: {
        type: 'json-path',
        urlTemplate: '{{instanceUrl}}/api/v1/info',
        jsonPath: '$.info.version',
        authRequired: false,
      },
      latestSource: {
        type: 'github-releases',
        target: 'RocketChat/Rocket.Chat',
      },
      evidenceUrl: 'https://developer.rocket.chat/apidoc/rest-api/endpoints/server-endpoint/rest-info',
    },
    {
      id: 'bare-metal',
      label: 'Bare-metal / snap',
      description: 'Rocket.Chat installed via snap or Node.js.',
      requiresInstanceUrl: true,
      authRequired: false,
      urlPlaceholder: 'https://chat.example.com',
      versionSource: {
        type: 'json-path',
        urlTemplate: '{{instanceUrl}}/api/v1/info',
        jsonPath: '$.info.version',
        authRequired: false,
      },
      latestSource: {
        type: 'github-releases',
        target: 'RocketChat/Rocket.Chat',
      },
      evidenceUrl: 'https://developer.rocket.chat/apidoc/rest-api/endpoints/server-endpoint/rest-info',
    },
  ],

  'discourse': [
    {
      id: 'docker',
      label: 'Docker (official install)',
      description: 'Discourse via official Docker launcher. Version from admin API.',
      requiresInstanceUrl: true,
      authRequired: true,
      urlPlaceholder: 'https://forum.example.com',
      versionSource: {
        type: 'json-path',
        urlTemplate: '{{instanceUrl}}/admin/version_check.json',
        jsonPath: '$.installed_version',
        authRequired: true,
      },
      latestSource: {
        type: 'github-releases',
        target: 'discourse/discourse',
      },
      evidenceUrl: 'https://docs.discourse.org/#tag/Admin/operation/adminVersionCheck',
    },
  ],

  'zulip': [
    {
      id: 'docker',
      label: 'Docker',
      description: 'Zulip in Docker. Version via server settings API.',
      requiresInstanceUrl: true,
      authRequired: false,
      urlPlaceholder: 'https://zulip.example.com',
      versionSource: {
        type: 'json-path',
        urlTemplate: '{{instanceUrl}}/api/v1/server_settings',
        jsonPath: '$.zulip_version',
        authRequired: false,
      },
      latestSource: {
        type: 'github-releases',
        target: 'zulip/zulip',
      },
      evidenceUrl: 'https://zulip.com/api/get-server-settings',
    },
    {
      id: 'bare-metal',
      label: 'Bare-metal / Ubuntu',
      description: 'Zulip installed on Ubuntu via official installer.',
      requiresInstanceUrl: true,
      authRequired: false,
      urlPlaceholder: 'https://zulip.example.com',
      versionSource: {
        type: 'json-path',
        urlTemplate: '{{instanceUrl}}/api/v1/server_settings',
        jsonPath: '$.zulip_version',
        authRequired: false,
      },
      latestSource: {
        type: 'github-releases',
        target: 'zulip/zulip',
      },
      evidenceUrl: 'https://zulip.com/api/get-server-settings',
    },
  ],

  'pocketbase': [
    {
      id: 'binary',
      label: 'Binary (Linux/Mac)',
      description: 'PocketBase running as a self-contained binary. Version via API info endpoint.',
      requiresInstanceUrl: true,
      authRequired: false,
      urlPlaceholder: 'https://pb.example.com',
      versionSource: {
        type: 'json-path',
        urlTemplate: '{{instanceUrl}}/api/health',
        jsonPath: '$.code',
        authRequired: false,
      },
      latestSource: {
        type: 'github-releases',
        target: 'pocketbase/pocketbase',
      },
      evidenceUrl: 'https://pocketbase.io/docs/api-health/',
    },
    {
      id: 'docker',
      label: 'Docker',
      description: 'PocketBase in Docker container. Version via health endpoint.',
      requiresInstanceUrl: true,
      authRequired: false,
      urlPlaceholder: 'https://pb.example.com',
      versionSource: {
        type: 'json-path',
        urlTemplate: '{{instanceUrl}}/api/health',
        jsonPath: '$.code',
        authRequired: false,
      },
      latestSource: {
        type: 'github-releases',
        target: 'pocketbase/pocketbase',
      },
      evidenceUrl: 'https://pocketbase.io/docs/api-health/',
    },
  ],

  'frigate': [
    {
      id: 'docker',
      label: 'Docker',
      description: 'Frigate NVR via Docker. Version via API endpoint.',
      requiresInstanceUrl: true,
      authRequired: false,
      urlPlaceholder: 'http://frigate.local:5000',
      versionSource: {
        type: 'json-path',
        urlTemplate: '{{instanceUrl}}/api/version',
        jsonPath: '$',
        authRequired: false,
      },
      latestSource: {
        type: 'github-releases',
        target: 'blakeblackshear/frigate',
      },
      evidenceUrl: 'https://docs.frigate.video/integrations/api/#get-apiver',
    },
  ],

  'appwrite': [
    {
      id: 'docker',
      label: 'Docker (self-hosted)',
      description: 'Appwrite self-hosted via Docker. Version via health endpoint.',
      requiresInstanceUrl: true,
      authRequired: false,
      urlPlaceholder: 'https://appwrite.example.com',
      versionSource: {
        type: 'json-path',
        urlTemplate: '{{instanceUrl}}/v1/health/version',
        jsonPath: '$.version',
        authRequired: false,
      },
      latestSource: {
        type: 'github-releases',
        target: 'appwrite/appwrite',
      },
      evidenceUrl: 'https://appwrite.io/docs/references/1.4.x/server-rest/health#getVersion',
    },
  ],

  'truenas-scale': [
    {
      id: 'bare-metal',
      label: 'TrueNAS SCALE (bare-metal)',
      description: 'TrueNAS SCALE system. Version via REST API.',
      requiresInstanceUrl: true,
      authRequired: true,
      urlPlaceholder: 'https://truenas.local',
      versionSource: {
        type: 'json-path',
        urlTemplate: '{{instanceUrl}}/api/v2.0/system/version',
        jsonPath: '$',
        authRequired: true,
      },
      latestSource: {
        type: 'github-releases',
        target: 'truenas/scale-build',
      },
      evidenceUrl: 'https://www.truenas.com/docs/scale/api/',
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

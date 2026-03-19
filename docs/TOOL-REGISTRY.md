# Tool Registry — PulseDock

The tool registry is a curated catalog of 2500+ self-hosted tools with pre-configured version check endpoints. Instead of figuring out where a tool exposes its version, users pick from the catalog and PulseDock fills in all the details.

---

## How It Works

1. User opens **Version Checks** → **New Version Check**
2. Step 1: **Browse Tool Registry** — searchable gallery of tools by category
3. User selects a tool (e.g. Portainer) — the form auto-fills:
   - Provider (GitHub/GitLab/Docker/npm/etc.)
   - Version endpoint URL template
   - JSON path to extract version
   - Recommended check interval
4. User enters their instance URL (for self-hosted tools)
5. PulseDock tests the connection and saves the monitor

---

## Registry Entry Format

Each entry in `packages/tool-registry/src/registry.ts` follows this schema:

```typescript
interface ToolRegistryEntry {
  id: string;              // unique slug, e.g. "portainer"
  name: string;            // display name, e.g. "Portainer"
  category: ToolCategory;  // see categories below
  tags: string[];          // searchable tags
  icon: string;            // Simple Icons CDN URL
  description: string;     // one-line description
  homepage: string;        // official project URL

  versionSource: {
    type: "json-path" | "github-releases" | "github-tags"
        | "docker-hub" | "npm-registry" | "pypi" | "cargo"
        | "maven" | "helm" | "gitlab-releases" | "html-scrape";
    urlTemplate?: string;  // e.g. "{{instanceUrl}}/api/status"
    jsonPath?: string;     // e.g. "$.Version"
    target?: string;       // repo/package name
    authRequired?: boolean;
  };

  latestSource: {
    type: "github-releases" | "github-tags" | "gitlab-releases"
        | "docker-hub" | "npm-registry" | "pypi" | "cargo"
        | "maven" | "helm";
    target?: string;       // e.g. "portainer/portainer"
  };

  checkInterval: number;   // seconds, default 3600
  requiresInstanceUrl: boolean;
  verified: boolean;       // manually verified against real instance
}
```

---

## Categories

| Category | Examples |
|---|---|
| `Container` | Portainer, Rancher, Docker, k3s |
| `CI/CD` | GitLab, Gitea, Jenkins, ArgoCD, Woodpecker |
| `Database` | PostgreSQL, MySQL, Redis, MongoDB, Elasticsearch |
| `Observability` | Grafana, Prometheus, Loki, Zabbix, SigNoz |
| `Security` | Vault, Vaultwarden, Keycloak, Authentik, CrowdSec |
| `Networking` | Nginx, Traefik, Caddy, Pi-hole, AdGuard, WireGuard |
| `Storage` | MinIO, Nextcloud, Syncthing, TrueNAS |
| `CMS` | WordPress, Ghost, Strapi, Directus, PocketBase |
| `Communication` | Mattermost, Rocket.Chat, Matrix, Jitsi |
| `Media` | Jellyfin, Plex, Immich, Navidrome |
| `Dev Tools` | code-server, Gitpod, n8n, Jupyter, Plane |
| `Infrastructure` | Terraform, Ansible, Pulumi, Atlantis |
| `Messaging` | RabbitMQ, Kafka, NATS, Mosquitto |
| `API` | Kong, APISIX, Hasura, PostgREST |
| `AI/ML` | Ollama, LocalAI, vLLM, MLflow |
| `IoT` | Home Assistant, Node-RED, ESPHome, Zigbee2MQTT |
| `Cloud` | Kubernetes, Helm, ArgoCD, FluxCD |

---

## API Endpoint

```
GET /v1/tool-registry
  ?q=gitl         # fuzzy search (name, tags, description)
  &category=CI/CD # filter by category
```

Returns the full list (or filtered subset). Cached in memory on startup.

---

## Adding a New Tool

1. Open `packages/tool-registry/src/registry.ts`
2. Find the appropriate `REGISTRY_PART*` array for the category
3. Add a new entry following the schema above
4. Validate: `npm run registry:lint`
5. Verify the icon URL works: `https://cdn.simpleicons.org/{slug}`
6. Commit and submit a PR

### Example: Adding a new self-hosted tool

```typescript
{
  id: "my-tool",
  name: "My Tool",
  category: "Dev Tools",
  tags: ["devops", "self-hosted"],
  icon: "https://cdn.simpleicons.org/mytool",
  description: "Short one-line description",
  homepage: "https://mytool.io",
  versionSource: {
    type: "json-path",
    urlTemplate: "{{instanceUrl}}/api/version",
    jsonPath: "$.version",
    authRequired: false,
  },
  latestSource: {
    type: "github-releases",
    target: "myorg/mytool",
  },
  checkInterval: 3600,
  requiresInstanceUrl: true,
  verified: false,  // set true after testing against a real instance
}
```

### Finding the version endpoint

Common patterns:
- `GET /api/version` → `{"version": "1.2.3"}`
- `GET /api/status` → `{"Version": "1.2.3", ...}`
- `GET /-/readyz` → version in response body or header
- GitHub Releases API: `https://api.github.com/repos/{owner}/{repo}/releases/latest`
- Docker Hub: latest tag from `https://hub.docker.com/v2/repositories/{image}/tags`

Test with curl before adding:
```bash
curl -s https://your-instance/api/version | jq .
```

---

## Linting

Run the registry linter to catch issues before committing:

```bash
npm run registry:lint
```

The linter checks for:
- Duplicate IDs
- Missing required fields (`id`, `name`, `category`, `icon`, `versionSource`, `latestSource`)
- Invalid category values
- Malformed IDs (must be lowercase, alphanumeric + hyphens)
- Missing `target` for source types that require it

---

## Simple Icons

All tool icons use the [Simple Icons](https://simpleicons.org) CDN:

```
https://cdn.simpleicons.org/{slug}
```

If a tool doesn't have a Simple Icons entry, use a generic fallback:
```
https://cdn.simpleicons.org/docker   # for container tools
https://cdn.simpleicons.org/github   # for GitHub-hosted tools
```

To verify a slug works:
```bash
curl -sI https://cdn.simpleicons.org/portainer | head -1
# HTTP/2 200 ✓
```

---

## Registry Statistics

| Metric | Count |
|---|---|
| Total tools | 2500+ |
| Categories | 17+ |
| Verified entries | ~300 |
| Providers supported | 10 |

The registry grows with every release. Community contributions welcome — see [CONTRIBUTING.md](../CONTRIBUTING.md) for the PR process.

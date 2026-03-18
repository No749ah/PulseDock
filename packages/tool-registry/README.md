# @pulsedock/tool-registry

Pre-configured version check library for 1385+ self-hosted tools. Used by the PulseDock API to power the Tool Picker in the version monitor create flow.

## What's Included

- **1385+ tools** across 20+ categories
- Pre-configured version endpoints, JSON paths, and latest-version sources
- Simple Icons CDN integration for tool logos
- TypeScript types for the full registry schema

## Categories

Container, CI/CD, Database, Observability, Security, Networking, Storage, Dev Tools, Media, Infrastructure, Messaging, CMS, Communication, Cloud, API, AI/ML, ERP/Business, Search/Vector, IoT/Edge, Photo/Docs

## Usage

```ts
import { TOOL_REGISTRY, searchTools } from '@pulsedock/tool-registry';

// Get all tools
const tools = TOOL_REGISTRY;

// Search
const results = searchTools('grafana');

// Filter by category
const containers = TOOL_REGISTRY.filter(t => t.category === 'Container');
```

## Tool Schema

```ts
interface ToolRegistryEntry {
  id: string;                    // Unique slug (e.g. "grafana")
  name: string;                  // Display name
  category: ToolCategory;        // Category enum
  tags: string[];                // Searchable tags
  icon: string;                  // Simple Icons CDN URL
  description: string;
  homepage: string;
  verified: boolean;             // Officially verified endpoint
  requiresInstanceUrl: boolean;  // Whether user must provide instance URL
  versionSource: {
    type: 'json-path' | 'github-releases' | 'docker-hub' | 'npm-registry' | ...;
    urlTemplate?: string;        // e.g. "{{instanceUrl}}/api/health"
    jsonPath?: string;           // e.g. "$.version"
    authRequired?: boolean;
  };
  latestSource: {
    type: 'github-releases' | 'github-tags' | 'docker-hub' | 'npm-registry' | ...;
    repo?: string;               // e.g. "grafana/grafana"
    package?: string;
  };
  checkInterval?: number;        // Suggested check interval (seconds)
  docsUrl?: string;
}
```

## Development

To add new tools, edit `src/registry.ts`. Tools are split into multiple `REGISTRY_PART*` arrays to avoid TypeScript complexity limits, then merged into `TOOL_REGISTRY`.

```bash
cd packages/tool-registry
npm run build   # Compile TypeScript
```

See [docs/TOOL-REGISTRY.md](../../docs/TOOL-REGISTRY.md) for usage documentation.

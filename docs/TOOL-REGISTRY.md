# Tool Registry — PulseDock

Pre-configured monitoring setup for 1300+ self-hosted tools.

## What Is It?

Instead of manually configuring version endpoints for every tool, the registry provides:
- The correct API endpoint to get the current version
- The correct source for the latest release (GitHub, Docker Hub, etc.)
- Auth requirements (token needed or not)
- Tool icon and metadata

## Using the Registry

When creating a version check:
1. Click **New Version Check**
2. The tool picker opens — search or browse by category
3. Select your tool
4. Enter your instance URL
5. PulseDock auto-fills all other fields

## Categories

Container & Orchestration, CI/CD, Database, Observability, Security, Networking, Storage, CMS, Dev Tools, Communication, Media, Infrastructure, Messaging, API, Cloud, AI/ML, IoT, and more.

## Adding Custom Tools

If your tool isn't in the registry:
1. Select **Custom** at the end of the picker
2. Configure manually
3. (Optional) Submit a PR to add it: edit `packages/tool-registry/src/registry.ts`

## Registry Format

```typescript
{
  id: 'portainer',
  name: 'Portainer',
  category: 'Container',
  tags: ['docker', 'self-hosted'],
  icon: 'https://cdn.simpleicons.org/portainer',
  description: 'Container management UI',
  homepage: 'https://portainer.io',
  versionSource: {
    type: 'json-path',
    urlTemplate: '{{instanceUrl}}/api/status',
    jsonPath: '$.Version',
    authRequired: false,
  },
  latestSource: {
    type: 'github-releases',
    target: 'portainer/portainer-ce',
  },
  checkInterval: 3600,
  requiresInstanceUrl: true,
  verified: true,
}
```

# Version Checks — PulseDock

Monitor version updates for your self-hosted tools and get alerted when new releases are available.

## What It Does

Version checks track two things:
1. **Current version** — the version running on your instance (auto-detected via API)
2. **Latest version** — the newest release available upstream (GitHub/GitLab/Docker Hub)

When they differ, you get an alert and see the diff (Minor / Major / Patch).

## Quick Start

1. Go to **Versions** in the dashboard
2. Click **New Version Check**
3. Pick a tool from the **Tool Registry** (2500+ pre-configured tools) or configure manually
4. Enter your instance URL (e.g. `https://portainer.example.com`)
5. Click **Verify Connection** — PulseDock detects your current version
6. Click **Create Check**

## Tool Registry

The tool registry has 2500+ pre-configured tools with:
- Correct version API endpoint per tool
- Auto-detection of current deployed version
- Correct auth settings (token/none)
- Latest version source (GitHub releases, Docker Hub, npm, etc.)

Search for your tool in Step 1 of the creation flow.

## Manual Configuration

For tools not in the registry:

| Field | Description | Example |
|-------|-------------|---------|
| Provider | Where to fetch latest version | github, gitlab, docker, npm |
| Target | Repo or package name | `portainer/portainer-ce` |
| App URL | Your running instance | `https://portainer.example.com` |
| Version Endpoint | API path for current version | `api/status` |
| Auth Type | none / token | none |
| Token | API key if required | `glpat-xxx` |

## Supported Providers

| Provider | Fetch latest from | Example target |
|----------|-------------------|----------------|
| `github` | GitHub releases/tags | `portainer/portainer-ce` |
| `gitlab` | GitLab releases | `gitlab-org/gitlab-foss` |
| `docker` | Docker Hub tags | `portainer/portainer-ce` |
| `npm` | npm registry | `@nestjs/core` |
| `pypi` | PyPI | `django` |
| `cargo` | crates.io | `tokio` |
| `helm` | Artifact Hub | `prometheus` |
| `maven` | Maven Central | `org.springframework.boot:spring-boot` |

## Version Diff Levels

| Color | Meaning |
|-------|---------|
| 🟢 Green | Up to date |
| 🟡 Yellow | Minor update available (x.Y.z) |
| 🟠 Orange | Patch update available (x.y.Z) |
| 🔴 Red | Major update available (X.y.z) |

## Auto-Detection

PulseDock tries common endpoints automatically:
- `/api/status`, `/api/version`, `/api/v1/version`
- `/api/health`, `/health`, `/status`
- Parses JSON for keys: `version`, `Version`, `appVersion`, etc.

If auto-detection fails, enter the endpoint manually.

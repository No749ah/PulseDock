export type VersionSourceType =
  | 'github-releases'
  | 'github-tags'
  | 'gitlab-releases'
  | 'docker-hub'
  | 'npm-registry'
  | 'pypi'
  | 'cargo'
  | 'maven-central'
  | 'helm-chart'
  | 'apt-release'
  | 'json-path'
  | 'html-scrape'
  | 'custom-endpoint'
  | 'pulsedock-agent';

export type ToolCategory =
  | 'Container'
  | 'CI/CD'
  | 'Database'
  | 'Observability'
  | 'Security'
  | 'Networking'
  | 'Storage'
  | 'CMS'
  | 'Dev Tools'
  | 'Communication'
  | 'Media'
  | 'Infrastructure'
  | 'Messaging'
  | 'API'
  | 'Cloud'
  | 'Maven Central'
  | 'Helm';

export interface VersionSource {
  type: VersionSourceType;
  /** GitHub owner/repo, docker image, npm package name, etc. */
  target?: string;
  /** GitLab host for gitlab-releases (e.g. 'gitlab.com') */
  host?: string;
  /** Template with {{instanceUrl}} placeholder */
  urlTemplate?: string;
  /** JSONPath expression to extract version from response */
  jsonPath?: string;
  /** Whether auth is required to call this endpoint */
  authRequired?: boolean;
  /** For pulsedock-agent type: shell command to get version */
  agentCommand?: string;
  /** For pulsedock-agent type: human-readable install instructions */
  agentNote?: string;
}

export interface ToolRegistryEntry {
  id: string;
  name: string;
  category: ToolCategory;
  tags: string[];
  /** URL to SVG icon — prefer Simple Icons CDN or bundled */
  icon: string;
  description: string;
  homepage: string;
  /** How to get the CURRENT (deployed) version */
  versionSource: VersionSource;
  /** How to get the LATEST (upstream) version */
  latestSource: VersionSource;
  docsUrl?: string;
  /** How to install the agent for this tool */
  agentInstallHint?: string;
  /** Suggested check interval in seconds */
  checkInterval: number;
  /** Whether instance URL is required (self-hosted tools) */
  requiresInstanceUrl: boolean;
  verified: boolean;
}

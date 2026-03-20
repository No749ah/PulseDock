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
  | 'Helm'
  | 'AI/ML'
  | 'ERP/Business'
  | 'Search/Vector'
  | 'IoT/Edge'
  | 'Photo/Docs'
  | 'Photo & Documents'
  | 'Project Management'
  | 'Identity & SSO'
  | 'Remote Access'
  | 'Download & Torrent'
  | 'Home Automation'
  | 'Analytics & BI'
  | 'Calendar & Scheduling'
  | 'Password Management'
  | 'URL Shortener'
  | 'Form & Survey'
  | 'Diagramming'
  | 'Terminal & Web Shell'
  | 'Print & 3D'
  | 'Game Servers'
  | 'Compliance & Audit';

export interface VersionSource {
  type: VersionSourceType;
  /** GitHub owner/repo, docker image, npm package name, etc. */
  target?: string;
  /** GitLab host for gitlab-releases (e.g. 'gitlab.com') */
  host?: string;
  /** Template with {{instanceUrl}} placeholder */
  urlTemplate?: string;
  /**
   * Ordered list of URL path candidates to try for version detection.
   * Each path is tried in sequence; the first successful response with
   * a parseable version wins. Paths starting with 'http' are treated as
   * absolute URLs; others are appended to the instance base URL.
   * Takes precedence over the default candidate list when specified.
   * @example ['/api/v1/version', '/version', '/api/health']
   */
  endpointFallbacks?: string[];
  /** JSONPath expression to extract version from response */
  jsonPath?: string;
  /**
   * Optional fallback keys/paths to try when jsonPath misses.
   * Used by resilient runtime extractors for heterogeneous API responses.
   */
  jsonPathExtractors?: string[];
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
  /** Whether this entry has been manually verified against a real instance */
  verified: boolean;
  /** Alternative names/abbreviations users might search for (e.g. 'k8s' → Kubernetes) */
  aliases?: string[];
  /**
   * Verification status for runtime checks.
   * - 'verified'     — manually confirmed working against a real instance
   * - 'community'    — contributed by community, not yet verified by maintainers
   * - 'experimental' — endpoint exists but may not work across versions/distros
   * - 'deprecated'   — endpoint no longer works; needs replacement
   */
  verificationStatus?: 'verified' | 'community' | 'experimental' | 'deprecated';
  /** ISO timestamp of when this entry was last verified against a live instance */
  lastVerifiedAt?: string;
  /** Tool version this entry was verified against */
  verifiedOnVersion?: string;
  /**
   * Ordered fallback sources to try if versionSource fails.
   * Enables resilient version detection across tool versions/variants.
   * Each entry is tried in sequence; the first one that returns a valid
   * version is used. Useful for tools that changed their version API path
   * across major versions or have variant-specific endpoints.
   * @example [{ type: 'json-path', urlTemplate: '{{instanceUrl}}/api/v2/version', jsonPath: '$.version' }]
   */
  versionSourceFallbacks?: VersionSource[];
}

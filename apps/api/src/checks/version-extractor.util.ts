/**
 * Utility functions for extracting version strings from JSON responses.
 * Implements a multi-step extractor pipeline for precise version detection.
 */

/** Common version-like field names searched during heuristic extraction */
const HEURISTIC_VERSION_FIELDS = [
  'version',
  'Version',
  'app_version',
  'appVersion',
  'server_version',
  'serverVersion',
  'release',
  'tag_name',
  'name',
  'build_version',
  'buildVersion',
  'current_version',
  'currentVersion',
];

/**
 * Extract a value from a nested JSON object using simple dot-notation path.
 * Supports array index notation: 'items.0.version'
 *
 * @param obj - The object to traverse
 * @param path - Dot-notation path (e.g. 'data.version', 'items.0.tag')
 * @returns The value at the path, or undefined if not found
 */
export function extractByPath(obj: unknown, path: string): unknown {
  const parts = path.split('.');
  let cur: unknown = obj;
  for (const part of parts) {
    if (cur === null || cur === undefined) return undefined;
    if (Array.isArray(cur)) {
      const idx = parseInt(part, 10);
      cur = isNaN(idx) ? undefined : cur[idx];
    } else if (typeof cur === 'object') {
      cur = (cur as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return cur;
}

/**
 * Determine if a string looks like a version value.
 * Accepts semver-like strings (e.g. "1.2.3", "v1.2", "10.2.0-beta.1").
 *
 * @param raw - String to test
 * @returns true if the string matches a version pattern
 */
export function isVersionLike(raw: string): boolean {
  return /v?\d+\.\d+/.test(raw);
}

/**
 * Strip leading `v` prefix from a version string if present.
 * Leaves the string unchanged if it does not start with `v`.
 *
 * @param version - Raw version string (e.g. 'v1.2.3')
 * @returns Normalized version without leading `v` (e.g. '1.2.3')
 */
export function stripVPrefix(version: string): string {
  return version.startsWith('v') && /^v\d/.test(version) ? version.slice(1) : version;
}

/**
 * Run the extractor pipeline against a JSON body.
 * Tries each path extractor in order; returns first non-null semver-like value.
 * Returns null if no extractor matches a version-like value.
 *
 * @param body - Parsed JSON body to extract from
 * @param extractors - Ordered list of dot-notation path strings to try
 * @returns First matching version string, or null if none matched
 */
export function runExtractorPipeline(body: unknown, extractors: string[]): string | null {
  for (const extractor of extractors) {
    const raw = extractByPath(body, extractor);
    if (typeof raw === 'string' && raw.trim()) {
      const v = raw.trim();
      if (isVersionLike(v)) return v;
    }
    // Also accept numeric values (e.g. "version": 18)
    if (typeof raw === 'number' && raw > 0) {
      return String(raw);
    }
  }
  return null;
}

/**
 * Run a heuristic extraction pass when no configured extractors match.
 * Searches top-level keys of the JSON body for common version field names.
 * Returns the first version-like value found, or null.
 *
 * @param body - Parsed JSON body to scan
 * @returns Version string from a heuristic match, or null
 */
export function runHeuristicExtraction(body: unknown): string | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null;
  const obj = body as Record<string, unknown>;

  for (const field of HEURISTIC_VERSION_FIELDS) {
    const val = obj[field];
    if (typeof val === 'string' && val.trim() && isVersionLike(val)) {
      return val.trim();
    }
  }
  return null;
}

/**
 * Full extraction strategy: configured pipeline first, heuristic fallback second.
 * Use this in version-check paths that want maximum coverage.
 *
 * @param body - Parsed JSON body
 * @param extractors - Configured extractor paths to try first
 * @returns Detected version string, or null if not found
 */
export function extractVersionWithFallback(body: unknown, extractors: string[]): string | null {
  return runExtractorPipeline(body, extractors) ?? runHeuristicExtraction(body);
}

/**
 * Normalize extractor configuration into a unified array form.
 * Handles both legacy `jsonPath` (single string, optional `$.` prefix)
 * and new `jsonPathExtractors` (array of dot-notation paths).
 * The array form takes precedence when both are provided.
 *
 * @param jsonPath - Legacy single JSONPath string (e.g. '$.version' or 'version')
 * @param jsonPathExtractors - Ordered list of dot-notation paths to try
 * @returns Unified ordered list of dot-notation paths
 */
export function normalizeExtractors(jsonPath?: string, jsonPathExtractors?: string[]): string[] {
  const result: string[] = [];
  if (jsonPathExtractors?.length) {
    result.push(...jsonPathExtractors);
  }
  if (jsonPath) {
    // Strip $. prefix if present (legacy JSONPath notation)
    result.push(jsonPath.replace(/^\$\./, ''));
  }
  return result;
}

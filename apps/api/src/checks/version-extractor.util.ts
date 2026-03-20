/**
 * Utility functions for extracting version strings from JSON responses.
 * Implements a multi-step extractor pipeline for precise version detection.
 */

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
      // Accept if it looks like a version (contains digit.digit at minimum)
      const m = raw.match(/v?\d+\.\d+/i);
      if (m) return raw.trim();
    }
  }
  return null;
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

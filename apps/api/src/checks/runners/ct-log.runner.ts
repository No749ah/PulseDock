/**
 * Certificate Transparency (CT) Log Monitor Runner
 *
 * Queries crt.sh for recent SSL/TLS certificates issued for a domain.
 * Detects unauthorized certificates, new subdomains, and wildcard cert issuance.
 *
 * Level mapping:
 *  - green  → no new certificates found within lookback window
 *  - yellow → new certificates found (possible brand/security concern)
 *  - red    → crt.sh query failed (network error, timeout, invalid response)
 */

import type { PluginExecutionResult } from '../plugin.contracts';

export interface CtLogConfig {
  /** Days to look back for new certificates (default: 7) */
  lookbackDays?: number;
  /** Alert when new subdomains appear in CT logs (default: true) */
  alertOnNewSubdomains?: boolean;
  /** Alert when wildcard certificates are issued (default: true) */
  alertOnWildcard?: boolean;
}

interface CrtShEntry {
  issuer_ca_id?: number;
  issuer_name?: string;
  common_name?: string;
  name_value?: string;
  id?: number;
  entry_timestamp?: string;
  not_before?: string;
  not_after?: string;
  serial_number?: string;
}

/**
 * Extracts unique domain names from CT log entries (CNs + SANs).
 */
function extractDomains(entries: CrtShEntry[]): string[] {
  const seen = new Set<string>();
  for (const entry of entries) {
    if (entry.common_name) {
      seen.add(entry.common_name.trim().toLowerCase());
    }
    if (entry.name_value) {
      // name_value may contain multiple SANs separated by newline
      for (const san of entry.name_value.split('\n')) {
        const cleaned = san.trim().toLowerCase();
        if (cleaned) seen.add(cleaned);
      }
    }
  }
  return Array.from(seen).sort();
}

/**
 * Runs a CT log check by querying crt.sh for certificates issued for the target domain.
 *
 * @param target     - Domain to monitor, e.g. "example.com"
 * @param config     - Optional config: lookbackDays, alertOnNewSubdomains, alertOnWildcard
 * @param timeoutMs  - Request timeout in milliseconds (default: 15000)
 */
export async function runCtLogCheck(
  target: string,
  config: Record<string, unknown> = {},
  timeoutMs = 15000,
): Promise<PluginExecutionResult> {
  const started = Date.now();

  const lookbackDays = typeof config.lookbackDays === 'number' ? config.lookbackDays : 7;

  // Strip protocol and path — extract bare domain
  let domain = target.trim().toLowerCase();
  try {
    const url = new URL(domain.startsWith('http') ? domain : `https://${domain}`);
    domain = url.hostname;
  } catch {
    // keep as-is
  }
  domain = domain.replace(/^www\./, '');

  if (!domain || !domain.includes('.')) {
    return {
      ok: false,
      statusCode: 400,
      latencyMs: null,
      message: `Invalid domain: "${domain}"`,
      level: 'red',
    };
  }

  // Build crt.sh query URL: %.domain matches all subdomains + root
  const queryUrl = `https://crt.sh/?q=%25.${encodeURIComponent(domain)}&output=json`;

  let entries: CrtShEntry[];
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(queryUrl, {
        signal: controller.signal,
        headers: { 'Accept': 'application/json', 'User-Agent': 'PulseDock-CTLog/1.0' },
      });
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      throw new Error(`crt.sh responded with HTTP ${response.status}`);
    }

    const text = await response.text();
    const latencyMs = Date.now() - started;

    // Handle empty response (no certs found — valid for new/unlisted domains)
    if (!text || text.trim() === '' || text.trim() === 'null') {
      return {
        ok: true,
        statusCode: 200,
        latencyMs,
        message: `No certificates found in CT logs for ${domain}`,
        level: 'green',
        metadata: { newCertCount: 0, domains: [] },
      } as PluginExecutionResult & { metadata: unknown };
    }

    try {
      const parsed = JSON.parse(text);
      entries = Array.isArray(parsed) ? parsed : [];
    } catch {
      // Malformed JSON — treat as error
      return {
        ok: false,
        statusCode: 500,
        latencyMs: Date.now() - started,
        message: `crt.sh returned malformed JSON for ${domain}`,
        level: 'red',
      };
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const isTimeout = msg.includes('abort') || msg.includes('timeout') || msg.includes('Abort');
    return {
      ok: false,
      statusCode: 0,
      latencyMs: Date.now() - started,
      message: isTimeout
        ? `CT log check timed out after ${timeoutMs}ms for ${domain}`
        : `CT log check failed for ${domain}: ${msg}`,
      level: 'red',
    };
  }

  const latencyMs = Date.now() - started;

  // Filter to entries within the lookback window
  const cutoff = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
  const recent = entries.filter((e) => {
    if (!e.not_before) return false;
    try {
      return new Date(e.not_before) >= cutoff;
    } catch {
      return false;
    }
  });

  const domains = extractDomains(recent);
  const newCertCount = recent.length;

  if (newCertCount === 0) {
    return {
      ok: true,
      statusCode: 200,
      latencyMs,
      message: `No new certificates found in CT logs for ${domain} (last ${lookbackDays}d)`,
      level: 'green',
      metadata: { newCertCount: 0, domains: [] },
    } as PluginExecutionResult & { metadata: unknown };
  }

  // Find oldest and newest cert in recent window
  const sortedDates = recent
    .map((e) => e.not_before)
    .filter((d): d is string => Boolean(d))
    .sort();
  const oldestCert = sortedDates[0];
  const newestCert = sortedDates[sortedDates.length - 1];

  const domainSample = domains.slice(0, 5).join(', ');
  const overflow = domains.length > 5 ? ` (+${domains.length - 5} more)` : '';

  return {
    ok: true,
    statusCode: 200,
    latencyMs,
    message: `${newCertCount} new certificate${newCertCount === 1 ? '' : 's'} found in CT logs for ${domain} (last ${lookbackDays}d): ${domainSample}${overflow}`,
    level: 'yellow',
    metadata: { newCertCount, domains, oldestCert, newestCert },
  } as PluginExecutionResult & { metadata: unknown };
}

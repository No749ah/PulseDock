/**
 * WHOIS Domain Expiry Monitor Runner
 *
 * Queries the WHOIS server for a domain and extracts the expiration date.
 * Uses raw TCP on port 43 (standard WHOIS protocol — RFC 3912).
 * No external npm dependencies required.
 *
 * Supports: .com, .net, .org, .io, .dev, .app, .co, .info, .biz, .me, .de, .uk, .fr, .nl, and more.
 *
 * Level mapping:
 *  - green  → expiry > warnDays (default 30d)
 *  - yellow → expiry ≤ warnDays but > criticalDays (default 7d)
 *  - red    → expiry ≤ criticalDays or domain not found / error
 */

import * as net from 'node:net';
import type { PluginExecutionResult } from '../plugin.contracts';

/** WHOIS server map (TLD → server). Falls back to whois.iana.org for unknown TLDs. */
const WHOIS_SERVERS: Record<string, string> = {
  com: 'whois.verisign-grs.com',
  net: 'whois.verisign-grs.com',
  org: 'whois.pir.org',
  info: 'whois.afilias.net',
  biz: 'whois.neulevel.biz',
  io: 'whois.nic.io',
  co: 'whois.nic.co',
  dev: 'whois.nic.google',
  app: 'whois.nic.google',
  page: 'whois.nic.google',
  me: 'whois.nic.me',
  tv: 'whois.nic.tv',
  cc: 'whois.nic.cc',
  us: 'whois.nic.us',
  ca: 'whois.cira.ca',
  uk: 'whois.nic.uk',
  'co.uk': 'whois.nic.uk',
  de: 'whois.denic.de',
  fr: 'whois.nic.fr',
  nl: 'whois.domain-registry.nl',
  eu: 'whois.eu',
  au: 'whois.auda.org.au',
  'com.au': 'whois.auda.org.au',
  jp: 'whois.jprs.jp',
  cn: 'whois.cnnic.cn',
  ru: 'whois.tcinet.ru',
  br: 'whois.registro.br',
  in: 'whois.registry.in',
  mx: 'whois.mx',
  se: 'whois.iis.se',
  no: 'whois.norid.no',
  fi: 'whois.fi',
  ch: 'whois.nic.ch',
  at: 'whois.nic.at',
  be: 'whois.dns.be',
  pl: 'whois.dns.pl',
  es: 'whois.nic.es',
  it: 'whois.nic.it',
  pt: 'whois.dns.pt',
  nz: 'whois.srs.net.nz',
  sg: 'whois.sgnic.sg',
  hk: 'whois.hkirc.hk',
  xyz: 'whois.nic.xyz',
  club: 'whois.nic.club',
  online: 'whois.nic.online',
  shop: 'whois.nic.shop',
  tech: 'whois.nic.tech',
  ai: 'whois.nic.ai',
  cloud: 'whois.nic.cloud',
  store: 'whois.nic.store',
  site: 'whois.nic.site',
  website: 'whois.nic.website',
  media: 'whois.nic.media',
  agency: 'whois.nic.agency',
  network: 'whois.nic.network',
  studio: 'whois.nic.studio',
  solutions: 'whois.nic.solutions',
  services: 'whois.nic.services',
  software: 'whois.nic.software',
  systems: 'whois.nic.systems',
  global: 'whois.nic.global',
  live: 'whois.nic.live',
  pro: 'whois.nic.pro',
  mobi: 'whois.dotmobiregistry.net',
};

/** Common expiry date field names in WHOIS responses (case-insensitive). */
const EXPIRY_KEYS = [
  'registry expiry date',
  'expiry date',
  'expiration date',
  'expires',
  'expire',
  'paid-till',
  'renewal date',
  'registrar registration expiration date',
  'registrar expiry date',
  'domain expiration date',
  'expires on',
  'expiration time',
];

/**
 * Resolves the WHOIS server for a given domain by examining its TLD/SLD.
 */
function resolveWhoisServer(domain: string): string {
  const parts = domain.toLowerCase().split('.');
  // Try 2-part TLD first (e.g. co.uk)
  if (parts.length >= 3) {
    const twoPartTld = parts.slice(-2).join('.');
    if (WHOIS_SERVERS[twoPartTld]) return WHOIS_SERVERS[twoPartTld];
  }
  // Single TLD
  const tld = parts[parts.length - 1];
  return WHOIS_SERVERS[tld] ?? 'whois.iana.org';
}

/**
 * Sends a WHOIS query via TCP on port 43 and returns the raw response text.
 * Per RFC 3912: client sends "<query>\r\n", server responds with data, then closes.
 */
function queryWhoisServer(server: string, query: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: server, port: 43 });
    const chunks: Buffer[] = [];
    let settled = false;

    const done = (err?: Error) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (err) reject(err);
      else resolve(Buffer.concat(chunks).toString('utf8'));
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => {
      socket.write(`${query}\r\n`);
    });
    socket.on('data', (chunk) => chunks.push(chunk));
    socket.once('end', () => done());
    socket.once('close', () => done());
    socket.once('timeout', () => done(new Error(`WHOIS timeout after ${timeoutMs}ms`)));
    socket.once('error', (err) => done(err));
  });
}

/**
 * Parses an expiry date from a raw WHOIS response string.
 * Returns a Date object or null if not found.
 */
export function parseWhoisExpiry(raw: string): Date | null {
  const lines = raw.split('\n');
  for (const line of lines) {
    const lower = line.toLowerCase().trim();
    const matched = EXPIRY_KEYS.some((key) => lower.startsWith(key));
    if (!matched) continue;

    // Extract the value after the colon
    const colonIdx = line.indexOf(':');
    if (colonIdx < 0) continue;
    const rawValue = line.slice(colonIdx + 1).trim();
    if (!rawValue) continue;

    // Try parsing as ISO date or common date formats
    const parsed = new Date(rawValue);
    if (!isNaN(parsed.getTime())) return parsed;

    // Handle "YYYY.MM.DD HH:mm:ss" (some WHOIS servers)
    const dotMatch = rawValue.match(/(\d{4})\.(\d{2})\.(\d{2})/);
    if (dotMatch) {
      const parsed2 = new Date(`${dotMatch[1]}-${dotMatch[2]}-${dotMatch[3]}`);
      if (!isNaN(parsed2.getTime())) return parsed2;
    }

    // Handle "DD-Mon-YYYY" format (e.g. 01-Jan-2025)
    const dmyMatch = rawValue.match(/^(\d{2})-([A-Za-z]{3})-(\d{4})/);
    if (dmyMatch) {
      const parsed3 = new Date(`${dmyMatch[2]} ${dmyMatch[1]}, ${dmyMatch[3]}`);
      if (!isNaN(parsed3.getTime())) return parsed3;
    }
  }
  return null;
}

export interface WhoisCheckConfig {
  /** Days before expiry to warn (default: 30) */
  warnDays?: number;
  /** Days before expiry to trigger critical/red (default: 7) */
  criticalDays?: number;
}

/**
 * Runs a WHOIS domain expiry check for the given target (domain name).
 *
 * @param target     - Domain name, e.g. "example.com" or "https://example.com"
 * @param config     - Optional config: warnDays, criticalDays
 * @param timeoutMs  - Socket timeout in milliseconds
 */
export async function runWhoisCheck(
  target: string,
  config: WhoisCheckConfig = {},
  timeoutMs = 10000,
): Promise<PluginExecutionResult> {
  const started = Date.now();
  const warnDays = config.warnDays ?? 30;
  const criticalDays = config.criticalDays ?? 7;

  // Strip protocol and path — extract bare domain
  let domain = target.trim().toLowerCase();
  try {
    const url = new URL(domain.startsWith('http') ? domain : `https://${domain}`);
    domain = url.hostname;
  } catch {
    // keep as-is
  }
  // Strip www prefix
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

  const server = resolveWhoisServer(domain);

  let raw: string;
  try {
    raw = await queryWhoisServer(server, domain, timeoutMs);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      statusCode: 0,
      latencyMs: Date.now() - started,
      message: `WHOIS query failed (${server}): ${msg}`,
      level: 'red',
    };
  }

  const latencyMs = Date.now() - started;

  // Check for "not found" responses
  const rawLower = raw.toLowerCase();
  if (
    rawLower.includes('no match for') ||
    rawLower.includes('not found') ||
    rawLower.includes('no data found') ||
    rawLower.includes('object does not exist')
  ) {
    return {
      ok: false,
      statusCode: 404,
      latencyMs,
      message: `Domain "${domain}" not found in WHOIS`,
      level: 'red',
    };
  }

  // Check if we were referred to another server (IANA often does this)
  const referralMatch = raw.match(/refer:\s+(.+)/i);
  if (referralMatch) {
    const referralServer = referralMatch[1].trim();
    try {
      const referralRaw = await queryWhoisServer(referralServer, domain, timeoutMs);
      raw = referralRaw;
    } catch {
      // ignore referral failure — use original response
    }
  }

  const expiryDate = parseWhoisExpiry(raw);

  if (!expiryDate) {
    // WHOIS responded but no expiry date found — not necessarily bad (some ccTLDs don't publish it)
    return {
      ok: true,
      statusCode: 200,
      latencyMs,
      message: `WHOIS: ${domain} — expiry date not published by registrar`,
      level: 'yellow',
    };
  }

  const now = Date.now();
  const daysRemaining = Math.ceil((expiryDate.getTime() - now) / (1000 * 60 * 60 * 24));
  const expiryStr = expiryDate.toISOString().split('T')[0];

  if (daysRemaining <= 0) {
    return {
      ok: false,
      statusCode: 410,
      latencyMs,
      message: `Domain "${domain}" expired on ${expiryStr}`,
      level: 'red',
    };
  }

  if (daysRemaining <= criticalDays) {
    return {
      ok: false,
      statusCode: 200,
      latencyMs,
      message: `Domain "${domain}" expires in ${daysRemaining}d (${expiryStr}) — CRITICAL`,
      level: 'red',
    };
  }

  if (daysRemaining <= warnDays) {
    return {
      ok: true,
      statusCode: 200,
      latencyMs,
      message: `Domain "${domain}" expires in ${daysRemaining}d (${expiryStr}) — warning`,
      level: 'yellow',
    };
  }

  return {
    ok: true,
    statusCode: 200,
    latencyMs,
    message: `Domain "${domain}" expires in ${daysRemaining}d (${expiryStr})`,
    level: 'green',
  };
}

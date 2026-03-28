/**
 * Network check runners: TCP, SSL, DNS, Ping, SMTP.
 * Extracted from ChecksService to keep the service focused on orchestration.
 */

import * as net from 'node:net';
import * as tls from 'node:tls';
import * as dns from 'node:dns/promises';
import { execFile } from 'node:child_process';
import type { PluginExecutionResult } from '../plugin.contracts';

export async function runTcpCheck(target: string, timeoutMs = 5000): Promise<PluginExecutionResult> {
  const started = Date.now();
  const normalized = target.trim();
  const [host, portRaw] = normalized.split(':');
  const port = Number(portRaw);

  if (!host || !Number.isInteger(port) || port <= 0 || port > 65535) {
    return {
      ok: false,
      statusCode: 400,
      latencyMs: null,
      message: 'Invalid TCP target. Use host:port (e.g. db.example.com:5432)',
      level: 'red' as const,
    };
  }

  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    let settled = false;

    const finalize = (payload: { ok: boolean; message: string; level: 'green' | 'yellow' | 'red'; statusCode?: number; latencyMs?: number | null }) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve({
        ok: payload.ok,
        statusCode: payload.statusCode ?? (payload.ok ? 200 : 0),
        latencyMs: payload.latencyMs ?? (payload.ok ? Date.now() - started : null),
        message: payload.message,
        level: payload.level,
      });
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finalize({ ok: true, message: `TCP connect ok (${host}:${port})`, level: 'green' }));
    socket.once('timeout', () => finalize({ ok: false, message: `TCP timeout (${host}:${port})`, level: 'red' }));
    socket.once('error', (err) => finalize({ ok: false, message: `TCP error: ${err.message}`, level: 'red' }));
  });
}

export function normalizeSslHost(target: string): string | null {
  const raw = target.trim();
  if (!raw) return null;

  try {
    const withProto = raw.startsWith('http://') || raw.startsWith('https://') ? raw : `https://${raw}`;
    const parsed = new URL(withProto);
    return parsed.hostname || null;
  } catch {
    return null;
  }
}

export async function runSslCheck(target: string, timeoutMs = 5000): Promise<PluginExecutionResult> {
  const host = normalizeSslHost(target);
  if (!host) {
    return {
      ok: false,
      statusCode: 400,
      latencyMs: null,
      message: 'Invalid SSL target. Use domain or HTTPS URL',
      level: 'red' as const,
    };
  }

  const started = Date.now();

  return new Promise((resolve) => {
    const socket = tls.connect({ host, port: 443, servername: host, rejectUnauthorized: false, timeout: timeoutMs }, () => {
      const cert = socket.getPeerCertificate();
      socket.end();

      const validTo = typeof cert?.valid_to === 'string' ? cert.valid_to : '';
      const expiresAt = validTo ? new Date(validTo) : null;
      if (!expiresAt || Number.isNaN(expiresAt.getTime())) {
        resolve({
          ok: false,
          statusCode: 0,
          latencyMs: null,
          message: 'SSL certificate metadata unavailable',
          level: 'red' as const,
        });
        return;
      }

      const daysLeft = Math.floor((expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
      const isoDate = expiresAt.toISOString().slice(0, 10);

      if (daysLeft < 0) {
        resolve({
          ok: false,
          statusCode: 0,
          latencyMs: Date.now() - started,
          message: `SSL cert EXPIRED (${isoDate})`,
          level: 'red' as const,
        });
        return;
      }

      const level = daysLeft > 30 ? 'green' : daysLeft >= 10 ? 'yellow' : 'red';
      resolve({
        ok: daysLeft > 0,
        statusCode: 200,
        latencyMs: Date.now() - started,
        message: `SSL cert expires in ${daysLeft} days (${isoDate})`,
        level,
      });
    });

    socket.once('timeout', () => {
      socket.destroy();
      resolve({
        ok: false,
        statusCode: 0,
        latencyMs: null,
        message: `SSL check timeout (${host})`,
        level: 'red' as const,
      });
    });

    socket.once('error', (err) => {
      socket.destroy();
      resolve({
        ok: false,
        statusCode: 0,
        latencyMs: null,
        message: `SSL check failed: ${err.message}`,
        level: 'red' as const,
      });
    });
  });
}

export async function runDnsCheck(
  target: string,
  config: Record<string, unknown>,
  timeoutMs = 5000,
): Promise<PluginExecutionResult> {
  const hostname = target.trim().replace(/^https?:\/\//i, '').split('/')[0].split(':')[0];
  if (!hostname) {
    return { ok: false, statusCode: 400, latencyMs: null, message: 'Invalid DNS target — provide a hostname', level: 'red' as const };
  }

  const recordType = (typeof config.recordType === 'string' ? config.recordType.toUpperCase() : 'A') as 'A' | 'AAAA' | 'MX' | 'TXT' | 'CNAME' | 'NS';
  const expectedValue = typeof config.expectedValue === 'string' && config.expectedValue.trim() ? config.expectedValue.trim() : null;
  /** When true, caller will compare resolved records against a stored baseline. */
  const detectChanges = config.detectChanges === true;
  /** Pre-sorted baseline records stored from the first successful check. */
  const baseline: string[] | null = Array.isArray(config.dnsBaseline) ? (config.dnsBaseline as string[]) : null;

  const started = Date.now();

  try {
    let resolved: string[] = [];
    await Promise.race([
      (async () => {
        switch (recordType) {
          case 'A':    resolved = await dns.resolve4(hostname); break;
          case 'AAAA': resolved = await dns.resolve6(hostname); break;
          case 'CNAME': resolved = [await dns.resolveCname(hostname).then(r => r[0] ?? '')]; break;
          case 'NS':   resolved = await dns.resolveNs(hostname); break;
          case 'TXT':  resolved = (await dns.resolveTxt(hostname)).map(a => a.join('')); break;
          case 'MX':   resolved = (await dns.resolveMx(hostname)).map(r => `${r.exchange} (${r.priority})`); break;
          default:     resolved = await dns.resolve4(hostname);
        }
      })(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('DNS lookup timed out')), timeoutMs)),
    ]);

    const latencyMs = Date.now() - started;
    const first = resolved[0] ?? '';
    const sortedResolved = [...resolved].sort();

    if (expectedValue && !resolved.some(r => r.includes(expectedValue))) {
      return {
        ok: false,
        statusCode: 0,
        latencyMs,
        message: `DNS resolved but expected value "${expectedValue}" not found in ${recordType} records: ${resolved.slice(0, 3).join(', ')}`,
        level: 'yellow' as const,
        resolvedRecords: sortedResolved,
      };
    }

    // ── DNS Change Detection ──────────────────────────────────────────────────────────
    // If detectChanges is enabled and a baseline exists, compare current records vs baseline.
    // If no baseline yet (first run), return resolvedRecords so caller can persist it.
    if (detectChanges && baseline !== null) {
      const sortedBaseline = [...baseline].sort();
      const added = sortedResolved.filter(r => !sortedBaseline.includes(r));
      const removed = sortedBaseline.filter(r => !sortedResolved.includes(r));

      if (added.length > 0 || removed.length > 0) {
        const parts: string[] = [];
        if (added.length > 0) parts.push(`+[${added.slice(0, 3).join(', ')}]`);
        if (removed.length > 0) parts.push(`-[${removed.slice(0, 3).join(', ')}]`);
        return {
          ok: false,
          statusCode: 0,
          latencyMs,
          message: `DNS ${recordType} records changed for ${hostname}: ${parts.join(' ')}`,
          level: 'red' as const,
          resolvedRecords: sortedResolved,
        };
      }
    }
    // ─────────────────────────────────────────────────────────────────────────────────

    return {
      ok: true,
      statusCode: 200,
      latencyMs,
      message: `${recordType} resolved: ${resolved.length > 1 ? `${first} (+${resolved.length - 1} more)` : first}`,
      level: latencyMs > 2000 ? 'yellow' : 'green' as const,
      resolvedRecords: sortedResolved,
    };
  } catch (error) {
    const latencyMs = Date.now() - started;
    return {
      ok: false,
      statusCode: 0,
      latencyMs,
      message: error instanceof Error ? `DNS ${recordType} failed: ${error.message}` : `DNS ${recordType} check failed`,
      level: 'red' as const,
      resolvedRecords: null,
    };
  }
}

export async function runPingCheck(
  target: string,
  config: Record<string, unknown>,
  timeoutMs = 10000,
): Promise<PluginExecutionResult> {
  const host = target.trim().replace(/^https?:\/\//i, '').split('/')[0].split(':')[0];
  if (!host) {
    return { ok: false, statusCode: 400, latencyMs: null, message: 'Invalid PING target — provide a hostname or IP', level: 'red' as const };
  }

  const count = Math.min(Math.max(Number(config.pingCount ?? 3), 1), 10);
  const warnMs = Number(config.warnLatencyMs ?? 200);
  const critMs = Number(config.critLatencyMs ?? 1000);

  const started = Date.now();

  return new Promise((resolve) => {
    const args = ['-c', String(count), '-W', '2', host];
    const child = execFile('ping', args, { timeout: timeoutMs }, (err, stdout) => {
      const elapsed = Date.now() - started;

      if (err) {
        resolve({
          ok: false,
          statusCode: 0,
          latencyMs: elapsed,
          message: (err as NodeJS.ErrnoException).code === 'ETIMEDOUT' ? `Ping timed out (${host})` : `Ping failed: ${host} unreachable`,
          level: 'red' as const,
        });
        return;
      }

      const rttMatch = stdout.match(/rtt[^=]*=\s*[\d.]+\/([\d.]+)\/[\d.]+\/[\d.]+ ms/);
      const avgMs = rttMatch ? Math.round(parseFloat(rttMatch[1])) : elapsed;

      const lossMatch = stdout.match(/(\d+)%\s+packet loss/);
      const loss = lossMatch ? parseInt(lossMatch[1], 10) : 0;

      if (loss === 100) {
        resolve({ ok: false, statusCode: 0, latencyMs: avgMs, message: `100% packet loss to ${host}`, level: 'red' as const });
        return;
      }

      const level = avgMs >= critMs ? 'red' : avgMs >= warnMs ? 'yellow' : 'green';
      const lossStr = loss > 0 ? ` (${loss}% loss)` : '';

      resolve({
        ok: level !== 'red',
        statusCode: 200,
        latencyMs: avgMs,
        message: `Ping ${host}: avg ${avgMs}ms${lossStr}`,
        level: level as 'green' | 'yellow' | 'red',
      });
    });

    setTimeout(() => { try { child.kill(); } catch { /* ignore */ } }, timeoutMs + 500);
  });
}

export async function runSmtpCheck(
  target: string,
  config: Record<string, unknown>,
  timeoutMs = 10000,
): Promise<PluginExecutionResult> {
  const normalized = target.trim().replace(/^smtp[s]?:\/\//i, '');
  const parts = normalized.split(':');
  const host = parts[0];
  const port = parts.length >= 2 ? Number(parts[1]) : 25;
  const ehloHost = String(config.ehlo ?? 'pulsedock.monitor');
  const checkTls = Boolean(config.checkTls ?? false);

  if (!host || !Number.isInteger(port) || port <= 0 || port > 65535) {
    return {
      ok: false,
      statusCode: 400,
      latencyMs: null,
      message: 'Invalid SMTP target. Use host:port (e.g. mail.example.com:25)',
      level: 'red' as const,
    };
  }

  return new Promise((resolve) => {
    const started = Date.now();
    let settled = false;
    let banner = '';
    let ehloSent = false;
    let startTlsSent = false;
    let tlsSupported = false;
    const lines: string[] = [];

    const finish = (ok: boolean, message: string, level: 'green' | 'yellow' | 'red') => {
      if (settled) return;
      settled = true;
      socket.destroy();
      clearTimeout(timer);
      resolve({ ok, statusCode: ok ? 220 : 500, latencyMs: Date.now() - started, message, level });
    };

    const timer = setTimeout(() => finish(false, `SMTP timeout connecting to ${host}:${port}`, 'red'), timeoutMs);

    const socket = net.createConnection({ host, port });

    socket.once('error', (err) => finish(false, `SMTP error: ${err.message}`, 'red'));

    const handleData = (data: Buffer) => {
      const text = data.toString('utf8');
      lines.push(text);
      const linesText = lines.join('');
      const allLines = linesText.split('\r\n').filter(Boolean);

      for (const line of allLines) {
        const code = parseInt(line.slice(0, 3), 10);
        const isLast = line[3] === ' ';

        if (!isLast && line[3] !== '-') continue;

        if (!ehloSent && !banner && code === 220) {
          banner = line.slice(4);
          ehloSent = true;
          socket.write(`EHLO ${ehloHost}\r\n`);
          continue;
        }

        if (ehloSent && !startTlsSent) {
          if (line.toUpperCase().includes('STARTTLS')) tlsSupported = true;
          if (isLast && code === 250) {
            if (checkTls && tlsSupported) {
              startTlsSent = true;
              socket.write(`STARTTLS\r\n`);
            } else if (checkTls && !tlsSupported) {
              socket.write(`QUIT\r\n`);
              finish(true, `SMTP ok (${host}:${port}) — banner: ${banner} — STARTTLS not supported`, 'yellow');
            } else {
              socket.write(`QUIT\r\n`);
              finish(true, `SMTP ok (${host}:${port}) — banner: ${banner}`, 'green');
            }
            continue;
          }
          if (code >= 400) {
            finish(false, `SMTP EHLO failed (${code}) on ${host}:${port}`, 'red');
            continue;
          }
        }

        if (startTlsSent) {
          if (code === 220) {
            socket.write(`QUIT\r\n`);
            finish(true, `SMTP ok (${host}:${port}) — STARTTLS ready`, 'green');
          } else if (code >= 400) {
            finish(false, `SMTP STARTTLS failed (${code}) on ${host}:${port}`, 'red');
          }
          continue;
        }

        if (code === 221) {
          continue;
        }

        if (!banner && code >= 400) {
          finish(false, `SMTP banner error (${code}) from ${host}:${port}`, 'red');
        }
      }
    };

    socket.on('data', handleData);
  });
}

/**
 * FTP connectivity check.
 * Connects to FTP host:port (default 21), reads the 220 banner, optionally checks TLS (AUTH TLS).
 * @param target - FTP host/host:port (or ftp:// URL)
 * @param config - { checkTls?: boolean } — if true, negotiates AUTH TLS after banner
 * @param timeoutMs - connection timeout in ms
 */
export async function runFtpCheck(
  target: string,
  config: Record<string, unknown>,
  timeoutMs = 10000,
): Promise<PluginExecutionResult> {
  const normalized = target.trim().replace(/^ftps?:\/\//i, '');
  const parts = normalized.split(':');
  const host = parts[0];
  const port = parts.length >= 2 ? Number(parts[1]) : 21;
  const checkTls = Boolean(config.checkTls ?? false);

  if (!host || !Number.isInteger(port) || port <= 0 || port > 65535) {
    return {
      ok: false,
      statusCode: 400,
      latencyMs: null,
      message: 'Invalid FTP target. Use host:port (e.g. ftp.example.com:21)',
      level: 'red' as const,
    };
  }

  return new Promise((resolve) => {
    const started = Date.now();
    let settled = false;
    let bannerReceived = false;
    let authTlsSent = false;

    const finish = (ok: boolean, message: string, level: 'green' | 'yellow' | 'red') => {
      if (settled) return;
      settled = true;
      socket.destroy();
      clearTimeout(timer);
      resolve({ ok, statusCode: ok ? 220 : 500, latencyMs: Date.now() - started, message, level });
    };

    const timer = setTimeout(() => finish(false, `FTP timeout connecting to ${host}:${port}`, 'red'), timeoutMs);
    const socket = net.createConnection({ host, port });

    socket.once('error', (err) => finish(false, `FTP error: ${err.message}`, 'red'));

    socket.on('data', (data: Buffer) => {
      const text = data.toString('utf8');
      const lines = text.split('\r\n').filter(Boolean);

      for (const line of lines) {
        const code = parseInt(line.slice(0, 3), 10);

        // Banner: 220
        if (!bannerReceived && code === 220) {
          bannerReceived = true;
          if (checkTls) {
            authTlsSent = true;
            socket.write('AUTH TLS\r\n');
          } else {
            socket.write('QUIT\r\n');
            finish(true, `FTP ok (${host}:${port}) — banner: ${line.slice(4).trim()}`, 'green');
          }
          continue;
        }

        // AUTH TLS response
        if (authTlsSent) {
          if (code === 234) {
            socket.write('QUIT\r\n');
            finish(true, `FTP ok (${host}:${port}) — TLS supported (234)`, 'green');
          } else if (code === 500 || code === 502 || code === 504) {
            socket.write('QUIT\r\n');
            finish(true, `FTP ok (${host}:${port}) — TLS not supported (${code})`, 'yellow');
          } else if (code >= 400) {
            finish(false, `FTP AUTH TLS failed (${code}) on ${host}:${port}`, 'red');
          }
          continue;
        }

        if (code === 221) continue; // QUIT ack

        if (!bannerReceived && code >= 400) {
          finish(false, `FTP banner error (${code}) from ${host}:${port}`, 'red');
        }
      }
    });
  });
}

/**
 * IMAP connectivity check.
 * Connects to IMAP host:port (default 143), reads the greeting (* OK), optionally checks STARTTLS.
 * @param target - IMAP host/host:port (or imap:// URL)
 * @param config - { checkTls?: boolean } — if true, sends STARTTLS command after greeting
 * @param timeoutMs - connection timeout in ms
 */
export async function runImapCheck(
  target: string,
  config: Record<string, unknown>,
  timeoutMs = 10000,
): Promise<PluginExecutionResult> {
  const normalized = target.trim().replace(/^imaps?:\/\//i, '');
  const parts = normalized.split(':');
  const host = parts[0];
  const port = parts.length >= 2 ? Number(parts[1]) : 143;
  const checkTls = Boolean(config.checkTls ?? false);

  if (!host || !Number.isInteger(port) || port <= 0 || port > 65535) {
    return {
      ok: false,
      statusCode: 400,
      latencyMs: null,
      message: 'Invalid IMAP target. Use host:port (e.g. mail.example.com:143)',
      level: 'red' as const,
    };
  }

  return new Promise((resolve) => {
    const started = Date.now();
    let settled = false;
    let greetingReceived = false;
    let startTlsSent = false;

    const finish = (ok: boolean, message: string, level: 'green' | 'yellow' | 'red') => {
      if (settled) return;
      settled = true;
      socket.destroy();
      clearTimeout(timer);
      resolve({ ok, statusCode: ok ? 200 : 500, latencyMs: Date.now() - started, message, level });
    };

    const timer = setTimeout(() => finish(false, `IMAP timeout connecting to ${host}:${port}`, 'red'), timeoutMs);
    const socket = net.createConnection({ host, port });

    socket.once('error', (err) => finish(false, `IMAP error: ${err.message}`, 'red'));

    socket.on('data', (data: Buffer) => {
      const text = data.toString('utf8');
      const lines = text.split('\r\n').filter(Boolean);

      for (const line of lines) {
        // Greeting: * OK [...]
        if (!greetingReceived && line.startsWith('* OK')) {
          greetingReceived = true;
          if (checkTls) {
            startTlsSent = true;
            socket.write('a001 STARTTLS\r\n');
          } else {
            socket.write('a001 LOGOUT\r\n');
            finish(true, `IMAP ok (${host}:${port}) — ${line.slice(5, 60).trim()}`, 'green');
          }
          continue;
        }

        // STARTTLS response: a001 OK Begin TLS...
        if (startTlsSent && line.startsWith('a001')) {
          if (line.includes('OK')) {
            socket.write('a002 LOGOUT\r\n');
            finish(true, `IMAP ok (${host}:${port}) — STARTTLS accepted`, 'green');
          } else if (line.includes('NO') || line.includes('BAD')) {
            socket.write('a002 LOGOUT\r\n');
            finish(true, `IMAP ok (${host}:${port}) — STARTTLS not supported`, 'yellow');
          }
          continue;
        }

        // Greeting error
        if (!greetingReceived && line.startsWith('* BYE')) {
          finish(false, `IMAP rejected: ${line.slice(6, 80).trim()}`, 'red');
        }
      }
    });
  });
}

/**
 * POP3 connectivity check.
 * Connects to POP3 host:port (default 110), reads the +OK greeting, optionally checks STLS.
 * @param target - POP3 host/host:port (or pop3:// URL)
 * @param config - { checkTls?: boolean } — if true, sends STLS command after greeting
 * @param timeoutMs - connection timeout in ms
 */
export async function runPop3Check(
  target: string,
  config: Record<string, unknown>,
  timeoutMs = 10000,
): Promise<PluginExecutionResult> {
  const normalized = target.trim().replace(/^pop3s?:\/\//i, '');
  const parts = normalized.split(':');
  const host = parts[0];
  const port = parts.length >= 2 ? Number(parts[1]) : 110;
  const checkTls = Boolean(config.checkTls ?? false);

  if (!host || !Number.isInteger(port) || port <= 0 || port > 65535) {
    return {
      ok: false,
      statusCode: 400,
      latencyMs: null,
      message: 'Invalid POP3 target. Use host:port (e.g. mail.example.com:110)',
      level: 'red' as const,
    };
  }

  return new Promise((resolve) => {
    const started = Date.now();
    let settled = false;
    let greetingReceived = false;
    let stlsSent = false;

    const finish = (ok: boolean, message: string, level: 'green' | 'yellow' | 'red') => {
      if (settled) return;
      settled = true;
      socket.destroy();
      clearTimeout(timer);
      resolve({ ok, statusCode: ok ? 200 : 500, latencyMs: Date.now() - started, message, level });
    };

    const timer = setTimeout(() => finish(false, `POP3 timeout connecting to ${host}:${port}`, 'red'), timeoutMs);
    const socket = net.createConnection({ host, port });

    socket.once('error', (err) => finish(false, `POP3 error: ${err.message}`, 'red'));

    socket.on('data', (data: Buffer) => {
      const text = data.toString('utf8');
      const lines = text.split('\r\n').filter(Boolean);

      for (const line of lines) {
        // Greeting: +OK [...]
        if (!greetingReceived && line.startsWith('+OK')) {
          greetingReceived = true;
          if (checkTls) {
            stlsSent = true;
            socket.write('STLS\r\n');
          } else {
            socket.write('QUIT\r\n');
            finish(true, `POP3 ok (${host}:${port}) — ${line.slice(4, 60).trim()}`, 'green');
          }
          continue;
        }

        // STLS response
        if (stlsSent) {
          if (line.startsWith('+OK')) {
            socket.write('QUIT\r\n');
            finish(true, `POP3 ok (${host}:${port}) — STLS accepted`, 'green');
          } else if (line.startsWith('-ERR')) {
            socket.write('QUIT\r\n');
            finish(true, `POP3 ok (${host}:${port}) — STLS not supported`, 'yellow');
          }
          continue;
        }

        // Error greeting
        if (!greetingReceived && line.startsWith('-ERR')) {
          finish(false, `POP3 rejected: ${line.slice(5, 80).trim()}`, 'red');
        }
      }
    });
  });
}

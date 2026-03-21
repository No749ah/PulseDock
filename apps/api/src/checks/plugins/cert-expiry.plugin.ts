import * as tls from 'tls';
import * as https from 'https';
import type { MonitorCheckPlugin } from '../plugin.contracts';

/**
 * Fetches TLS certificate info via Node's https module (works in Node.js environments).
 * Returns { daysRemaining, subject, issuer } or throws.
 */
async function getCertInfo(target: string, timeoutMs: number): Promise<{ daysRemaining: number; subject: string; issuer: string; expiresAt: string }> {
  return new Promise((resolve, reject) => {
    const url = new URL(target.startsWith('http') ? target : `https://${target}`);
    const hostname = url.hostname;
    const port = url.port ? parseInt(url.port, 10) : 443;

    const socket = tls.connect(
      { host: hostname, port, servername: hostname, rejectUnauthorized: false },
      () => {
        const cert = socket.getPeerCertificate();
        socket.end();

        if (!cert || !cert.valid_to) {
          reject(new Error('No certificate returned'));
          return;
        }

        const expiresAt = new Date(cert.valid_to);
        const now = new Date();
        const daysRemaining = Math.floor((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        const subjectCN = Array.isArray(cert.subject?.CN) ? cert.subject.CN[0] : cert.subject?.CN;
        const issuerO = Array.isArray(cert.issuer?.O) ? cert.issuer.O[0] : cert.issuer?.O;
        const issuerCN = Array.isArray(cert.issuer?.CN) ? cert.issuer.CN[0] : cert.issuer?.CN;
        const subject = subjectCN ?? (Array.isArray(cert.subject?.O) ? cert.subject.O[0] : cert.subject?.O) ?? 'Unknown';
        const issuer = issuerO ?? issuerCN ?? 'Unknown';

        resolve({ daysRemaining, subject, issuer, expiresAt: expiresAt.toISOString().split('T')[0] });
      }
    );

    socket.setTimeout(timeoutMs, () => {
      socket.destroy(new Error('TLS connection timed out'));
    });

    socket.on('error', reject);
  });
}

/**
 * Plugin: SSL Certificate Expiry Checker
 *
 * Checks the TLS certificate of the target hostname and alerts when it is
 * approaching expiry. Supports warn/critical day thresholds so you get
 * early warning before an outage.
 */
export const certExpiryPlugin: MonitorCheckPlugin = {
  id: 'http.cert-expiry',
  displayName: 'SSL Certificate Expiry',
  description:
    'Checks TLS certificate expiry and warns/fails when within configurable day thresholds.',
  supportedMonitorTypes: ['HTTP', 'SSL_CERT'],
  configFields: [
    {
      key: 'warnDays',
      label: 'Warning threshold (days)',
      type: 'number',
      required: false,
      placeholder: '30',
      helpText: 'Alert as degraded (yellow) when cert expires within this many days.',
    },
    {
      key: 'criticalDays',
      label: 'Critical threshold (days)',
      type: 'number',
      required: false,
      placeholder: '7',
      helpText: 'Alert as down (red) when cert expires within this many days.',
    },
  ],
  async run(context) {
    const warnDays = Number(context.config.warnDays ?? 30);
    const criticalDays = Number(context.config.criticalDays ?? 7);

    const started = Date.now();
    try {
      const info = await getCertInfo(context.monitor.target, context.monitor.timeoutMs);
      const latencyMs = Date.now() - started;
      const { daysRemaining, subject, issuer, expiresAt } = info;

      if (daysRemaining < 0) {
        return {
          ok: false,
          statusCode: 200,
          latencyMs,
          message: `Certificate EXPIRED ${Math.abs(daysRemaining)} days ago (${expiresAt}) — ${subject}`,
          level: 'red',
        };
      }

      if (daysRemaining <= criticalDays) {
        return {
          ok: false,
          statusCode: 200,
          latencyMs,
          message: `Certificate expires in ${daysRemaining} days (${expiresAt}) — ${subject} issued by ${issuer}`,
          level: 'red',
        };
      }

      if (daysRemaining <= warnDays) {
        return {
          ok: true,
          statusCode: 200,
          latencyMs,
          message: `Certificate expires in ${daysRemaining} days (${expiresAt}) — ${subject} issued by ${issuer}`,
          level: 'yellow',
        };
      }

      return {
        ok: true,
        statusCode: 200,
        latencyMs,
        message: `Certificate valid for ${daysRemaining} more days (expires ${expiresAt}) — ${subject}`,
        level: 'green',
      };
    } catch (error) {
      return {
        ok: false,
        statusCode: 0,
        latencyMs: Date.now() - started,
        message: error instanceof Error ? error.message : 'TLS check failed',
        level: 'red',
      };
    }
  },
};

/**
 * Unit tests for monitors/utils.ts
 * Tests buildEditFormData and buildFormDataFromTemplate pure functions.
 */
import { describe, it, expect } from 'vitest';
import { buildEditFormData, buildFormDataFromTemplate } from './utils';
import type { MonitorItem } from './types';
import type { MonitorTemplate } from '../components/MonitorTemplates';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeMonitor(overrides: Partial<MonitorItem> = {}): MonitorItem {
  return {
    id: 'mon-1',
    name: 'Test Monitor',
    type: 'HTTP',
    target: 'https://example.com',
    intervalSec: 60,
    confirmations: 1,
    enabled: true,
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeTemplate(overrides: Partial<MonitorTemplate & Record<string, unknown>> = {}): MonitorTemplate {
  return {
    label: 'My Template Label',
    name: 'My Template',
    type: 'HTTP',
    target: 'https://example.com',
    intervalSec: 60,
    description: 'A test template',
    ...overrides,
  } as MonitorTemplate;
}

// ─── buildEditFormData ───────────────────────────────────────────────────────

describe('buildEditFormData', () => {
  describe('basic fields', () => {
    it('maps name, type, target, intervalSec, enabled from monitor', () => {
      const m = makeMonitor({ name: 'API Check', type: 'HTTP', target: 'https://api.test', intervalSec: 30, enabled: true });
      const r = buildEditFormData(m);
      expect(r.name).toBe('API Check');
      expect(r.type).toBe('HTTP');
      expect(r.target).toBe('https://api.test');
      expect(r.intervalSec).toBe(30);
      expect(r.enabled).toBe(true);
    });

    it('maps description and runbookUrl with fallback to empty string', () => {
      const m = makeMonitor({ description: 'Desc', runbookUrl: 'https://wiki.example' });
      const r = buildEditFormData(m);
      expect(r.description).toBe('Desc');
      expect(r.runbookUrl).toBe('https://wiki.example');
    });

    it('falls back description to empty string when null', () => {
      const m = makeMonitor({ description: null });
      expect(buildEditFormData(m).description).toBe('');
    });

    it('falls back runbookUrl to empty string when undefined', () => {
      const m = makeMonitor({ runbookUrl: undefined });
      expect(buildEditFormData(m).runbookUrl).toBe('');
    });

    it('maps confirmations (default 1 when undefined)', () => {
      const m = makeMonitor({ confirmations: 3 });
      expect(buildEditFormData(m).confirmations).toBe(3);
    });

    it('maps folderId with fallback to empty string', () => {
      const m = makeMonitor({ folderId: 'folder-123' });
      expect(buildEditFormData(m).folderId).toBe('folder-123');
    });

    it('falls back folderId to empty string when null', () => {
      const m = makeMonitor({ folderId: null });
      expect(buildEditFormData(m).folderId).toBe('');
    });
  });

  describe('SLA fields', () => {
    it('maps slaTarget and slaPeriodDays', () => {
      const m = makeMonitor({ slaTarget: 99.9, slaPeriodDays: 30 });
      const r = buildEditFormData(m);
      expect(r.slaTarget).toBe(99.9);
      expect(r.slaPeriodDays).toBe(30);
    });

    it('defaults slaTarget to empty string when undefined', () => {
      expect(buildEditFormData(makeMonitor()).slaTarget).toBe('');
    });

    it('defaults slaPeriodDays to 30 when undefined', () => {
      expect(buildEditFormData(makeMonitor()).slaPeriodDays).toBe(30);
    });
  });

  describe('incident fields', () => {
    it('maps autoIncident and autoIncidentSeverity', () => {
      const m = makeMonitor({ autoIncident: true, autoIncidentSeverity: 'HIGH' });
      const r = buildEditFormData(m);
      expect(r.autoIncident).toBe(true);
      expect(r.autoIncidentSeverity).toBe('HIGH');
    });

    it('defaults autoIncident to false', () => {
      expect(buildEditFormData(makeMonitor()).autoIncident).toBe(false);
    });

    it('defaults autoIncidentSeverity to MEDIUM', () => {
      expect(buildEditFormData(makeMonitor()).autoIncidentSeverity).toBe('MEDIUM');
    });

    it('defaults flapDetectionEnabled to true', () => {
      expect(buildEditFormData(makeMonitor()).flapDetectionEnabled).toBe(true);
    });

    it('maps flapDetectionEnabled = false when set', () => {
      const m = makeMonitor({ flapDetectionEnabled: false });
      expect(buildEditFormData(m).flapDetectionEnabled).toBe(false);
    });
  });

  describe('HTTP config fields', () => {
    it('maps expectedStatus from config', () => {
      const m = makeMonitor({ config: { expectedStatus: 201 } });
      expect(buildEditFormData(m).expectedStatus).toBe(201);
    });

    it('maps bodyContains from config', () => {
      const m = makeMonitor({ config: { bodyContains: 'ok' } });
      expect(buildEditFormData(m).bodyContains).toBe('ok');
    });

    it('maps httpMethod from config', () => {
      const m = makeMonitor({ config: { httpMethod: 'POST' } });
      expect(buildEditFormData(m).httpMethod).toBe('POST');
    });

    it('defaults httpMethod to GET when missing', () => {
      expect(buildEditFormData(makeMonitor()).httpMethod).toBe('GET');
    });

    it('maps requestHeaders from config as key: value lines', () => {
      const m = makeMonitor({ config: { requestHeaders: { Authorization: 'Bearer tok', 'X-Custom': 'abc' } } });
      const result = buildEditFormData(m).requestHeaders!;
      expect(result).toContain('Authorization: Bearer tok');
      expect(result).toContain('X-Custom: abc');
    });

    it('defaults requestHeaders to empty string when missing', () => {
      expect(buildEditFormData(makeMonitor()).requestHeaders).toBe('');
    });

    it('maps requestBody from config', () => {
      const m = makeMonitor({ config: { requestBody: '{"key":"val"}' } });
      expect(buildEditFormData(m).requestBody).toBe('{"key":"val"}');
    });

    it('maps responseTimeThresholdMs from config', () => {
      const m = makeMonitor({ config: { responseTimeThresholdMs: 500 } });
      expect(buildEditFormData(m).responseTimeThresholdMs).toBe(500);
    });

    it('maps bodyJsonPath from config', () => {
      const m = makeMonitor({ config: { bodyJsonPath: '$.status', bodyJsonPathExpected: 'ok' } });
      expect(buildEditFormData(m).bodyJsonPath).toBe('$.status');
      expect(buildEditFormData(m).bodyJsonPathExpected).toBe('ok');
    });
  });

  describe('DNS config fields', () => {
    it('maps dnsRecordType from config.recordType', () => {
      const m = makeMonitor({ type: 'DNS', config: { recordType: 'AAAA' } });
      expect(buildEditFormData(m).dnsRecordType).toBe('AAAA');
    });

    it('defaults dnsRecordType to A', () => {
      expect(buildEditFormData(makeMonitor()).dnsRecordType).toBe('A');
    });

    it('maps dnsExpectedValue from config.expectedValue', () => {
      const m = makeMonitor({ type: 'DNS', config: { expectedValue: '1.2.3.4' } });
      expect(buildEditFormData(m).dnsExpectedValue).toBe('1.2.3.4');
    });

    it('maps dnsTimeoutMs from config.timeoutMs', () => {
      const m = makeMonitor({ type: 'DNS', config: { timeoutMs: 5000 } });
      expect(buildEditFormData(m).dnsTimeoutMs).toBe(5000);
    });

    it('defaults dnsTimeoutMs to 10000', () => {
      expect(buildEditFormData(makeMonitor()).dnsTimeoutMs).toBe(10000);
    });
  });

  describe('SMTP config fields', () => {
    it('maps ehlo from config', () => {
      const m = makeMonitor({ type: 'SMTP', config: { ehlo: 'myhost.com' } });
      expect(buildEditFormData(m).ehlo).toBe('myhost.com');
    });

    it('defaults ehlo to pulsedock.monitor', () => {
      expect(buildEditFormData(makeMonitor()).ehlo).toBe('pulsedock.monitor');
    });

    it('maps checkTls from config', () => {
      const m = makeMonitor({ config: { checkTls: true } });
      expect(buildEditFormData(m).checkTls).toBe(true);
    });
  });

  describe('PING config fields', () => {
    it('maps pingCount from config', () => {
      const m = makeMonitor({ type: 'PING', config: { pingCount: 5 } });
      expect(buildEditFormData(m).pingCount).toBe(5);
    });

    it('defaults pingCount to 3', () => {
      expect(buildEditFormData(makeMonitor()).pingCount).toBe(3);
    });

    it('maps pingMaxLossPct from config.maxPacketLossPct', () => {
      const m = makeMonitor({ type: 'PING', config: { maxPacketLossPct: 10 } });
      expect(buildEditFormData(m).pingMaxLossPct).toBe(10);
    });
  });

  describe('BROWSER config fields', () => {
    it('maps browserExpectedText from config', () => {
      const m = makeMonitor({ type: 'BROWSER', config: { browserExpectedText: 'Welcome' } });
      expect(buildEditFormData(m).browserExpectedText).toBe('Welcome');
    });

    it('maps browserSelector from config', () => {
      const m = makeMonitor({ type: 'BROWSER', config: { browserSelector: '#main-content' } });
      expect(buildEditFormData(m).browserSelector).toBe('#main-content');
    });

    it('maps browserStatusCodesRaw from config.browserStatusCodes array', () => {
      const m = makeMonitor({ type: 'BROWSER', config: { browserStatusCodes: [200, 201] } });
      expect(buildEditFormData(m).browserStatusCodesRaw).toBe('200, 201');
    });

    it('defaults browserStatusCodesRaw to empty string when not array', () => {
      expect(buildEditFormData(makeMonitor()).browserStatusCodesRaw).toBe('');
    });
  });

  describe('HEARTBEAT config fields', () => {
    it('maps heartbeatTimeoutMin from config.timeoutMin', () => {
      const m = makeMonitor({ type: 'HEARTBEAT', config: { timeoutMin: 10 } });
      expect(buildEditFormData(m).heartbeatTimeoutMin).toBe(10);
    });

    it('defaults heartbeatTimeoutMin to 5', () => {
      expect(buildEditFormData(makeMonitor()).heartbeatTimeoutMin).toBe(5);
    });

    it('maps heartbeatToken from config.token', () => {
      const m = makeMonitor({ type: 'HEARTBEAT', config: { token: 'abc123' } });
      expect(buildEditFormData(m).heartbeatToken).toBe('abc123');
    });
  });

  describe('plugin field', () => {
    it('maps pluginId from config', () => {
      const m = makeMonitor({ config: { pluginId: 'http.response-match' } });
      expect(buildEditFormData(m).pluginId).toBe('http.response-match');
    });

    it('defaults pluginId to empty string', () => {
      expect(buildEditFormData(makeMonitor()).pluginId).toBe('');
    });
  });
});

// ─── buildFormDataFromTemplate ───────────────────────────────────────────────

describe('buildFormDataFromTemplate', () => {
  it('maps name, type, target, intervalSec from template', () => {
    const t = makeTemplate({ name: 'Gitea', type: 'HTTP', target: 'http://gitea.host', intervalSec: 120 });
    const r = buildFormDataFromTemplate(t);
    expect(r.name).toBe('Gitea');
    expect(r.type).toBe('HTTP');
    expect(r.target).toBe('http://gitea.host');
    expect(r.intervalSec).toBe(120);
  });

  it('sets safe defaults: confirmations=1, enabled=true, flapDetectionEnabled=true', () => {
    const r = buildFormDataFromTemplate(makeTemplate());
    expect(r.confirmations).toBe(1);
    expect(r.enabled).toBe(true);
    expect(r.flapDetectionEnabled).toBe(true);
  });

  it('sets empty string defaults for text fields', () => {
    const r = buildFormDataFromTemplate(makeTemplate());
    expect(r.description).toBe('');
    expect(r.runbookUrl).toBe('');
    expect(r.heartbeatToken).toBe('');
    expect(r.folderId).toBe('');
    expect(r.slaTarget).toBe('');
  });

  it('maps pluginId from template', () => {
    const t = makeTemplate({ pluginId: 'http.response-match' });
    expect(buildFormDataFromTemplate(t).pluginId).toBe('http.response-match');
  });

  it('maps expectedText from template', () => {
    const t = makeTemplate({ expectedText: '"status":"ok"' });
    expect(buildFormDataFromTemplate(t).expectedText).toBe('"status":"ok"');
  });

  it('normalizes unknown type to HTTP', () => {
    // @ts-expect-error - test with invalid type
    const t = makeTemplate({ type: 'UNKNOWN_TYPE' });
    expect(buildFormDataFromTemplate(t).type).toBe('HTTP');
  });

  it('passes through all valid monitor types', () => {
    const validTypes = ['HTTP', 'TCP', 'SSL_CERT', 'HEARTBEAT', 'DNS', 'PING', 'SMTP', 'BROWSER'] as const;
    for (const type of validTypes) {
      const t = makeTemplate({ type });
      expect(buildFormDataFromTemplate(t).type).toBe(type);
    }
  });

  describe('DNS template config', () => {
    it('maps dnsRecordType from config.recordType', () => {
      const t = makeTemplate({ type: 'DNS', config: { recordType: 'MX' } });
      expect(buildFormDataFromTemplate(t).dnsRecordType).toBe('MX');
    });

    it('maps dnsExpectedValue from config.expectedValue', () => {
      const t = makeTemplate({ type: 'DNS', config: { expectedValue: 'mail.example.com' } });
      expect(buildFormDataFromTemplate(t).dnsExpectedValue).toBe('mail.example.com');
    });

    it('maps dnsTimeoutMs from config.timeoutMs', () => {
      const t = makeTemplate({ type: 'DNS', config: { timeoutMs: 3000 } });
      expect(buildFormDataFromTemplate(t).dnsTimeoutMs).toBe(3000);
    });
  });

  describe('SMTP template config', () => {
    it('maps ehlo from config', () => {
      const t = makeTemplate({ type: 'SMTP', config: { ehlo: 'myserver.io' } });
      expect(buildFormDataFromTemplate(t).ehlo).toBe('myserver.io');
    });

    it('maps checkTls from config', () => {
      const t = makeTemplate({ type: 'SMTP', config: { checkTls: true } });
      expect(buildFormDataFromTemplate(t).checkTls).toBe(true);
    });
  });

  describe('PING template config', () => {
    it('maps pingCount from config', () => {
      const t = makeTemplate({ type: 'PING', config: { pingCount: 10 } });
      expect(buildFormDataFromTemplate(t).pingCount).toBe(10);
    });

    it('maps pingMaxLossPct from config.maxPacketLossPct', () => {
      const t = makeTemplate({ type: 'PING', config: { maxPacketLossPct: 20 } });
      expect(buildFormDataFromTemplate(t).pingMaxLossPct).toBe(20);
    });
  });

  describe('BROWSER template config', () => {
    it('maps browserExpectedText from config', () => {
      const t = makeTemplate({ type: 'BROWSER', config: { browserExpectedText: 'Login' } });
      expect(buildFormDataFromTemplate(t).browserExpectedText).toBe('Login');
    });

    it('maps browserSelector from config', () => {
      const t = makeTemplate({ type: 'BROWSER', config: { browserSelector: '.hero-section' } });
      expect(buildFormDataFromTemplate(t).browserSelector).toBe('.hero-section');
    });

    it('maps browserStatusCodesRaw from config.browserStatusCodes', () => {
      const t = makeTemplate({ type: 'BROWSER', config: { browserStatusCodes: [200, 302] } });
      expect(buildFormDataFromTemplate(t).browserStatusCodesRaw).toBe('200, 302');
    });
  });

  it('handles missing config gracefully (no crash)', () => {
    const t = makeTemplate({ config: undefined });
    expect(() => buildFormDataFromTemplate(t)).not.toThrow();
  });
});

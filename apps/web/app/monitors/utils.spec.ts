import { describe, it, expect } from 'vitest';
import { buildEditFormData, buildFormDataFromTemplate } from './utils';
import type { MonitorItem } from './types';

// Minimal valid MonitorItem for testing
function makeMonitor(overrides: Partial<MonitorItem> = {}): MonitorItem {
  return {
    id: 'mon_1',
    name: 'Test Monitor',
    type: 'HTTP',
    target: 'https://example.com',
    intervalSec: 60,
    confirmations: 1,
    enabled: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('buildEditFormData', () => {
  describe('basic fields', () => {
    it('maps name, type, target', () => {
      const form = buildEditFormData(makeMonitor({ name: 'My API', type: 'HTTP', target: 'https://api.example.com' }));
      expect(form.name).toBe('My API');
      expect(form.type).toBe('HTTP');
      expect(form.target).toBe('https://api.example.com');
    });

    it('maps intervalSec and enabled', () => {
      const form = buildEditFormData(makeMonitor({ intervalSec: 30, enabled: false }));
      expect(form.intervalSec).toBe(30);
      expect(form.enabled).toBe(false);
    });

    it('maps confirmations correctly', () => {
      const form = buildEditFormData(makeMonitor({ confirmations: 3 }));
      expect(form.confirmations).toBe(3);
    });

    it('defaults description to empty string when undefined', () => {
      const form = buildEditFormData(makeMonitor({ description: undefined }));
      expect(form.description).toBe('');
    });

    it('maps description when provided', () => {
      const form = buildEditFormData(makeMonitor({ description: 'API health check' }));
      expect(form.description).toBe('API health check');
    });

    it('defaults runbookUrl to empty string when undefined', () => {
      const form = buildEditFormData(makeMonitor({ runbookUrl: undefined }));
      expect(form.runbookUrl).toBe('');
    });

    it('maps runbookUrl when provided', () => {
      const form = buildEditFormData(makeMonitor({ runbookUrl: 'https://docs.example.com/runbook' }));
      expect(form.runbookUrl).toBe('https://docs.example.com/runbook');
    });

    it('maps folderId when provided', () => {
      const form = buildEditFormData(makeMonitor({ folderId: 'folder_123' }));
      expect(form.folderId).toBe('folder_123');
    });

    it('defaults folderId to empty string when undefined', () => {
      const form = buildEditFormData(makeMonitor({ folderId: undefined }));
      expect(form.folderId).toBe('');
    });
  });

  describe('SLA fields', () => {
    it('maps slaTarget when provided', () => {
      const form = buildEditFormData(makeMonitor({ slaTarget: 99.9 }));
      expect(form.slaTarget).toBe(99.9);
    });

    it('defaults slaTarget to empty string when null', () => {
      const form = buildEditFormData(makeMonitor({ slaTarget: null }));
      expect(form.slaTarget).toBe('');
    });

    it('defaults slaPeriodDays to 30', () => {
      const form = buildEditFormData(makeMonitor({ slaPeriodDays: undefined }));
      expect(form.slaPeriodDays).toBe(30);
    });

    it('maps slaPeriodDays when provided', () => {
      const form = buildEditFormData(makeMonitor({ slaPeriodDays: 7 }));
      expect(form.slaPeriodDays).toBe(7);
    });
  });

  describe('incident/flapping fields', () => {
    it('defaults autoIncident to false', () => {
      const form = buildEditFormData(makeMonitor({ autoIncident: undefined }));
      expect(form.autoIncident).toBe(false);
    });

    it('maps autoIncident true', () => {
      const form = buildEditFormData(makeMonitor({ autoIncident: true }));
      expect(form.autoIncident).toBe(true);
    });

    it('defaults autoIncidentSeverity to MEDIUM', () => {
      const form = buildEditFormData(makeMonitor({ autoIncidentSeverity: undefined }));
      expect(form.autoIncidentSeverity).toBe('MEDIUM');
    });

    it('defaults flapDetectionEnabled to true', () => {
      const form = buildEditFormData(makeMonitor({ flapDetectionEnabled: undefined }));
      expect(form.flapDetectionEnabled).toBe(true);
    });

    it('defaults flapWindow to 10', () => {
      const form = buildEditFormData(makeMonitor({ flapWindow: undefined }));
      expect(form.flapWindow).toBe(10);
    });

    it('defaults flapThreshold to 0.5', () => {
      const form = buildEditFormData(makeMonitor({ flapThreshold: undefined }));
      expect(form.flapThreshold).toBe(0.5);
    });
  });

  describe('HTTP config extraction', () => {
    it('extracts httpMethod from config', () => {
      const form = buildEditFormData(makeMonitor({ config: { httpMethod: 'POST' } }));
      expect(form.httpMethod).toBe('POST');
    });

    it('defaults httpMethod to GET when not in config', () => {
      const form = buildEditFormData(makeMonitor({ config: {} }));
      expect(form.httpMethod).toBe('GET');
    });

    it('extracts bodyContains from config', () => {
      const form = buildEditFormData(makeMonitor({ config: { bodyContains: 'OK' } }));
      expect(form.bodyContains).toBe('OK');
    });

    it('extracts expectedStatus from config', () => {
      const form = buildEditFormData(makeMonitor({ config: { expectedStatus: '404' } }));
      expect(form.expectedStatus).toBe(404);
    });

    it('defaults followRedirects to true when not specified', () => {
      const form = buildEditFormData(makeMonitor({ config: {} }));
      expect(form.followRedirects).toBe(true);
    });

    it('sets followRedirects to false when config says false', () => {
      const form = buildEditFormData(makeMonitor({ config: { followRedirects: false } }));
      expect(form.followRedirects).toBe(false);
    });

    it('defaults maxRedirects to 10', () => {
      const form = buildEditFormData(makeMonitor({ config: {} }));
      expect(form.maxRedirects).toBe(10);
    });

    it('extracts requestHeaders as formatted string', () => {
      const form = buildEditFormData(makeMonitor({
        config: { requestHeaders: { 'X-Token': 'abc', 'Content-Type': 'application/json' } },
      }));
      expect(form.requestHeaders).toContain('X-Token: abc');
      expect(form.requestHeaders).toContain('Content-Type: application/json');
    });

    it('defaults requestHeaders to empty string when not in config', () => {
      const form = buildEditFormData(makeMonitor({ config: {} }));
      expect(form.requestHeaders).toBe('');
    });
  });

  describe('DNS config extraction', () => {
    it('extracts dnsRecordType from config.recordType', () => {
      const form = buildEditFormData(makeMonitor({ config: { recordType: 'MX' } }));
      expect(form.dnsRecordType).toBe('MX');
    });

    it('defaults dnsRecordType to A', () => {
      const form = buildEditFormData(makeMonitor({ config: {} }));
      expect(form.dnsRecordType).toBe('A');
    });

    it('extracts dnsExpectedValue from config', () => {
      const form = buildEditFormData(makeMonitor({ config: { expectedValue: '1.2.3.4' } }));
      expect(form.dnsExpectedValue).toBe('1.2.3.4');
    });

    it('extracts dnsDetectChanges from config', () => {
      const form = buildEditFormData(makeMonitor({ config: { detectChanges: true } }));
      expect(form.dnsDetectChanges).toBe(true);
    });
  });

  describe('HEARTBEAT config extraction', () => {
    it('extracts heartbeatTimeoutMin from config.timeoutMin', () => {
      const form = buildEditFormData(makeMonitor({ config: { timeoutMin: 10 } }));
      expect(form.heartbeatTimeoutMin).toBe(10);
    });

    it('defaults heartbeatTimeoutMin to 5', () => {
      const form = buildEditFormData(makeMonitor({ config: {} }));
      expect(form.heartbeatTimeoutMin).toBe(5);
    });

    it('extracts heartbeatToken from config.token', () => {
      const form = buildEditFormData(makeMonitor({ config: { token: 'tok_abc123' } }));
      expect(form.heartbeatToken).toBe('tok_abc123');
    });
  });

  describe('schedule fields', () => {
    it('defaults scheduleEnabled to false', () => {
      const form = buildEditFormData(makeMonitor({}));
      expect(form.scheduleEnabled).toBe(false);
    });

    it('defaults scheduleDays to weekdays', () => {
      const form = buildEditFormData(makeMonitor({}));
      expect(form.scheduleDays).toBe('1,2,3,4,5');
    });

    it('defaults scheduleStartHour to 8', () => {
      const form = buildEditFormData(makeMonitor({}));
      expect(form.scheduleStartHour).toBe(8);
    });

    it('defaults scheduleEndHour to 18', () => {
      const form = buildEditFormData(makeMonitor({}));
      expect(form.scheduleEndHour).toBe(18);
    });
  });

  describe('anomaly detection fields', () => {
    it('defaults anomalyDetection to false', () => {
      const form = buildEditFormData(makeMonitor({}));
      expect(form.anomalyDetection).toBe(false);
    });

    it('defaults anomalyMultiplier to 2.0', () => {
      const form = buildEditFormData(makeMonitor({}));
      expect(form.anomalyMultiplier).toBe(2.0);
    });
  });
});

describe('buildFormDataFromTemplate', () => {
  const baseTemplate = {
    label: 'GitHub Status',
    description: 'Check GitHub uptime',
    name: 'GitHub Status',
    type: 'HTTP' as const,
    target: 'https://github.com',
    intervalSec: 60,
    pluginId: '',
    expectedText: '',
    config: {},
  };

  it('maps name, type, target from template', () => {
    const form = buildFormDataFromTemplate(baseTemplate);
    expect(form.name).toBe('GitHub Status');
    expect(form.type).toBe('HTTP');
    expect(form.target).toBe('https://github.com');
  });

  it('maps intervalSec from template', () => {
    const form = buildFormDataFromTemplate({ ...baseTemplate, intervalSec: 120 });
    expect(form.intervalSec).toBe(120);
  });

  it('always enables the monitor', () => {
    const form = buildFormDataFromTemplate(baseTemplate);
    expect(form.enabled).toBe(true);
  });

  it('starts with description empty', () => {
    const form = buildFormDataFromTemplate(baseTemplate);
    expect(form.description).toBe('');
  });

  it('uses safe type HTTP for unknown types', () => {
    // WHOIS is not in the safe list so falls back to HTTP
    const form = buildFormDataFromTemplate({ ...baseTemplate, type: 'WHOIS' as never, name: 'test', label: 'test', description: '' });
    expect(form.type).toBe('HTTP');
  });

  it('maps checkTls from config when present', () => {
    const form = buildFormDataFromTemplate({ ...baseTemplate, config: { checkTls: true } });
    expect(form.checkTls).toBe(true);
  });

  it('maps DNS recordType from config', () => {
    const form = buildFormDataFromTemplate({ ...baseTemplate, type: 'DNS' as const, config: { recordType: 'AAAA' } as never });
    expect(form.dnsRecordType).toBe('AAAA');
  });

  it('maps ping count from config', () => {
    const form = buildFormDataFromTemplate({ ...baseTemplate, type: 'PING' as const, config: { pingCount: 5 } as never });
    expect(form.pingCount).toBe(5);
  });

  it('defaults slaTarget to empty string', () => {
    const form = buildFormDataFromTemplate(baseTemplate);
    expect(form.slaTarget).toBe('');
  });

  it('defaults slaPeriodDays to 30', () => {
    const form = buildFormDataFromTemplate(baseTemplate);
    expect(form.slaPeriodDays).toBe(30);
  });

  it('defaults autoIncident to false', () => {
    const form = buildFormDataFromTemplate(baseTemplate);
    expect(form.autoIncident).toBe(false);
  });

  it('defaults anomalyDetection to false', () => {
    const form = buildFormDataFromTemplate(baseTemplate);
    expect(form.anomalyDetection).toBe(false);
  });
});

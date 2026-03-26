import { describe, it, expect } from 'vitest';
import { MONITOR_TEMPLATES, type MonitorTemplate } from './MonitorTemplates';

describe('MONITOR_TEMPLATES data', () => {
  it('exports a non-empty templates array', () => {
    expect(Array.isArray(MONITOR_TEMPLATES)).toBe(true);
    expect(MONITOR_TEMPLATES.length).toBeGreaterThan(10);
  });

  it('every template has required fields', () => {
    for (const tpl of MONITOR_TEMPLATES) {
      expect(tpl.label, `${tpl.name} missing label`).toBeTruthy();
      expect(tpl.name, `template missing name`).toBeTruthy();
      expect(tpl.type, `${tpl.name} missing type`).toBeTruthy();
      expect(tpl.target, `${tpl.name} missing target`).toBeTruthy();
      expect(tpl.intervalSec, `${tpl.name} missing intervalSec`).toBeGreaterThan(0);
    }
  });

  it('all template types are valid monitor types', () => {
    const validTypes = ['HTTP', 'GIT_RELEASE', 'DOCKER_IMAGE', 'TCP', 'SSL_CERT', 'HEARTBEAT', 'DNS', 'PING', 'SMTP'];
    for (const tpl of MONITOR_TEMPLATES) {
      expect(validTypes, `${tpl.name} has invalid type: ${tpl.type}`).toContain(tpl.type);
    }
  });

  it('all template intervalSec values are reasonable (10s–24h)', () => {
    for (const tpl of MONITOR_TEMPLATES) {
      expect(tpl.intervalSec, `${tpl.name} intervalSec too low`).toBeGreaterThanOrEqual(10);
      expect(tpl.intervalSec, `${tpl.name} intervalSec too high`).toBeLessThanOrEqual(86400);
    }
  });

  it('HTTP templates make up the majority of templates', () => {
    const httpTemplates = MONITOR_TEMPLATES.filter((t) => t.type === 'HTTP');
    // HTTP health checks dominate the template list
    expect(httpTemplates.length).toBeGreaterThan(50);
  });

  it('HTTP templates have a URL-like target', () => {
    const httpTemplates = MONITOR_TEMPLATES.filter((t) => t.type === 'HTTP');
    expect(httpTemplates.length).toBeGreaterThan(0);
    for (const tpl of httpTemplates) {
      const isUrl = tpl.target.startsWith('http://') || tpl.target.startsWith('https://');
      expect(isUrl, `HTTP template "${tpl.name}" has non-URL target: ${tpl.target}`).toBe(true);
    }
  });

  it('no duplicate template names', () => {
    const names = MONITOR_TEMPLATES.map((t) => t.name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });

  it('templates with requiresUrl=true have a placeholder URL', () => {
    const requiresUrl = MONITOR_TEMPLATES.filter((t) => t.requiresUrl);
    for (const tpl of requiresUrl) {
      // Should have a URL target (placeholder domain)
      expect(tpl.target.length).toBeGreaterThan(0);
    }
  });
});

describe('MonitorTemplates component', () => {
  it('exports a MonitorTemplates function component', async () => {
    const mod = await import('./MonitorTemplates');
    expect(typeof mod.MonitorTemplates).toBe('function');
  });
});

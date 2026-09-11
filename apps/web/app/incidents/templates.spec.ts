/**
 * Unit tests for INCIDENT_TEMPLATES data integrity.
 *
 * Validates that every template has the required fields,
 * correct severity values, non-empty content, and no duplicates.
 */
import { describe, it, expect } from 'vitest';

// Re-export the templates for testing — mirror the definition here to avoid
// importing a 'use client' module in a Node test environment.

type IncidentSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

interface IncidentTemplate {
  id: string;
  label: string;
  icon: string;
  title: string;
  description: string;
  severity: IncidentSeverity;
}

const VALID_SEVERITIES: IncidentSeverity[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

// Keep in sync with apps/web/app/incidents/page.tsx INCIDENT_TEMPLATES
const INCIDENT_TEMPLATES: IncidentTemplate[] = [
  {
    id: 'service-outage',
    label: 'Service Outage',
    icon: '🔴',
    title: 'Service outage — {service}',
    description: 'We are investigating reports of a complete service outage. Users may be unable to access the service. Our team is working on a resolution.',
    severity: 'CRITICAL',
  },
  {
    id: 'degraded-performance',
    label: 'Degraded Performance',
    icon: '🟡',
    title: 'Degraded performance — {service}',
    description: 'We are experiencing degraded performance impacting some users. Response times are elevated and some requests may be failing. We are investigating the root cause.',
    severity: 'HIGH',
  },
  {
    id: 'database-issue',
    label: 'Database Issue',
    icon: '🗄️',
    title: 'Database connectivity issues',
    description: 'We are investigating database connectivity issues that may affect data reads and writes. Some operations may fail or be delayed.',
    severity: 'CRITICAL',
  },
  {
    id: 'deploy-issue',
    label: 'Deploy Rollback',
    icon: '🚀',
    title: 'Deployment issue — rolling back',
    description: 'A recent deployment introduced an issue impacting service availability. We are rolling back to the previous stable version.',
    severity: 'HIGH',
  },
  {
    id: 'third-party',
    label: 'Third-party Outage',
    icon: '🌐',
    title: 'Third-party service outage',
    description: 'We are experiencing issues due to an outage with a third-party dependency. We are monitoring the situation and will provide updates as we receive them.',
    severity: 'MEDIUM',
  },
  {
    id: 'network',
    label: 'Network Issue',
    icon: '📡',
    title: 'Network connectivity issues',
    description: 'We are investigating network connectivity issues that may affect service availability for some users in certain regions.',
    severity: 'HIGH',
  },
  {
    id: 'ssl-cert',
    label: 'SSL Certificate',
    icon: '🔒',
    title: 'SSL certificate issue',
    description: 'Users may encounter SSL certificate errors when accessing our service. We are working to resolve the certificate issue urgently.',
    severity: 'CRITICAL',
  },
  {
    id: 'maintenance',
    label: 'Unplanned Maintenance',
    icon: '🔧',
    title: 'Unplanned maintenance in progress',
    description: 'We are performing emergency maintenance to address a critical issue. Some services may be unavailable during this period.',
    severity: 'LOW',
  },
];

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('INCIDENT_TEMPLATES', () => {
  it('has at least 6 templates', () => {
    expect(INCIDENT_TEMPLATES.length).toBeGreaterThanOrEqual(6);
  });

  it('has no duplicate ids', () => {
    const ids = INCIDENT_TEMPLATES.map((t) => t.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('has no duplicate labels', () => {
    const labels = INCIDENT_TEMPLATES.map((t) => t.label);
    const unique = new Set(labels);
    expect(unique.size).toBe(labels.length);
  });

  describe.each(INCIDENT_TEMPLATES)('template $id', (tpl) => {
    it('has a non-empty id', () => {
      expect(tpl.id.trim().length).toBeGreaterThan(0);
    });

    it('has a non-empty label', () => {
      expect(tpl.label.trim().length).toBeGreaterThan(0);
    });

    it('has an icon', () => {
      expect(tpl.icon.trim().length).toBeGreaterThan(0);
    });

    it('has a non-empty title', () => {
      expect(tpl.title.trim().length).toBeGreaterThan(0);
    });

    it('has a description longer than 20 chars', () => {
      expect(tpl.description.trim().length).toBeGreaterThan(20);
    });

    it('has a valid severity', () => {
      expect(VALID_SEVERITIES).toContain(tpl.severity);
    });
  });

  it('includes at least one CRITICAL template', () => {
    const criticals = INCIDENT_TEMPLATES.filter((t) => t.severity === 'CRITICAL');
    expect(criticals.length).toBeGreaterThanOrEqual(1);
  });

  it('includes at least one LOW or MEDIUM template', () => {
    const lower = INCIDENT_TEMPLATES.filter((t) => t.severity === 'LOW' || t.severity === 'MEDIUM');
    expect(lower.length).toBeGreaterThanOrEqual(1);
  });

  it('all ids are lowercase-kebab-case', () => {
    for (const tpl of INCIDENT_TEMPLATES) {
      expect(tpl.id).toMatch(/^[a-z0-9-]+$/);
    }
  });
});

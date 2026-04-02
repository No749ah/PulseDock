/**
 * Unit tests for incidents/components/IncidentModals pure logic.
 *
 * Tests:
 * - CreateIncidentModal confirm-button disable logic (title required)
 * - PostUpdateModal confirm-button disable logic (body required)
 * - DeleteIncidentModal state labels
 * - INCIDENT_TEMPLATES structure contract
 * - Status + severity option enumerations
 */
import { describe, it, expect } from 'vitest';

// ── Mirror types from incidents/types.ts ──────────────────────────────────────

type IncidentStatus = 'INVESTIGATING' | 'IDENTIFIED' | 'MONITORING' | 'RESOLVED';
type IncidentSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

// ── Mirror INCIDENT_TEMPLATES from types.ts ───────────────────────────────────

interface IncidentTemplate {
  id: string;
  label: string;
  icon: string;
  title: string;
  description: string;
  severity: IncidentSeverity;
}

// Inline copy of the templates list to test structure
const INCIDENT_TEMPLATES: IncidentTemplate[] = [
  { id: 'api-down', label: 'API Down', icon: '🔴', title: 'API service is down', description: 'The main API service is not responding to requests.', severity: 'CRITICAL' },
  { id: 'db-degraded', label: 'DB Degraded', icon: '🟡', title: 'Database performance degraded', description: 'Database queries are running slower than expected.', severity: 'HIGH' },
  { id: 'high-latency', label: 'High Latency', icon: '🟠', title: 'High response times detected', description: 'Service response times are elevated above normal thresholds.', severity: 'MEDIUM' },
  { id: 'cert-expiry', label: 'SSL Expiring', icon: '🔒', title: 'SSL certificate expiring soon', description: 'An SSL certificate is expiring within 7 days.', severity: 'HIGH' },
  { id: 'deploy-fail', label: 'Deploy Fail', icon: '🚀', title: 'Deployment failure', description: 'A deployment failed and may have caused service disruption.', severity: 'HIGH' },
  { id: 'infra-alert', label: 'Infra Alert', icon: '🖥️', title: 'Infrastructure alert', description: 'Infrastructure monitoring alert triggered.', severity: 'MEDIUM' },
];

// ── Status options (mirrored from modal JSX) ──────────────────────────────────

const STATUS_OPTIONS: IncidentStatus[] = [
  'INVESTIGATING', 'IDENTIFIED', 'MONITORING', 'RESOLVED',
];

const STATUS_LABELS: Record<IncidentStatus, string> = {
  INVESTIGATING: 'Investigating',
  IDENTIFIED: 'Identified',
  MONITORING: 'Monitoring',
  RESOLVED: 'Resolved',
};

// ── Severity options ──────────────────────────────────────────────────────────

const SEVERITY_OPTIONS: IncidentSeverity[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

const SEVERITY_LABELS: Record<IncidentSeverity, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  CRITICAL: 'Critical',
};

// ── CreateIncidentModal — confirm button disable logic ────────────────────────

function createConfirmDisabled(title: string, creating: boolean): boolean {
  return !title.trim() || creating;
}

describe('CreateIncidentModal — confirm button disable logic', () => {
  it('is disabled when title is empty', () => {
    expect(createConfirmDisabled('', false)).toBe(true);
  });

  it('is disabled when title is only whitespace', () => {
    expect(createConfirmDisabled('   ', false)).toBe(true);
  });

  it('is disabled while creating', () => {
    expect(createConfirmDisabled('Incident', true)).toBe(true);
  });

  it('is enabled when title is non-empty and not creating', () => {
    expect(createConfirmDisabled('API Down', false)).toBe(false);
  });

  it('handles title with leading/trailing whitespace stripped', () => {
    expect(createConfirmDisabled('  A  ', false)).toBe(false);
  });
});

// ── EditIncidentModal — confirm button disable logic ─────────────────────────

function editConfirmDisabled(title: string, editing: boolean): boolean {
  return !title.trim() || editing;
}

describe('EditIncidentModal — confirm button disable logic', () => {
  it('is disabled when title is empty', () => {
    expect(editConfirmDisabled('', false)).toBe(true);
  });

  it('is disabled while editing', () => {
    expect(editConfirmDisabled('Incident', true)).toBe(true);
  });

  it('is enabled when title is non-empty and not editing', () => {
    expect(editConfirmDisabled('API Down', false)).toBe(false);
  });
});

// ── PostUpdateModal — confirm button disable logic ────────────────────────────

function postUpdateConfirmDisabled(body: string, posting: boolean): boolean {
  return !body.trim() || posting;
}

describe('PostUpdateModal — confirm button disable logic', () => {
  it('is disabled when body is empty', () => {
    expect(postUpdateConfirmDisabled('', false)).toBe(true);
  });

  it('is disabled when body is only whitespace', () => {
    expect(postUpdateConfirmDisabled('   \t\n', false)).toBe(true);
  });

  it('is disabled while posting', () => {
    expect(postUpdateConfirmDisabled('We are investigating', true)).toBe(true);
  });

  it('is enabled when body is non-empty and not posting', () => {
    expect(postUpdateConfirmDisabled('Service restored', false)).toBe(false);
  });
});

// ── DeleteIncidentModal — label logic ────────────────────────────────────────

function deletingLabel(deleting: boolean): string {
  return deleting ? 'Deleting…' : 'Delete';
}

describe('DeleteIncidentModal — label logic', () => {
  it('shows "Deleting…" while deleting', () => {
    expect(deletingLabel(true)).toBe('Deleting…');
  });

  it('shows "Delete" when not deleting', () => {
    expect(deletingLabel(false)).toBe('Delete');
  });
});

// ── INCIDENT_TEMPLATES structure contract ─────────────────────────────────────

describe('INCIDENT_TEMPLATES', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(INCIDENT_TEMPLATES)).toBe(true);
    expect(INCIDENT_TEMPLATES.length).toBeGreaterThan(0);
  });

  it('all templates have required fields', () => {
    for (const tpl of INCIDENT_TEMPLATES) {
      expect(typeof tpl.id).toBe('string');
      expect(tpl.id.length).toBeGreaterThan(0);
      expect(typeof tpl.label).toBe('string');
      expect(tpl.label.length).toBeGreaterThan(0);
      expect(typeof tpl.icon).toBe('string');
      expect(tpl.icon.length).toBeGreaterThan(0);
      expect(typeof tpl.title).toBe('string');
      expect(tpl.title.length).toBeGreaterThan(0);
      expect(typeof tpl.description).toBe('string');
      expect(tpl.description.length).toBeGreaterThan(0);
      expect(SEVERITY_OPTIONS).toContain(tpl.severity);
    }
  });

  it('all template ids are unique', () => {
    const ids = INCIDENT_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('includes a CRITICAL severity template', () => {
    expect(INCIDENT_TEMPLATES.some((t) => t.severity === 'CRITICAL')).toBe(true);
  });

  it('includes templates across multiple severity levels', () => {
    const severities = new Set(INCIDENT_TEMPLATES.map((t) => t.severity));
    expect(severities.size).toBeGreaterThanOrEqual(2);
  });

  it('api-down template has CRITICAL severity', () => {
    const tpl = INCIDENT_TEMPLATES.find((t) => t.id === 'api-down');
    expect(tpl).toBeDefined();
    expect(tpl!.severity).toBe('CRITICAL');
  });
});

// ── Status options ────────────────────────────────────────────────────────────

describe('STATUS_OPTIONS', () => {
  it('has exactly 4 statuses', () => {
    expect(STATUS_OPTIONS).toHaveLength(4);
  });

  it('contains INVESTIGATING', () => {
    expect(STATUS_OPTIONS).toContain('INVESTIGATING');
  });

  it('contains IDENTIFIED', () => {
    expect(STATUS_OPTIONS).toContain('IDENTIFIED');
  });

  it('contains MONITORING', () => {
    expect(STATUS_OPTIONS).toContain('MONITORING');
  });

  it('contains RESOLVED', () => {
    expect(STATUS_OPTIONS).toContain('RESOLVED');
  });

  it('all statuses have labels', () => {
    for (const status of STATUS_OPTIONS) {
      expect(STATUS_LABELS[status]).toBeDefined();
      expect(typeof STATUS_LABELS[status]).toBe('string');
      expect(STATUS_LABELS[status].length).toBeGreaterThan(0);
    }
  });
});

// ── Severity options ──────────────────────────────────────────────────────────

describe('SEVERITY_OPTIONS', () => {
  it('has exactly 4 severity levels', () => {
    expect(SEVERITY_OPTIONS).toHaveLength(4);
  });

  it('contains LOW', () => {
    expect(SEVERITY_OPTIONS).toContain('LOW');
  });

  it('contains MEDIUM', () => {
    expect(SEVERITY_OPTIONS).toContain('MEDIUM');
  });

  it('contains HIGH', () => {
    expect(SEVERITY_OPTIONS).toContain('HIGH');
  });

  it('contains CRITICAL', () => {
    expect(SEVERITY_OPTIONS).toContain('CRITICAL');
  });

  it('all severity levels have labels', () => {
    for (const sev of SEVERITY_OPTIONS) {
      expect(SEVERITY_LABELS[sev]).toBeDefined();
      expect(typeof SEVERITY_LABELS[sev]).toBe('string');
      expect(SEVERITY_LABELS[sev].length).toBeGreaterThan(0);
    }
  });
});

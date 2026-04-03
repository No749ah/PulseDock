/**
 * Unit tests for BackupRestoreCard pure logic helpers.
 * Tests backup filename generation, restore result summary,
 * monitor error slicing, and overflow label.
 */
import { describe, it, expect } from 'vitest';

// ── Pure helpers mirrored from component ─────────────────────────────────────

interface RestoreStats {
  created: number;
  skipped: number;
}

interface MonitorRestoreStats extends RestoreStats {
  errors: string[];
}

interface RestoreResult {
  folders: RestoreStats;
  tags: RestoreStats;
  monitors: MonitorRestoreStats;
  alertChannels: RestoreStats;
  statusPages: RestoreStats;
  settings: { updated: boolean };
}

function buildBackupFilename(date: string): string {
  return `pulsedock-backup-${date}.json`;
}

function backupDateSlice(isoString: string): string {
  return isoString.slice(0, 10);
}

function totalCreated(result: RestoreResult): number {
  return (
    result.folders.created +
    result.tags.created +
    result.monitors.created +
    result.alertChannels.created +
    result.statusPages.created
  );
}

function totalSkipped(result: RestoreResult): number {
  return (
    result.folders.skipped +
    result.tags.skipped +
    result.monitors.skipped +
    result.alertChannels.skipped +
    result.statusPages.skipped
  );
}

function visibleErrors(errors: string[]): string[] {
  return errors.slice(0, 5);
}

function overflowCount(errors: string[]): number {
  return Math.max(0, errors.length - 5);
}

function hasErrors(result: RestoreResult): boolean {
  return result.monitors.errors.length > 0;
}

// ── buildBackupFilename ───────────────────────────────────────────────────────

describe('buildBackupFilename', () => {
  it('builds correct filename from date string', () => {
    expect(buildBackupFilename('2026-04-03')).toBe('pulsedock-backup-2026-04-03.json');
  });

  it('uses .json extension', () => {
    expect(buildBackupFilename('2025-12-31').endsWith('.json')).toBe(true);
  });
});

// ── backupDateSlice ───────────────────────────────────────────────────────────

describe('backupDateSlice', () => {
  it('extracts YYYY-MM-DD from ISO timestamp', () => {
    expect(backupDateSlice('2026-04-03T05:12:00.000Z')).toBe('2026-04-03');
  });

  it('handles midnight UTC', () => {
    expect(backupDateSlice('2026-01-01T00:00:00.000Z')).toBe('2026-01-01');
  });

  it('handles year boundary', () => {
    expect(backupDateSlice('2025-12-31T23:59:59.999Z')).toBe('2025-12-31');
  });
});

// ── totalCreated ──────────────────────────────────────────────────────────────

describe('totalCreated', () => {
  it('sums created counts across all categories', () => {
    const result: RestoreResult = {
      folders: { created: 2, skipped: 1 },
      tags: { created: 5, skipped: 0 },
      monitors: { created: 10, skipped: 3, errors: [] },
      alertChannels: { created: 1, skipped: 1 },
      statusPages: { created: 0, skipped: 2 },
      settings: { updated: true },
    };
    expect(totalCreated(result)).toBe(18);
  });

  it('returns 0 when all created counts are 0', () => {
    const result: RestoreResult = {
      folders: { created: 0, skipped: 1 },
      tags: { created: 0, skipped: 0 },
      monitors: { created: 0, skipped: 0, errors: [] },
      alertChannels: { created: 0, skipped: 0 },
      statusPages: { created: 0, skipped: 0 },
      settings: { updated: false },
    };
    expect(totalCreated(result)).toBe(0);
  });
});

// ── totalSkipped ──────────────────────────────────────────────────────────────

describe('totalSkipped', () => {
  it('sums skipped counts across all categories', () => {
    const result: RestoreResult = {
      folders: { created: 1, skipped: 2 },
      tags: { created: 0, skipped: 3 },
      monitors: { created: 5, skipped: 1, errors: [] },
      alertChannels: { created: 0, skipped: 4 },
      statusPages: { created: 0, skipped: 0 },
      settings: { updated: true },
    };
    expect(totalSkipped(result)).toBe(10);
  });
});

// ── visibleErrors ─────────────────────────────────────────────────────────────

describe('visibleErrors', () => {
  it('returns all errors when 5 or fewer', () => {
    const errors = ['err1', 'err2', 'err3'];
    expect(visibleErrors(errors)).toHaveLength(3);
  });

  it('returns exactly 5 when more than 5 errors', () => {
    const errors = ['e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7'];
    expect(visibleErrors(errors)).toHaveLength(5);
  });

  it('returns empty array for no errors', () => {
    expect(visibleErrors([])).toHaveLength(0);
  });

  it('returns first 5 in order', () => {
    const errors = ['e1', 'e2', 'e3', 'e4', 'e5', 'e6'];
    expect(visibleErrors(errors)).toEqual(['e1', 'e2', 'e3', 'e4', 'e5']);
  });
});

// ── overflowCount ─────────────────────────────────────────────────────────────

describe('overflowCount', () => {
  it('returns 0 when 5 or fewer errors', () => {
    expect(overflowCount(['e1', 'e2', 'e3', 'e4', 'e5'])).toBe(0);
  });

  it('returns overflow count when more than 5', () => {
    expect(overflowCount(['e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7'])).toBe(2);
  });

  it('returns 0 for empty array', () => {
    expect(overflowCount([])).toBe(0);
  });

  it('returns 1 for exactly 6 errors', () => {
    expect(overflowCount(['e1', 'e2', 'e3', 'e4', 'e5', 'e6'])).toBe(1);
  });
});

// ── hasErrors ─────────────────────────────────────────────────────────────────

describe('hasErrors', () => {
  it('returns false when no monitor errors', () => {
    const result: RestoreResult = {
      folders: { created: 1, skipped: 0 },
      tags: { created: 1, skipped: 0 },
      monitors: { created: 5, skipped: 0, errors: [] },
      alertChannels: { created: 1, skipped: 0 },
      statusPages: { created: 1, skipped: 0 },
      settings: { updated: true },
    };
    expect(hasErrors(result)).toBe(false);
  });

  it('returns true when monitor errors exist', () => {
    const result: RestoreResult = {
      folders: { created: 0, skipped: 0 },
      tags: { created: 0, skipped: 0 },
      monitors: { created: 0, skipped: 0, errors: ['Monitor "X" failed to import'] },
      alertChannels: { created: 0, skipped: 0 },
      statusPages: { created: 0, skipped: 0 },
      settings: { updated: false },
    };
    expect(hasErrors(result)).toBe(true);
  });
});

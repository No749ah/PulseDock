/**
 * Unit tests for DependenciesCard pure logic helpers.
 * Tests dependency filtering (excludes current monitor + already-added deps),
 * dependency empty state detection, and dependency selector logic.
 */
import { describe, it, expect } from 'vitest';

// ── Types mirrored from component ─────────────────────────────────────────────

interface MonitorItem {
  id: string;
  name: string;
  type: string;
  target: string;
  enabled: boolean;
}

interface MonitorDependency {
  id: string;
  dependsOnId: string;
  dependsOn: MonitorItem;
}

// ── Pure helpers mirrored from component ─────────────────────────────────────

/** Monitors available to add as dependencies (not self, not already added) */
function getSelectableMonitors(
  currentId: string,
  allMonitors: MonitorItem[],
  dependencies: MonitorDependency[],
): MonitorItem[] {
  return allMonitors.filter(
    (m) => m.id !== currentId && !dependencies.some((d) => d.dependsOnId === m.id),
  );
}

function isAddButtonDisabled(addingDepId: string, depLoading: boolean): boolean {
  return !addingDepId || depLoading;
}

// ── getSelectableMonitors ─────────────────────────────────────────────────────

describe('getSelectableMonitors', () => {
  const monitors: MonitorItem[] = [
    { id: 'mon1', name: 'API', type: 'HTTP', target: 'https://api.example.com', enabled: true },
    { id: 'mon2', name: 'DB', type: 'TCP', target: 'db:5432', enabled: true },
    { id: 'mon3', name: 'Cache', type: 'TCP', target: 'cache:6379', enabled: false },
    { id: 'mon4', name: 'Web', type: 'HTTP', target: 'https://example.com', enabled: true },
  ];

  it('excludes the current monitor from selectable list', () => {
    const result = getSelectableMonitors('mon1', monitors, []);
    expect(result.every((m) => m.id !== 'mon1')).toBe(true);
    expect(result).toHaveLength(3);
  });

  it('excludes already-added dependencies', () => {
    const deps: MonitorDependency[] = [
      { id: 'd1', dependsOnId: 'mon2', dependsOn: monitors[1] },
    ];
    const result = getSelectableMonitors('mon1', monitors, deps);
    expect(result.every((m) => m.id !== 'mon2')).toBe(true);
    expect(result).toHaveLength(2);
  });

  it('returns empty when all other monitors are already dependencies', () => {
    const deps: MonitorDependency[] = [
      { id: 'd1', dependsOnId: 'mon2', dependsOn: monitors[1] },
      { id: 'd2', dependsOnId: 'mon3', dependsOn: monitors[2] },
      { id: 'd3', dependsOnId: 'mon4', dependsOn: monitors[3] },
    ];
    const result = getSelectableMonitors('mon1', monitors, deps);
    expect(result).toHaveLength(0);
  });

  it('returns all monitors minus self when no deps exist', () => {
    const result = getSelectableMonitors('mon4', monitors, []);
    expect(result).toHaveLength(3);
    expect(result.map((m) => m.id)).toEqual(['mon1', 'mon2', 'mon3']);
  });

  it('handles empty allMonitors array', () => {
    expect(getSelectableMonitors('mon1', [], [])).toHaveLength(0);
  });

  it('handles non-existent currentId gracefully (returns all)', () => {
    const result = getSelectableMonitors('nonexistent', monitors, []);
    expect(result).toHaveLength(4);
  });

  it('preserves disabled monitors in selectable list', () => {
    const result = getSelectableMonitors('mon1', monitors, []);
    expect(result.some((m) => m.id === 'mon3')).toBe(true);
  });
});

// ── isAddButtonDisabled ───────────────────────────────────────────────────────

describe('isAddButtonDisabled', () => {
  it('is disabled when addingDepId is empty', () => {
    expect(isAddButtonDisabled('', false)).toBe(true);
  });

  it('is disabled when depLoading is true', () => {
    expect(isAddButtonDisabled('mon2', true)).toBe(true);
  });

  it('is enabled when addingDepId is set and not loading', () => {
    expect(isAddButtonDisabled('mon2', false)).toBe(false);
  });

  it('is disabled when both empty and loading', () => {
    expect(isAddButtonDisabled('', true)).toBe(true);
  });
});

/**
 * Unit tests for MonitorTabBar pure logic.
 * Tests tab filtering (visible, primary/secondary), active tab detection, and badge handling.
 */
import { describe, it, expect } from 'vitest';

// ── Logic mirrored from the component ────────────────────────────────────────

interface TabDef {
  id: string;
  label: string;
  visible?: boolean;
  primary?: boolean;
  badge?: number;
}

function getVisibleTabs(tabs: TabDef[]): TabDef[] {
  return tabs.filter((t) => t.visible !== false);
}

function getPrimaryTabs(tabs: TabDef[]): TabDef[] {
  return getVisibleTabs(tabs).filter((t) => t.primary !== false);
}

function getSecondaryTabs(tabs: TabDef[]): TabDef[] {
  return getVisibleTabs(tabs).filter((t) => t.primary === false);
}

function isActiveSecondary(tabs: TabDef[], activeTab: string): boolean {
  return getSecondaryTabs(tabs).some((t) => t.id === activeTab);
}

function tabClass(isActive: boolean): string {
  const base = 'px-4 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap flex items-center gap-1.5';
  const active = 'bg-white/10 text-text-primary';
  const inactive = 'text-text-muted hover:text-text-secondary';
  return [base, isActive ? active : inactive].join(' ');
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeTab(id: string, overrides: Partial<TabDef> = {}): TabDef {
  return { id, label: `Tab ${id}`, visible: true, primary: true, ...overrides };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('MonitorTabBar — getVisibleTabs', () => {
  it('returns all tabs when all are visible', () => {
    const tabs = [makeTab('a'), makeTab('b'), makeTab('c')];
    expect(getVisibleTabs(tabs)).toHaveLength(3);
  });

  it('filters out tabs with visible=false', () => {
    const tabs = [makeTab('a'), makeTab('b', { visible: false }), makeTab('c')];
    expect(getVisibleTabs(tabs)).toHaveLength(2);
    expect(getVisibleTabs(tabs).map((t) => t.id)).toEqual(['a', 'c']);
  });

  it('treats undefined visible as visible (default to shown)', () => {
    const tabs = [{ id: 'x', label: 'X' }]; // no visible property
    expect(getVisibleTabs(tabs)).toHaveLength(1);
  });

  it('returns empty array when all tabs are hidden', () => {
    const tabs = [makeTab('a', { visible: false }), makeTab('b', { visible: false })];
    expect(getVisibleTabs(tabs)).toHaveLength(0);
  });
});

describe('MonitorTabBar — getPrimaryTabs', () => {
  it('returns only primary tabs', () => {
    const tabs = [
      makeTab('a', { primary: true }),
      makeTab('b', { primary: false }),
      makeTab('c', { primary: true }),
    ];
    expect(getPrimaryTabs(tabs)).toHaveLength(2);
    expect(getPrimaryTabs(tabs).map((t) => t.id)).toEqual(['a', 'c']);
  });

  it('treats undefined primary as primary (default = primary)', () => {
    const tabs = [{ id: 'x', label: 'X' }]; // no primary property
    expect(getPrimaryTabs(tabs)).toHaveLength(1);
  });

  it('excludes hidden primary tabs', () => {
    const tabs = [
      makeTab('a', { primary: true, visible: false }),
      makeTab('b', { primary: true, visible: true }),
    ];
    expect(getPrimaryTabs(tabs)).toHaveLength(1);
    expect(getPrimaryTabs(tabs)[0].id).toBe('b');
  });
});

describe('MonitorTabBar — getSecondaryTabs', () => {
  it('returns only tabs with primary=false', () => {
    const tabs = [
      makeTab('a', { primary: true }),
      makeTab('b', { primary: false }),
      makeTab('c', { primary: false }),
    ];
    expect(getSecondaryTabs(tabs)).toHaveLength(2);
    expect(getSecondaryTabs(tabs).map((t) => t.id)).toEqual(['b', 'c']);
  });

  it('returns empty when no secondary tabs', () => {
    const tabs = [makeTab('a'), makeTab('b')];
    expect(getSecondaryTabs(tabs)).toHaveLength(0);
  });

  it('excludes hidden secondary tabs', () => {
    const tabs = [
      makeTab('a', { primary: false, visible: true }),
      makeTab('b', { primary: false, visible: false }),
    ];
    expect(getSecondaryTabs(tabs)).toHaveLength(1);
    expect(getSecondaryTabs(tabs)[0].id).toBe('a');
  });
});

describe('MonitorTabBar — isActiveSecondary', () => {
  const tabs = [
    makeTab('overview', { primary: true }),
    makeTab('performance', { primary: false }),
    makeTab('ssl', { primary: false }),
  ];

  it('returns true when active tab is in secondary group', () => {
    expect(isActiveSecondary(tabs, 'performance')).toBe(true);
    expect(isActiveSecondary(tabs, 'ssl')).toBe(true);
  });

  it('returns false when active tab is primary', () => {
    expect(isActiveSecondary(tabs, 'overview')).toBe(false);
  });

  it('returns false for unknown tab id', () => {
    expect(isActiveSecondary(tabs, 'nonexistent')).toBe(false);
  });
});

describe('MonitorTabBar — tabClass', () => {
  it('active tab gets active class', () => {
    const cls = tabClass(true);
    expect(cls).toContain('bg-white/10');
    expect(cls).toContain('text-text-primary');
  });

  it('inactive tab gets inactive class', () => {
    const cls = tabClass(false);
    expect(cls).toContain('text-text-muted');
    expect(cls).toContain('hover:text-text-secondary');
  });

  it('both active and inactive tabs contain base class', () => {
    const base = 'rounded-lg text-sm font-medium';
    expect(tabClass(true)).toContain(base);
    expect(tabClass(false)).toContain(base);
  });

  it('active tab does NOT have inactive-only class', () => {
    expect(tabClass(true)).not.toContain('text-text-muted');
  });

  it('inactive tab does NOT have active-only class', () => {
    expect(tabClass(false)).not.toContain('bg-white/10');
  });
});

describe('MonitorTabBar — badge handling', () => {
  it('badge is undefined when not specified', () => {
    const tab = makeTab('x');
    expect(tab.badge).toBeUndefined();
  });

  it('badge value is preserved', () => {
    const tab = makeTab('x', { badge: 3 });
    expect(tab.badge).toBe(3);
  });

  it('badge of 0 is falsy (should not display)', () => {
    const tab = makeTab('x', { badge: 0 });
    expect(tab.badge).toBeFalsy();
  });

  it('positive badge value is truthy', () => {
    const tab = makeTab('x', { badge: 1 });
    expect(tab.badge).toBeTruthy();
  });
});

describe('MonitorTabBar — real-world tab set', () => {
  // Mirrors the actual monitor detail page tab configuration
  const REAL_TABS: TabDef[] = [
    makeTab('overview', { primary: true }),
    makeTab('runs', { primary: true }),
    makeTab('performance', { primary: true }),
    makeTab('ssl', { primary: true }),
    makeTab('headers', { primary: false }),
    makeTab('content', { primary: false }),
    makeTab('geo', { primary: false }),
    makeTab('slo', { primary: false }),
    makeTab('uptime', { primary: false }),
    makeTab('incidents', { primary: false }),
    makeTab('annotations', { primary: false }),
    makeTab('config', { primary: false }),
    makeTab('simulation', { primary: false }),
  ];

  it('primary tabs always visible at top level', () => {
    expect(getPrimaryTabs(REAL_TABS)).toHaveLength(4);
  });

  it('secondary tabs go into More dropdown', () => {
    expect(getSecondaryTabs(REAL_TABS)).toHaveLength(9);
  });

  it('total visible tabs = primary + secondary', () => {
    const visible = getVisibleTabs(REAL_TABS);
    const primary = getPrimaryTabs(REAL_TABS);
    const secondary = getSecondaryTabs(REAL_TABS);
    expect(primary.length + secondary.length).toBe(visible.length);
  });
});

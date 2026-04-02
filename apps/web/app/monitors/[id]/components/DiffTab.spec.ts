/**
 * Unit tests for DiffTab pure logic.
 * Tests renderLineDiff categorization, failedRuns filter, and line comparison.
 */
import { describe, it, expect } from 'vitest';

// ── Logic mirrored from component ────────────────────────────────────────────

interface MonitorRun {
  id: string;
  ok: boolean;
  responseBody?: string | null;
  message?: string | null;
  checkedAt: string;
}

function filterFailedRuns(runs: MonitorRun[]): MonitorRun[] {
  return runs.filter((r) => !r.ok && r.responseBody);
}

type DiffLine =
  | { kind: 'same'; text: string }
  | { kind: 'removed'; text: string }
  | { kind: 'added'; text: string };

function computeLineDiff(baseBody: string, failedBody: string): DiffLine[] {
  const baseLines = baseBody.split('\n');
  const failLines = failedBody.split('\n');
  const maxLen = Math.max(baseLines.length, failLines.length);
  const rows: DiffLine[] = [];
  for (let i = 0; i < maxLen; i++) {
    const b = baseLines[i] ?? null;
    const f = failLines[i] ?? null;
    if (b === f) {
      rows.push({ kind: 'same', text: b! });
    } else {
      if (b !== null) rows.push({ kind: 'removed', text: b });
      if (f !== null) rows.push({ kind: 'added', text: f });
    }
  }
  return rows;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DiffTab — filterFailedRuns', () => {
  it('keeps only failed runs with response body', () => {
    const runs: MonitorRun[] = [
      { id: '1', ok: true, responseBody: 'ok', checkedAt: '2026-01-01T00:00:00Z' },
      { id: '2', ok: false, responseBody: 'error body', checkedAt: '2026-01-01T00:01:00Z' },
      { id: '3', ok: false, responseBody: null, checkedAt: '2026-01-01T00:02:00Z' },
      { id: '4', ok: false, responseBody: 'another error', checkedAt: '2026-01-01T00:03:00Z' },
    ];
    const result = filterFailedRuns(runs);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.id)).toEqual(['2', '4']);
  });

  it('returns empty array when no failures', () => {
    const runs: MonitorRun[] = [
      { id: '1', ok: true, responseBody: 'ok', checkedAt: '2026-01-01' },
    ];
    expect(filterFailedRuns(runs)).toHaveLength(0);
  });

  it('excludes failed runs without response body', () => {
    const runs: MonitorRun[] = [
      { id: '1', ok: false, responseBody: undefined, checkedAt: '2026-01-01' },
      { id: '2', ok: false, responseBody: '', checkedAt: '2026-01-02' },
    ];
    // empty string is falsy — filtered out
    const result = filterFailedRuns(runs);
    expect(result).toHaveLength(0);
  });
});

describe('DiffTab — computeLineDiff', () => {
  it('marks identical lines as same', () => {
    const diff = computeLineDiff('hello\nworld', 'hello\nworld');
    expect(diff).toHaveLength(2);
    expect(diff.every((l) => l.kind === 'same')).toBe(true);
  });

  it('marks changed lines as removed + added', () => {
    const diff = computeLineDiff('hello', 'goodbye');
    expect(diff).toHaveLength(2);
    expect(diff[0]).toEqual({ kind: 'removed', text: 'hello' });
    expect(diff[1]).toEqual({ kind: 'added', text: 'goodbye' });
  });

  it('handles base shorter than fail (extra added lines)', () => {
    const diff = computeLineDiff('line1', 'line1\nline2');
    const sameLines = diff.filter((l) => l.kind === 'same');
    const addedLines = diff.filter((l) => l.kind === 'added');
    expect(sameLines).toHaveLength(1);
    expect(addedLines).toHaveLength(1);
    expect(addedLines[0].text).toBe('line2');
  });

  it('handles fail shorter than base (extra removed lines)', () => {
    const diff = computeLineDiff('line1\nline2', 'line1');
    const removedLines = diff.filter((l) => l.kind === 'removed');
    expect(removedLines).toHaveLength(1);
    expect(removedLines[0].text).toBe('line2');
  });

  it('handles empty base', () => {
    const diff = computeLineDiff('', 'new content');
    expect(diff.some((l) => l.kind === 'added')).toBe(true);
  });

  it('handles empty fail', () => {
    const diff = computeLineDiff('old content', '');
    expect(diff.some((l) => l.kind === 'removed')).toBe(true);
  });

  it('handles both empty', () => {
    const diff = computeLineDiff('', '');
    expect(diff).toHaveLength(1);
    expect(diff[0]).toEqual({ kind: 'same', text: '' });
  });

  it('counts same/changed lines correctly for multi-line diff', () => {
    const diff = computeLineDiff('a\nb\nc', 'a\nX\nc');
    const same = diff.filter((l) => l.kind === 'same');
    const changed = diff.filter((l) => l.kind !== 'same');
    expect(same).toHaveLength(2); // 'a' and 'c' are same
    expect(changed).toHaveLength(2); // 'b' removed, 'X' added
  });
});

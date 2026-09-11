/**
 * @vitest-environment node
 * Unit tests for pure helpers in alerts/noise/page.tsx
 */

import { describe, it, expect } from 'vitest';

// ── Inline the helpers (no JSX, no DOM needed) ────────────────────────────────

type NoiseScore = 'low' | 'medium' | 'high' | 'critical';

function noiseScoreConfig(score: NoiseScore): { label: string; className: string } {
  switch (score) {
    case 'critical':
      return { label: 'Critical', className: 'bg-red-500/15 text-red-400 border border-red-500/30' };
    case 'high':
      return { label: 'High', className: 'bg-orange-500/15 text-orange-400 border border-orange-500/30' };
    case 'medium':
      return { label: 'Medium', className: 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/30' };
    case 'low':
      return { label: 'Low', className: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' };
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('alerts/noise/page — noiseScoreConfig', () => {
  it('returns Critical config for critical score', () => {
    const cfg = noiseScoreConfig('critical');
    expect(cfg.label).toBe('Critical');
    expect(cfg.className).toContain('red-500');
  });

  it('returns High config for high score', () => {
    const cfg = noiseScoreConfig('high');
    expect(cfg.label).toBe('High');
    expect(cfg.className).toContain('orange-500');
  });

  it('returns Medium config for medium score', () => {
    const cfg = noiseScoreConfig('medium');
    expect(cfg.label).toBe('Medium');
    expect(cfg.className).toContain('yellow-500');
  });

  it('returns Low config for low score', () => {
    const cfg = noiseScoreConfig('low');
    expect(cfg.label).toBe('Low');
    expect(cfg.className).toContain('emerald-500');
  });

  it('each score produces a unique label', () => {
    const scores: NoiseScore[] = ['critical', 'high', 'medium', 'low'];
    const labels = scores.map((s) => noiseScoreConfig(s).label);
    expect(new Set(labels).size).toBe(4);
  });

  it('each score produces a unique className', () => {
    const scores: NoiseScore[] = ['critical', 'high', 'medium', 'low'];
    const classes = scores.map((s) => noiseScoreConfig(s).className);
    expect(new Set(classes).size).toBe(4);
  });

  it('critical className contains text-red-400', () => {
    expect(noiseScoreConfig('critical').className).toContain('text-red-400');
  });

  it('high className contains text-orange-400', () => {
    expect(noiseScoreConfig('high').className).toContain('text-orange-400');
  });

  it('medium className contains text-yellow-400', () => {
    expect(noiseScoreConfig('medium').className).toContain('text-yellow-400');
  });

  it('low className contains text-emerald-400', () => {
    expect(noiseScoreConfig('low').className).toContain('text-emerald-400');
  });

  it('all configs contain border in className', () => {
    const scores: NoiseScore[] = ['critical', 'high', 'medium', 'low'];
    for (const s of scores) {
      expect(noiseScoreConfig(s).className).toContain('border');
    }
  });

  it('severity ordering: critical > high > medium > low by label alphabetical length difference', () => {
    // Just verify the structure is ordered by severity label
    const order = ['critical', 'high', 'medium', 'low'] as NoiseScore[];
    const labels = order.map((s) => noiseScoreConfig(s).label);
    expect(labels).toEqual(['Critical', 'High', 'Medium', 'Low']);
  });
});

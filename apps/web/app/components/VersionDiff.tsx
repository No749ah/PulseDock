'use client';

import { ArrowRight } from 'lucide-react';

type SemverParts = {
  major: string;
  minor: string;
  patch: string;
  prerelease: string | null;
  build: string | null;
  raw: string;
};

function parseSemver(v: string): SemverParts | null {
  if (!v) return null;
  const clean = v.trim().replace(/^v/i, '');
  const m = clean.match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?$/);
  if (!m) return null;
  return {
    major: m[1],
    minor: m[2],
    patch: m[3],
    prerelease: m[4] ?? null,
    build: m[5] ?? null,
    raw: v.trim(),
  };
}

/** Extract version strings from a monitor run message like
 *  "GitHub current 1.2.3, latest 1.4.0"
 *  "Docker current 22.04, latest 24.04" */
export function extractVersionsFromMessage(msg: string): { from: string | null; to: string | null } {
  const m = msg.match(/current\s+([^\s,]+)[,\s]+latest\s+([^\s,]+)/i);
  if (m) return { from: m[1], to: m[2] };
  const m2 = msg.match(/New version[:\s]+([^\s(]+)\s*\(was\s+([^)]+)\)/i);
  if (m2) return { from: m2[2], to: m2[1] };
  return { from: null, to: null };
}

type VersionDiffProps = {
  from: string;
  to: string;
  className?: string;
};

/**
 * VersionDiff — compact version comparison for table cells.
 * Shows a severity badge (Major/Minor/Patch) + "from → to" on one line.
 */
export function VersionDiff({ from, to, className = '' }: VersionDiffProps) {
  const fromParsed = parseSemver(from);
  const toParsed = parseSemver(to);

  // If we can't parse semver, show a simple arrow diff
  if (!fromParsed || !toParsed) {
    return (
      <div className={`flex items-center gap-1.5 font-mono text-xs ${className}`}>
        <span className="text-text-secondary">{from}</span>
        <ArrowRight className="w-3 h-3 text-text-muted flex-shrink-0" />
        <span className="text-accent font-medium">{to}</span>
      </div>
    );
  }

  const majorChanged = fromParsed.major !== toParsed.major;
  const minorChanged = !majorChanged && fromParsed.minor !== toParsed.minor;
  const patchChanged = !majorChanged && !minorChanged && fromParsed.patch !== toParsed.patch;
  const preChanged = !majorChanged && !minorChanged && !patchChanged && fromParsed.prerelease !== toParsed.prerelease;

  const severity = majorChanged
    ? 'major'
    : minorChanged
      ? 'minor'
      : patchChanged
        ? 'patch'
        : preChanged
          ? 'pre'
          : 'none';

  const badge =
    severity === 'major'
      ? { text: 'Major', cls: 'bg-danger/15 text-danger' }
      : severity === 'minor'
        ? { text: 'Minor', cls: 'bg-warning/15 text-warning' }
        : severity === 'patch'
          ? { text: 'Patch', cls: 'bg-success/15 text-success' }
          : severity === 'pre'
            ? { text: 'Pre', cls: 'bg-accent/15 text-accent' }
            : { text: 'Same', cls: 'bg-surface-elevated text-text-secondary' };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap ${badge.cls}`}>
        {badge.text}
      </span>
      <span className="font-mono text-xs text-text-secondary whitespace-nowrap">
        {from} <span className="text-text-muted">→</span> {to}
      </span>
    </div>
  );
}

export default VersionDiff;

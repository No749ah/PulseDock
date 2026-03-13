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
  // Pattern: "current X, latest Y" or "current X.Y.Z, latest A.B.C"
  const m = msg.match(/current\s+([^\s,]+)[,\s]+latest\s+([^\s,]+)/i);
  if (m) return { from: m[1], to: m[2] };
  // Pattern: "was X.Y.Z" / "New version: A.B.C (was X.Y.Z)"
  const m2 = msg.match(/New version[:\s]+([^\s(]+)\s*\(was\s+([^)]+)\)/i);
  if (m2) return { from: m2[2], to: m2[1] };
  return { from: null, to: null };
}

type SegmentDiffProps = {
  label: string;
  from: string | null;
  to: string | null;
  changed: boolean;
  severity?: 'major' | 'minor' | 'patch' | 'pre' | 'none';
};

function SegmentDiff({ label, from, to, changed, severity = 'none' }: SegmentDiffProps) {
  const severityColor =
    severity === 'major'
      ? 'text-danger'
      : severity === 'minor'
        ? 'text-warning'
        : severity === 'patch'
          ? 'text-success'
          : 'text-accent';

  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-[10px] text-text-secondary uppercase tracking-wider font-medium mb-0.5">{label}</span>
      <div className="flex items-center gap-1">
        {from !== null && (
          <span
            className={`font-mono text-sm px-1.5 py-0.5 rounded ${
              changed
                ? 'bg-danger/10 text-danger line-through opacity-60'
                : 'bg-surface-elevated text-text-secondary'
            }`}
          >
            {from}
          </span>
        )}
        {changed && to !== null && (
          <>
            <ArrowRight className="w-3 h-3 text-text-secondary flex-shrink-0" />
            <span className={`font-mono text-sm px-1.5 py-0.5 rounded bg-${severity === 'major' ? 'danger' : severity === 'minor' ? 'warning' : severity === 'patch' ? 'success' : 'accent'}/15 ${severityColor} font-semibold`}>
              {to}
            </span>
          </>
        )}
        {!changed && to !== null && from === null && (
          <span className="font-mono text-sm px-1.5 py-0.5 rounded bg-surface-elevated text-text-secondary">
            {to}
          </span>
        )}
      </div>
    </div>
  );
}

type VersionDiffProps = {
  from: string;
  to: string;
  className?: string;
};

/**
 * VersionDiff — visual semver comparison with highlighted changed segments.
 * Major change → red, Minor → yellow, Patch → green, Prerelease → blue.
 */
export function VersionDiff({ from, to, className = '' }: VersionDiffProps) {
  const fromParsed = parseSemver(from);
  const toParsed = parseSemver(to);

  // If we can't parse semver, show a simple arrow diff
  if (!fromParsed || !toParsed) {
    return (
      <div className={`flex items-center gap-2 font-mono text-sm ${className}`}>
        <span className="px-1.5 py-0.5 rounded bg-danger/10 text-danger line-through opacity-60">{from}</span>
        <ArrowRight className="w-3 h-3 text-text-secondary" />
        <span className="px-1.5 py-0.5 rounded bg-accent/10 text-accent font-semibold">{to}</span>
      </div>
    );
  }

  const majorChanged = fromParsed.major !== toParsed.major;
  const minorChanged = !majorChanged && fromParsed.minor !== toParsed.minor;
  const patchChanged = !majorChanged && !minorChanged && fromParsed.patch !== toParsed.patch;
  const preChanged = !majorChanged && !minorChanged && !patchChanged && fromParsed.prerelease !== toParsed.prerelease;

  // Determine overall severity label
  const severity = majorChanged
    ? 'major'
    : minorChanged
      ? 'minor'
      : patchChanged
        ? 'patch'
        : preChanged
          ? 'pre'
          : 'none';

  const severityLabel =
    severity === 'major'
      ? { text: 'Major', cls: 'bg-danger/10 text-danger' }
      : severity === 'minor'
        ? { text: 'Minor', cls: 'bg-warning/10 text-warning' }
        : severity === 'patch'
          ? { text: 'Patch', cls: 'bg-success/10 text-success' }
          : severity === 'pre'
            ? { text: 'Pre-release', cls: 'bg-accent/10 text-accent' }
            : { text: 'No change', cls: 'bg-surface-elevated text-text-secondary' };

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {/* Severity badge */}
      <div className="flex items-center gap-2">
        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${severityLabel.cls}`}>
          {severityLabel.text} update
        </span>
        <span className="text-xs text-text-secondary font-mono">
          {from} → {to}
        </span>
      </div>

      {/* Segment-level diff */}
      <div className="flex items-end gap-1.5 flex-wrap">
        <SegmentDiff
          label="major"
          from={fromParsed.major}
          to={toParsed.major}
          changed={majorChanged}
          severity="major"
        />
        <span className="text-text-secondary font-mono text-sm pb-1">.</span>
        <SegmentDiff
          label="minor"
          from={fromParsed.minor}
          to={toParsed.minor}
          changed={minorChanged}
          severity="minor"
        />
        <span className="text-text-secondary font-mono text-sm pb-1">.</span>
        <SegmentDiff
          label="patch"
          from={fromParsed.patch}
          to={toParsed.patch}
          changed={patchChanged}
          severity="patch"
        />
        {(fromParsed.prerelease || toParsed.prerelease) && (
          <>
            <span className="text-text-secondary font-mono text-sm pb-1">-</span>
            <SegmentDiff
              label="pre"
              from={fromParsed.prerelease}
              to={toParsed.prerelease}
              changed={preChanged}
              severity="pre"
            />
          </>
        )}
      </div>
    </div>
  );
}

export default VersionDiff;

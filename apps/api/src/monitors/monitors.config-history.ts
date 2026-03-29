/**
 * Pure helpers for Monitor Config Change History.
 * Computes field-level diffs between monitor states and builds human-readable summaries.
 */

/** Fields tracked for config diffs — subset of Monitor model scalar fields */
export const TRACKED_FIELDS = [
  'name', 'description', 'target', 'type', 'intervalSec', 'timeoutMs',
  'confirmations', 'retryCount', 'enabled', 'slaTarget', 'slaPeriodDays',
  'autoIncident', 'autoIncidentSeverity', 'flapDetectionEnabled', 'flapWindow',
  'flapThreshold', 'latencyAlertMs', 'anomalyDetection', 'anomalyMultiplier',
  'cronExpression', 'scheduleEnabled', 'scheduleDays', 'scheduleStartHour',
  'scheduleEndHour', 'sliLatencyTarget', 'rtoMinutes', 'throttleMs',
  'maxChecksPerHour', 'adaptiveIntervalEnabled', 'adaptiveIntervalDownSec', 'adaptiveIntervalDegradedSec',
  'metricPath', 'metricName', 'metricAlertMin', 'metricAlertMax',
  'graphqlQuery', 'graphqlDataPath', 'graphqlExpectedValue',
] as const;

export type TrackedField = typeof TRACKED_FIELDS[number];

export interface FieldChange {
  field: string;
  from: unknown;
  to: unknown;
}

/**
 * Computes field-level diff between two monitor state snapshots.
 * Only returns fields that actually changed (null/undefined normalized to null).
 * @param before - Monitor state before update
 * @param after - Monitor state after update
 * @returns Array of changed fields with before/after values
 */
export function computeMonitorDiff(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): FieldChange[] {
  const changes: FieldChange[] = [];
  for (const field of TRACKED_FIELDS) {
    const b = before[field] ?? null;
    const a = after[field] ?? null;
    if (JSON.stringify(b) !== JSON.stringify(a)) {
      changes.push({ field, from: b, to: a });
    }
  }
  return changes;
}

/**
 * Builds a human-readable summary string from a list of field changes.
 * Shows up to 3 changes inline, then "+N more" for the rest.
 * @param changes - Array of field changes from computeMonitorDiff
 * @returns Human-readable summary string
 */
export function buildSummary(changes: FieldChange[]): string {
  if (changes.length === 0) return 'No tracked fields changed';
  const parts = changes.slice(0, 3).map(({ field, from, to }) => {
    const fStr = from == null ? 'null' : String(from);
    const tStr = to == null ? 'null' : String(to);
    const fromShort = fStr.length > 30 ? fStr.slice(0, 27) + '...' : fStr;
    const toShort = tStr.length > 30 ? tStr.slice(0, 27) + '...' : tStr;
    return `${field}: ${fromShort} → ${toShort}`;
  });
  if (changes.length > 3) parts.push(`+${changes.length - 3} more`);
  return parts.join(', ');
}

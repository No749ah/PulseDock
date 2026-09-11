import { TIMEZONES, DAY_LABELS } from './utils';

interface ChannelScheduleSectionProps {
  enabled: boolean;
  setEnabled: (v: boolean) => void;
  timezone: string;
  setTimezone: (v: string) => void;
  days: number[];
  setDays: (v: number[]) => void;
  startHour: number;
  setStartHour: (v: number) => void;
  endHour: number;
  setEndHour: (v: number) => void;
}

export function ChannelScheduleSection({
  enabled,
  setEnabled,
  timezone,
  setTimezone,
  days,
  setDays,
  startHour,
  setStartHour,
  endHour,
  setEndHour,
}: ChannelScheduleSectionProps) {
  function toggleDay(d: number) {
    setDays(days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort((a, b) => a - b));
  }

  return (
    <div className="border-t border-border pt-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
          Active Schedule
        </p>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="w-4 h-4 accent-accent"
          />
          <span className="text-xs text-text-secondary">Restrict to time window</span>
        </label>
      </div>
      {enabled && (
        <div className="space-y-3 bg-surface-elevated rounded-lg p-3">
          <div className="flex flex-wrap gap-1">
            {DAY_LABELS.map((label, i) => (
              <button
                key={i}
                type="button"
                onClick={() => toggleDay(i)}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  days.includes(i)
                    ? 'bg-accent text-white'
                    : 'bg-surface text-text-secondary border border-border hover:border-accent'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="flex-1 text-xs rounded border border-border bg-surface px-2 py-1.5 text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-secondary w-12">From</span>
            <select
              value={startHour}
              onChange={(e) => setStartHour(Number(e.target.value))}
              className="text-xs rounded border border-border bg-surface px-2 py-1.5 text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
            >
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>
                  {String(h).padStart(2, '0')}:00
                </option>
              ))}
            </select>
            <span className="text-xs text-text-secondary">to</span>
            <select
              value={endHour}
              onChange={(e) => setEndHour(Number(e.target.value))}
              className="text-xs rounded border border-border bg-surface px-2 py-1.5 text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
            >
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h + 1} value={h + 1}>
                  {String(h + 1).padStart(2, '0')}:00
                </option>
              ))}
            </select>
          </div>
          <p className="text-[11px] text-text-muted">
            Alerts outside this window are silently dropped — not queued or delayed.
          </p>
        </div>
      )}
    </div>
  );
}

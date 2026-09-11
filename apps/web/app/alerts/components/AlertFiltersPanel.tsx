import Link from 'next/link';
import { Activity, CheckCircle2, Eye, Plus } from 'lucide-react';
import { Button } from '../../components/Button';

interface AlertFiltersPanelProps {
  channelsCount: number;
  showColPicker: boolean;
  setShowColPicker: (v: boolean | ((prev: boolean) => boolean)) => void;
  visibleCols: Record<string, boolean>;
  toggleCol: (col: string) => void;
  testingAll: boolean;
  onTestAll: () => void;
  onOpenCreate: () => void;
}

export function AlertFiltersPanel({
  channelsCount,
  showColPicker,
  setShowColPicker,
  visibleCols,
  toggleCol,
  testingAll,
  onTestAll,
  onOpenCreate,
}: AlertFiltersPanelProps) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div>
        <h2 className="text-2xl font-bold text-text-primary">Alert Channels</h2>
        <p className="text-text-secondary text-sm mt-1">
          {channelsCount} {channelsCount === 1 ? 'channel' : 'channels'} configured
        </p>
      </div>
      <div className="flex items-center gap-2">
        {channelsCount > 0 && (
          <div className="relative">
            <button
              onClick={() => setShowColPicker((v) => !v)}
              title="Toggle column visibility"
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors ${showColPicker ? 'border-accent/50 bg-accent/10 text-accent' : 'border-border text-text-secondary hover:text-text-primary hover:bg-surface-elevated'}`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Columns</span>
            </button>
            {showColPicker && (
              <div className="absolute right-0 top-full mt-1 z-30 w-48 rounded-xl border border-border bg-surface shadow-xl shadow-black/30 p-2 space-y-1">
                <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider px-2 py-1">
                  Visible Columns
                </p>
                {([
                  ['name', 'Name'],
                  ['type', 'Type'],
                  ['lastTriggered', 'Last Triggered'],
                  ['created', 'Created'],
                  ['actions', 'Actions'],
                ] as [string, string][]).map(([col, label]) => (
                  <button
                    key={col}
                    onClick={() => toggleCol(col)}
                    className="flex items-center justify-between w-full rounded-lg px-2 py-1.5 text-xs hover:bg-surface-elevated transition-colors"
                  >
                    <span className={visibleCols[col] ? 'text-text-primary' : 'text-text-muted'}>
                      {label}
                    </span>
                    <span
                      className={`w-3.5 h-3.5 rounded border flex items-center justify-center text-[10px] ${visibleCols[col] ? 'bg-accent border-accent text-white' : 'border-border'}`}
                    >
                      {visibleCols[col] ? '✓' : ''}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {channelsCount > 0 && (
          <Button variant="secondary" size="lg" onClick={onTestAll} disabled={testingAll}>
            <span className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              {testingAll ? 'Testing…' : 'Test All'}
            </span>
          </Button>
        )}

        <Link href="/alerts/history">
          <Button variant="secondary" size="lg">
            <span className="flex items-center gap-2">
              <Activity className="w-4 h-4" /> View History
            </span>
          </Button>
        </Link>

        <Button size="lg" onClick={onOpenCreate}>
          <span className="flex items-center gap-2">
            <Plus className="w-4 h-4" /> Create channel
          </span>
        </Button>
      </div>
    </div>
  );
}

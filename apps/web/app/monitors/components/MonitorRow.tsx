"use client";

import Link from "next/link";
import { Bell, CheckSquare, Copy, Pencil, Pin, PlayCircle, Power, PowerOff, Square, Trash2 } from "lucide-react";
import { Button } from "../../components/Button";
import { TableCell, TableRow } from "../../components/Table";
import { MonitorStatusCell } from "../../components/MonitorStatusCell";
import { formatMonitorType, relativeTime } from "../../components/timeUtils";
import type { MonitorItem, MonitorRun } from "../types";

interface Props {
  monitor: MonitorItem;
  runs: MonitorRun[];
  selected: boolean;
  visibleCols: Record<string, boolean>;
  healthScore?: { score: number; grade: string };
  folderName?: string;
  onToggleSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onClone: () => void;
  onCheckNow: () => void;
  onToggleEnabled: () => void;
  onOpenAlerts: () => void;
  onPin: () => void;
}

export function MonitorRow({
  monitor,
  runs,
  selected,
  visibleCols,
  healthScore,
  folderName,
  onToggleSelect,
  onEdit,
  onDelete,
  onClone,
  onCheckNow,
  onToggleEnabled,
  onOpenAlerts,
  onPin,
}: Props) {
  const lastRun = runs.find((r) => r.monitorId === monitor.id);

  return (
    <TableRow className={selected ? "bg-accent/5" : ""}>
      <TableCell className="w-10">
        <button
          onClick={onToggleSelect}
          className="p-0.5 rounded text-text-secondary hover:text-text-primary transition-colors"
          aria-label={selected ? `Deselect ${monitor.name}` : `Select ${monitor.name}`}
        >
          {selected ? <CheckSquare className="w-4 h-4 text-accent" /> : <Square className="w-4 h-4" />}
        </button>
      </TableCell>
      <TableCell className="font-medium text-text-primary">
        <div className="flex items-center gap-1.5">
          <Link href={`/monitors/${monitor.id}`} className="hover:text-accent transition-colors truncate max-w-[220px]">{monitor.name}</Link>
          {monitor.pinned && <Pin className="w-3 h-3 text-amber-400" />}
        </div>
        {folderName && <div className="text-xs text-text-secondary">{folderName}</div>}
      </TableCell>
      {visibleCols.type && <TableCell className="hidden sm:table-cell text-sm text-text-secondary">{formatMonitorType(monitor.type)}</TableCell>}
      {visibleCols.target && <TableCell className="hidden md:table-cell text-sm text-text-secondary truncate max-w-[220px]" title={monitor.target}>{monitor.target}</TableCell>}
      {visibleCols.interval && <TableCell className="hidden lg:table-cell text-sm text-text-secondary">{monitor.intervalSec}s</TableCell>}
      <TableCell>
        <MonitorStatusCell monitorId={monitor.id} monitorType={monitor.type} enabled={monitor.enabled} pausedUntil={monitor.pausedUntil} runs={runs} />
      </TableCell>
      {visibleCols.latency && (
        <TableCell className="hidden lg:table-cell text-sm font-mono tabular-nums">
          {lastRun?.latencyMs != null ? `${lastRun.latencyMs}ms` : <span className="text-text-muted">—</span>}
        </TableCell>
      )}
      {visibleCols.alerts && (
        <TableCell className="hidden sm:table-cell">
          <button onClick={onOpenAlerts} className="text-text-secondary hover:text-accent">
            <Bell className="w-4 h-4" />
          </button>
        </TableCell>
      )}
      {visibleCols.health && (
        <TableCell className="hidden md:table-cell">
          {healthScore ? (
            <span className="inline-flex items-center justify-center w-9 h-9 rounded-full border text-xs font-bold tabular-nums bg-success/10 text-success border-success/30">
              {healthScore.score}
            </span>
          ) : (
            <span className="text-text-muted text-xs">—</span>
          )}
        </TableCell>
      )}
      <TableCell className="text-xs text-text-secondary">{lastRun ? relativeTime(lastRun.checkedAt) : "—"}</TableCell>
      <TableCell>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={onEdit} title="Edit monitor"><Pencil className="w-4 h-4" /></Button>
          <Button variant="ghost" size="sm" onClick={onCheckNow} disabled={!monitor.enabled} title="Run check now"><PlayCircle className="w-4 h-4" /></Button>
          <Button variant="ghost" size="sm" onClick={onClone} title="Clone monitor"><Copy className="w-4 h-4" /></Button>
          <Button variant="ghost" size="sm" onClick={onToggleEnabled} title={monitor.enabled ? "Disable monitor" : "Enable monitor"}>
            {monitor.enabled ? <PowerOff className="w-4 h-4" /> : <Power className="w-4 h-4" />}
          </Button>
          <Button variant="ghost" size="sm" onClick={onPin} title={monitor.pinned ? "Unpin" : "Pin"}><Pin className="w-4 h-4" /></Button>
          <Button variant="ghost" size="sm" onClick={onDelete} title="Delete monitor" className="text-danger"><Trash2 className="w-4 h-4" /></Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

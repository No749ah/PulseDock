import { Edit, Trash2, Activity, BarChart2, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import { Button } from '../../components/Button';
import { Badge } from '../../components/Badge';
import { TableRow, TableCell } from '../../components/Table';
import { ChannelTypeIcon } from './ChannelTypeIcon';
import { DeliveryStatsPanel } from './DeliveryStatsPanel';
import { relativeTime } from './utils';
import type { AlertChannel, DeliveryStats } from './types';

interface AlertChannelRowProps {
  channel: AlertChannel;
  visibleCols: Record<string, boolean>;
  expandedStatsId: string | null;
  statsCache: Record<string, DeliveryStats>;
  statsLoading: string | null;
  onTest: (channel: AlertChannel) => void;
  onToggleStats: (channelId: string) => void;
  onOpenDeliveries: (channel: AlertChannel) => void;
  onOpenEdit: (channel: AlertChannel) => void;
  onOpenDelete: (channel: AlertChannel) => void;
}

export function AlertChannelRow({
  channel: c,
  visibleCols,
  expandedStatsId,
  statsCache,
  statsLoading,
  onTest,
  onToggleStats,
  onOpenDeliveries,
  onOpenEdit,
  onOpenDelete,
}: AlertChannelRowProps) {
  const isStatsExpanded = expandedStatsId === c.id;

  return (
    <>
      <TableRow key={c.id}>
        <TableCell className={visibleCols.name ? '' : 'hidden'}>
          <div className="flex items-center gap-2">
            <ChannelTypeIcon type={c.type} />
            <div className="flex flex-col min-w-0">
              <span className="font-medium text-text-primary">{c.name}</span>
              {c.scheduleJson?.enabled && (
                <span className="text-[10px] text-text-muted flex items-center gap-0.5">
                  🕐{' '}
                  {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
                    .filter((_, i) => c.scheduleJson!.days.includes(i))
                    .join('')}{' '}
                  {String(c.scheduleJson.startHour).padStart(2, '0')}:00–
                  {String(c.scheduleJson.endHour).padStart(2, '0')}:00{' '}
                  {c.scheduleJson.timezone}
                </span>
              )}
            </div>
          </div>
        </TableCell>
        <TableCell className={visibleCols.type ? '' : 'hidden'}>
          <Badge className="capitalize">{c.type}</Badge>
        </TableCell>
        <TableCell className={visibleCols.lastTriggered ? '' : 'hidden'}>
          <span className="text-sm text-text-secondary">
            {c.lastTriggeredAt ? relativeTime(c.lastTriggeredAt) : 'Never'}
          </span>
        </TableCell>
        <TableCell className={visibleCols.created ? '' : 'hidden'}>
          {new Date(c.createdAt).toLocaleString()}
        </TableCell>
        <TableCell className={visibleCols.actions ? '' : 'hidden'}>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => onTest(c)}>
              Test
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onToggleStats(c.id)}
              aria-label={`Delivery stats for ${c.name}`}
              title="Stats"
              className={isStatsExpanded ? 'text-accent' : ''}
            >
              <span className="flex items-center gap-1.5">
                <BarChart2 className="w-4 h-4" />
                <span className="hidden sm:inline text-xs">Stats</span>
                {isStatsExpanded ? (
                  <ChevronUp className="w-3 h-3" />
                ) : (
                  <ChevronDown className="w-3 h-3" />
                )}
              </span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onOpenDeliveries(c)}
              aria-label={`Delivery history for ${c.name}`}
              title="History"
            >
              <span className="flex items-center gap-1.5">
                <Activity className="w-4 h-4" />
                <span className="hidden sm:inline text-xs">History</span>
              </span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onOpenEdit(c)}
              aria-label={`Edit ${c.name}`}
              title="Edit channel"
            >
              <Edit className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onOpenDelete(c)}
              className="text-danger hover:text-danger"
              aria-label={`Delete ${c.name}`}
              title="Delete channel"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </TableCell>
      </TableRow>
      {isStatsExpanded && (
        <tr key={`stats-${c.id}`} className="bg-surface-elevated/50">
          <td colSpan={5} className="px-6 py-4">
            {statsLoading === c.id ? (
              <div className="flex items-center gap-2 text-text-secondary text-sm">
                <RefreshCw className="w-4 h-4 animate-spin" />
                Loading stats…
              </div>
            ) : statsCache[c.id] ? (
              <DeliveryStatsPanel stats={statsCache[c.id]} />
            ) : (
              <span className="text-sm text-text-secondary">No stats available.</span>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

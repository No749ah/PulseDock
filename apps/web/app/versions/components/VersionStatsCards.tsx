'use client';

import { Card } from '../../components/Card';
import type { Summary } from './types';

interface VersionStatsCardsProps {
  stats: Summary['stats'];
}

export function VersionStatsCards({ stats }: VersionStatsCardsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      <Card>
        <p className="text-text-secondary text-sm mb-1">Tracked</p>
        <p className="text-2xl font-bold text-text-primary">{stats.total}</p>
      </Card>
      <Card>
        <p className="text-text-secondary text-sm mb-1">Up-to-date</p>
        <p className="text-2xl font-bold text-success">{stats.green}</p>
      </Card>
      <Card>
        <p className="text-text-secondary text-sm mb-1">Updates</p>
        <p className="text-2xl font-bold text-warning">{stats.yellow}</p>
      </Card>
      <Card>
        <p className="text-text-secondary text-sm mb-1">Critical</p>
        <p className="text-2xl font-bold text-danger">{stats.red}</p>
      </Card>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { PhoneCall, Plus, Clock, Users, RefreshCw } from 'lucide-react';
import { AppFrame } from '../../components/app-frame';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { api } from '../../lib/api';
import { useToast } from '../../components/ui/toast';

type Participant = {
  id: string;
  userId: string;
  order: number;
};

type OnCallSchedule = {
  id: string;
  name: string;
  description: string | null;
  timezone: string;
  rotationDays: number;
  createdAt: string;
  updatedAt: string;
  participants: Participant[];
  currentOnCall: Participant | null;
  policies: { id: string; name: string }[];
};

export default function OnCallPage() {
  const [schedules, setSchedules] = useState<OnCallSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const { info, error: toastError } = useToast();

  useEffect(() => {
    loadSchedules();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadSchedules() {
    setLoading(true);
    try {
      const data = await api<OnCallSchedule[]>('/oncall/schedules');
      // Enrich each schedule with the currentOnCall participant from the server
      const enriched = await Promise.all(
        data.map(async (s) => {
          try {
            const detail = await api<OnCallSchedule>(`/oncall/schedules/${s.id}`);
            return detail;
          } catch {
            return { ...s, currentOnCall: null };
          }
        }),
      );
      setSchedules(enriched);
    } catch {
      toastError('Failed to load on-call schedules');
    } finally {
      setLoading(false);
    }
  }

  function handleNewSchedule() {
    info('Coming soon — schedule creation will be available in a future update.');
  }

  return (
    <AppFrame
      title="On-Call"
      subtitle="Manage rotation schedules and escalation policies."
      breadcrumbs={[{ label: 'On-Call' }]}
    >
      <div className="space-y-6">
        {/* Header actions */}
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={loadSchedules}
            disabled={loading}
            className="gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button onClick={handleNewSchedule} className="gap-2">
            <Plus className="w-4 h-4" />
            New Schedule
          </Button>
        </div>

        {/* Content */}
        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[...Array(3)].map((_, i) => (
              <Card key={i} className="p-6 animate-pulse">
                <div className="h-5 bg-surface-elevated rounded w-3/4 mb-3" />
                <div className="h-4 bg-surface-elevated rounded w-1/2 mb-2" />
                <div className="h-4 bg-surface-elevated rounded w-2/3" />
              </Card>
            ))}
          </div>
        ) : schedules.length === 0 ? (
          /* Empty state */
          <Card className="flex flex-col items-center justify-center py-20 text-center gap-4">
            <div className="rounded-full bg-accent/10 p-5">
              <PhoneCall className="w-10 h-10 text-accent" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-text-primary mb-1">
                No on-call schedules yet
              </h2>
              <p className="text-text-secondary max-w-sm">
                Create a rotation schedule to ensure your team is always covered when an alert fires.
              </p>
            </div>
            <Button onClick={handleNewSchedule} className="gap-2 mt-2">
              <Plus className="w-4 h-4" />
              Create Your First Schedule
            </Button>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {schedules.map((schedule) => (
              <ScheduleCard key={schedule.id} schedule={schedule} />
            ))}
          </div>
        )}
      </div>
    </AppFrame>
  );
}

function ScheduleCard({ schedule }: { schedule: OnCallSchedule }) {
  const currentOnCall = schedule.currentOnCall;

  return (
    <Card className="p-5 flex flex-col gap-4 hover:border-accent/50 transition-colors">
      {/* Title row */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold text-text-primary leading-tight">{schedule.name}</h3>
          {schedule.description && (
            <p className="text-xs text-text-secondary mt-0.5 line-clamp-2">
              {schedule.description}
            </p>
          )}
        </div>
        <span className="shrink-0 px-2 py-0.5 rounded-full text-xs font-medium bg-accent/10 text-accent border border-accent/20">
          {schedule.timezone}
        </span>
      </div>

      {/* Current on-call */}
      <div className="rounded-lg bg-surface-elevated border border-border p-3 flex items-center gap-3">
        {currentOnCall ? (
          <>
            <div className="relative flex h-2.5 w-2.5 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-text-secondary">Currently on-call</p>
              <p className="text-sm font-medium text-text-primary truncate">
                {currentOnCall.userId}
              </p>
            </div>
          </>
        ) : (
          <>
            <div className="h-2.5 w-2.5 rounded-full bg-text-secondary/30 shrink-0" />
            <p className="text-sm text-text-secondary">No participants assigned</p>
          </>
        )}
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 text-xs text-text-secondary">
        <span className="flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5" />
          {schedule.rotationDays}d rotation
        </span>
        <span className="flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5" />
          {schedule.participants.length} participant{schedule.participants.length !== 1 ? 's' : ''}
        </span>
      </div>
    </Card>
  );
}

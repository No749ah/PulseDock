import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../common/audit.service';
import { StatusPagesService } from '../status-pages/status-pages.service';
import { IncidentStatus, IncidentSeverity } from '@prisma/client';

export interface CreateIncidentDto {
  title: string;
  description?: string;
  severity?: IncidentSeverity;
  monitorIds?: string[];
}

export interface UpdateIncidentDto {
  title?: string;
  description?: string;
  status?: IncidentStatus;
  severity?: IncidentSeverity;
  monitorIds?: string[];
  rootCause?: string | null;
  postmortemNotes?: string | null;
}

export interface AddUpdateDto {
  body: string;
  status: IncidentStatus;
}

@Injectable()
export class IncidentsService {
  private readonly logger = new Logger(IncidentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly statusPagesService: StatusPagesService,
  ) {}

  /**
   * Returns all incidents for the given user, with the latest update and linked monitors.
   * Active incidents are ordered first (status ASC), then by creation date DESC.
   *
   * @param userId - Owner's user ID
   */
  async findAll(userId: string, statuses?: string[], limit?: number) {
    return this.prisma.incident.findMany({
      where: {
        userId,
        ...(statuses && statuses.length > 0 ? { status: { in: statuses as import('@prisma/client').IncidentStatus[] } } : {}),
      },
      include: {
        updates: { orderBy: { createdAt: 'desc' }, take: 1 },
        monitors: { include: { monitor: { select: { id: true, name: true, type: true } } } },
        _count: { select: { updates: true } },
      },
      orderBy: [
        // Active incidents first
        { status: 'asc' },
        { createdAt: 'desc' },
      ],
      ...(limit ? { take: limit } : {}),
    });
  }

  /**
   * Returns a single incident with all timeline updates and linked monitors.
   *
   * @param userId - Owner's user ID
   * @param id     - Incident ID
   * @throws NotFoundException if the incident does not exist or does not belong to `userId`
   */
  async findOne(userId: string, id: string) {
    const incident = await this.prisma.incident.findFirst({
      where: { id, userId },
      include: {
        updates: { orderBy: { createdAt: 'desc' } },
        monitors: { include: { monitor: { select: { id: true, name: true, type: true, target: true } } } },
      },
    });
    if (!incident) throw new NotFoundException('Incident not found');
    return incident;
  }

  /**
   * Creates a new incident with an initial "Incident created" timeline update.
   * Optionally links the incident to one or more monitors.
   * Fires an audit log entry on success.
   *
   * @param userId - Owner's user ID
   * @param dto    - Create payload (title, description, severity, monitorIds)
   * @throws BadRequestException if title is empty
   */
  async create(userId: string, dto: CreateIncidentDto) {
    if (!dto.title?.trim()) throw new BadRequestException('title is required');

    const incident = await this.prisma.incident.create({
      data: {
        userId,
        title: dto.title.trim().slice(0, 255),
        description: dto.description?.trim().slice(0, 2000) ?? null,
        severity: dto.severity ?? IncidentSeverity.MEDIUM,
        status: IncidentStatus.INVESTIGATING,
        updates: {
          create: {
            body: `Incident created: ${dto.title.trim()}`,
            status: IncidentStatus.INVESTIGATING,
          },
        },
        monitors: dto.monitorIds?.length
          ? {
              createMany: {
                data: dto.monitorIds.map((monitorId) => ({ monitorId })),
                skipDuplicates: true,
              },
            }
          : undefined,
      },
      include: {
        updates: true,
        monitors: { include: { monitor: { select: { id: true, name: true } } } },
      },
    });

    await this.audit.log('incident.created', userId, userId, {
      incidentId: incident.id,
      title: incident.title,
      severity: incident.severity,
    });

    // Notify status page subscribers
    this.statusPagesService.notifySubscribersOfIncident(incident.id, 'created').catch((err) =>
      this.logger.warn(`Subscriber notification failed for incident ${incident.id}: ${err instanceof Error ? err.message : String(err)}`),
    );

    return incident;
  }

  /**
   * Updates an incident's fields (title, description, status, severity, linked monitors).
   * Automatically sets `resolvedAt` when status transitions to RESOLVED,
   * and clears it when re-opened from a resolved state.
   * Monitor linkage is replaced atomically when `monitorIds` is provided.
   * Fires an audit log entry on success.
   *
   * @param userId - Owner's user ID
   * @param id     - Incident ID
   * @param dto    - Partial update payload
   * @throws NotFoundException if the incident does not belong to `userId`
   */
  async update(userId: string, id: string, dto: UpdateIncidentDto) {
    const existing = await this.prisma.incident.findFirst({ where: { id, userId } });
    if (!existing) throw new NotFoundException('Incident not found');
    if (existing.status === IncidentStatus.RESOLVED && dto.status && dto.status !== IncidentStatus.RESOLVED) {
      // Allow reopening
    }

    const resolvedAt =
      dto.status === IncidentStatus.RESOLVED && existing.status !== IncidentStatus.RESOLVED
        ? new Date()
        : dto.status && dto.status !== IncidentStatus.RESOLVED
          ? null
          : undefined;

    // Handle monitor linking updates
    if (dto.monitorIds !== undefined) {
      await this.prisma.incidentMonitor.deleteMany({ where: { incidentId: id } });
      if (dto.monitorIds.length > 0) {
        await this.prisma.incidentMonitor.createMany({
          data: dto.monitorIds.map((monitorId) => ({ incidentId: id, monitorId })),
          skipDuplicates: true,
        });
      }
    }

    const updated = await this.prisma.incident.update({
      where: { id },
      data: {
        ...(dto.title ? { title: dto.title.trim().slice(0, 255) } : {}),
        ...(dto.description !== undefined ? { description: dto.description?.trim().slice(0, 2000) ?? null } : {}),
        ...(dto.status ? { status: dto.status } : {}),
        ...(dto.severity ? { severity: dto.severity } : {}),
        ...(resolvedAt !== undefined ? { resolvedAt } : {}),
        ...(dto.rootCause !== undefined ? { rootCause: dto.rootCause?.trim().slice(0, 5000) ?? null } : {}),
        ...(dto.postmortemNotes !== undefined ? { postmortemNotes: dto.postmortemNotes?.trim().slice(0, 10000) ?? null } : {}),
      },
      include: {
        updates: { orderBy: { createdAt: 'desc' } },
        monitors: { include: { monitor: { select: { id: true, name: true } } } },
      },
    });

    await this.audit.log('incident.updated', userId, userId, {
      incidentId: id,
      changes: dto,
    });

    // Notify subscribers when incident is resolved
    if (dto.status === IncidentStatus.RESOLVED && existing.status !== IncidentStatus.RESOLVED) {
      this.statusPagesService.notifySubscribersOfIncident(id, 'resolved').catch((err) =>
        this.logger.warn(`Subscriber resolve notification failed for incident ${id}: ${err instanceof Error ? err.message : String(err)}`),
      );
    }

    return updated;
  }

  /**
   * Appends a timeline update to an incident and syncs the incident's status to match.
   * If the new status is RESOLVED and the incident was not previously resolved,
   * `resolvedAt` is set to now. If re-opened, `resolvedAt` is cleared.
   *
   * @param userId      - Owner's user ID
   * @param incidentId  - Target incident ID
   * @param dto         - Update payload (body text + new status)
   * @throws NotFoundException if the incident does not belong to `userId`
   * @throws BadRequestException if body is empty
   */
  async addUpdate(userId: string, incidentId: string, dto: AddUpdateDto) {
    const incident = await this.prisma.incident.findFirst({ where: { id: incidentId, userId } });
    if (!incident) throw new NotFoundException('Incident not found');
    if (!dto.body?.trim()) throw new BadRequestException('body is required');

    const update = await this.prisma.incidentUpdate.create({
      data: {
        incidentId,
        body: dto.body.trim().slice(0, 2000),
        status: dto.status,
      },
    });

    // Also update the incident status to match
    await this.prisma.incident.update({
      where: { id: incidentId },
      data: {
        status: dto.status,
        resolvedAt:
          dto.status === IncidentStatus.RESOLVED && incident.status !== IncidentStatus.RESOLVED
            ? new Date()
            : dto.status !== IncidentStatus.RESOLVED
              ? null
              : undefined,
      },
    });

    return update;
  }

  /**
   * Permanently deletes an incident and all its associated data (cascade).
   * Fires an audit log entry on success.
   *
   * @param userId - Owner's user ID
   * @param id     - Incident ID
   * @throws NotFoundException if the incident does not belong to `userId`
   */
  async delete(userId: string, id: string) {
    const incident = await this.prisma.incident.findFirst({ where: { id, userId } });
    if (!incident) throw new NotFoundException('Incident not found');

    await this.prisma.incident.delete({ where: { id } });
    await this.audit.log('incident.deleted', userId, userId, { incidentId: id, title: incident.title });
  }

  /**
   * Returns MTTR (Mean Time to Recovery) and MTTF (Mean Time to Failure) analytics
   * for the authenticated user's incidents over the given period.
   *
   * @param userId     - Owner's user ID
   * @param periodDays - Number of days to look back (1–365, default 30)
   */
  async mttrReport(userId: string, periodDays: number = 30) {
    const days = Math.min(Math.max(1, periodDays), 365);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const incidents = await this.prisma.incident.findMany({
      where: { userId, createdAt: { gte: since } },
      include: {
        monitors: { include: { monitor: { select: { id: true, name: true } } } },
      },
      orderBy: { createdAt: 'asc' },
    });

    const resolvedIncidents = incidents.filter((i) => i.resolvedAt !== null && i.status === 'RESOLVED');

    // ── Overall MTTR ──────────────────────────────────────────────────────────
    const durations = resolvedIncidents.map(
      (i) => (i.resolvedAt!.getTime() - i.createdAt.getTime()) / 60_000,
    );
    const mttrMinutes =
      durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : null;
    const longestIncidentMinutes = durations.length > 0 ? Math.max(...durations) : null;
    const shortestIncidentMinutes = durations.length > 0 ? Math.min(...durations) : null;

    // ── Overall MTTF ─────────────────────────────────────────────────────────
    // Group resolved incidents by monitor; average gaps between resolvedAt[i] and createdAt[i+1]
    const resolvedByMonitor = new Map<string, typeof resolvedIncidents>();
    for (const inc of resolvedIncidents) {
      for (const im of inc.monitors) {
        const mid = im.monitor.id;
        if (!resolvedByMonitor.has(mid)) resolvedByMonitor.set(mid, []);
        resolvedByMonitor.get(mid)!.push(inc);
      }
    }

    const mttfGaps: number[] = [];
    for (const monIncidents of resolvedByMonitor.values()) {
      const sorted = [...monIncidents].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      for (let i = 0; i < sorted.length - 1; i++) {
        const gap = (sorted[i + 1].createdAt.getTime() - sorted[i].resolvedAt!.getTime()) / 60_000;
        if (gap > 0) mttfGaps.push(gap);
      }
    }
    const mttfMinutes =
      mttfGaps.length > 0 ? mttfGaps.reduce((a, b) => a + b, 0) / mttfGaps.length : null;

    // ── byMonitor ─────────────────────────────────────────────────────────────
    const allByMonitor = new Map<
      string,
      { monitorId: string; monitorName: string; incidents: typeof incidents }
    >();
    for (const inc of incidents) {
      for (const im of inc.monitors) {
        const mid = im.monitor.id;
        if (!allByMonitor.has(mid)) {
          allByMonitor.set(mid, { monitorId: mid, monitorName: im.monitor.name, incidents: [] });
        }
        allByMonitor.get(mid)!.incidents.push(inc);
      }
    }

    const byMonitor = Array.from(allByMonitor.values()).map(({ monitorId, monitorName, incidents: mi }) => {
      const resolvedMon = mi.filter((i) => i.resolvedAt !== null && i.status === 'RESOLVED');
      const monDurations = resolvedMon.map(
        (i) => (i.resolvedAt!.getTime() - i.createdAt.getTime()) / 60_000,
      );
      const monMttr =
        monDurations.length > 0
          ? monDurations.reduce((a, b) => a + b, 0) / monDurations.length
          : null;
      return {
        monitorId,
        monitorName,
        mttrMinutes: monMttr,
        incidentCount: mi.length,
        resolvedCount: resolvedMon.length,
        avgDurationMinutes: monMttr,
      };
    });

    // ── Trend by ISO week (Monday start) ─────────────────────────────────────
    const getWeekStart = (date: Date): string => {
      const d = new Date(date);
      const day = d.getUTCDay(); // 0 = Sunday
      const diff = day === 0 ? -6 : 1 - day;
      d.setUTCDate(d.getUTCDate() + diff);
      d.setUTCHours(0, 0, 0, 0);
      return d.toISOString().split('T')[0];
    };

    const weekMap = new Map<string, { durations: number[]; count: number }>();
    for (const inc of incidents) {
      const week = getWeekStart(inc.createdAt);
      if (!weekMap.has(week)) weekMap.set(week, { durations: [], count: 0 });
      const entry = weekMap.get(week)!;
      entry.count++;
      if (inc.resolvedAt !== null && inc.status === 'RESOLVED') {
        entry.durations.push((inc.resolvedAt.getTime() - inc.createdAt.getTime()) / 60_000);
      }
    }

    const trend = Array.from(weekMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([week, { durations, count }]) => ({
        week,
        mttrMinutes:
          durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : null,
        incidentCount: count,
      }));

    return {
      overall: {
        mttrMinutes,
        mttfMinutes,
        totalIncidents: incidents.length,
        resolvedIncidents: resolvedIncidents.length,
        avgDurationMinutes: mttrMinutes,
        longestIncidentMinutes,
        shortestIncidentMinutes,
      },
      byMonitor,
      trend,
    };
  }

  /**
   * Returns the last 50 incidents (with updates + monitor names) for a public status page.
   * No authentication required — exposes only non-sensitive fields.
  // ─── Auto-Generate Post-Mortem ───────────────────────────────────────────────────

  /**
   * Generates a structured post-mortem markdown document from incident data.
   * Fills in duration, affected monitors, timeline of updates, check history
   * during the outage window, and pre-populates all standard sections.
   * If postmortemNotes is not already set, saves the generated content.
   */
  async generatePostmortem(userId: string, incidentId: string): Promise<{
    markdown: string;
    saved: boolean;
  }> {
    const incident = await this.prisma.incident.findFirst({
      where: { id: incidentId, userId },
      include: {
        updates: { orderBy: { createdAt: 'asc' } },
        monitors: { include: { monitor: { select: { id: true, name: true, type: true, target: true } } } },
      },
    });
    if (!incident) throw new NotFoundException('Incident not found');

    const createdAt = incident.createdAt;
    const resolvedAt = incident.resolvedAt;
    const durationMs = resolvedAt ? resolvedAt.getTime() - createdAt.getTime() : null;
    const durationStr = durationMs !== null ? this.formatDuration(durationMs) : 'Ongoing';

    // Fetch check history for affected monitors during the incident window
    const monitorIds = incident.monitors.map((m) => m.monitorId);
    const windowEnd = resolvedAt ?? new Date();
    const windowStart = new Date(createdAt.getTime() - 5 * 60 * 1000); // 5 min before incident

    let checkStats: Array<{ monitorId: string; name: string; totalRuns: number; failedRuns: number; firstFailure: Date | null }> = [];
    if (monitorIds.length > 0) {
      checkStats = await Promise.all(
        incident.monitors.map(async (m) => {
          const [totalRuns, failedRuns, firstFailureRow] = await Promise.all([
            this.prisma.monitorRun.count({ where: { monitorId: m.monitorId, checkedAt: { gte: windowStart, lte: windowEnd } } }),
            this.prisma.monitorRun.count({ where: { monitorId: m.monitorId, ok: false, checkedAt: { gte: windowStart, lte: windowEnd } } }),
            this.prisma.monitorRun.findFirst({ where: { monitorId: m.monitorId, ok: false, checkedAt: { gte: windowStart } }, orderBy: { checkedAt: 'asc' }, select: { checkedAt: true } }),
          ]);
          return { monitorId: m.monitorId, name: m.monitor.name, totalRuns, failedRuns, firstFailure: firstFailureRow?.checkedAt ?? null };
        }),
      );
    }

    const fmt = (d: Date) => d.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';

    const affectedSection = checkStats.length > 0
      ? checkStats.map((s) => {
          const pct = s.totalRuns > 0 ? Math.round((s.failedRuns / s.totalRuns) * 100) : 0;
          return `- **${s.name}**: ${s.failedRuns}/${s.totalRuns} checks failed (${pct}%)${s.firstFailure ? `, first failure at ${fmt(s.firstFailure)}` : ''}`;
        }).join('\n')
      : '_No monitors linked to this incident._';

    const timelineSection = incident.updates.length > 0
      ? incident.updates.map((u) => `- **${fmt(u.createdAt)}** — [${u.status}] ${u.body}`).join('\n')
      : '_No timeline updates recorded._';

    const markdown = `# Post-Mortem: ${incident.title}

**Incident ID:** ${incident.id}
**Severity:** ${incident.severity}
**Status:** ${incident.status}
**Created:** ${fmt(createdAt)}
**Resolved:** ${resolvedAt ? fmt(resolvedAt) : 'Not yet resolved'}
**Duration:** ${durationStr}

---

## Summary

> _Briefly describe what happened, who was affected, and what the impact was._

${incident.description ? incident.description : '_No description provided — add a summary here._'}

---

## Impact

${affectedSection}

---

## Timeline

${timelineSection}

---

## Root Cause

${incident.rootCause ? incident.rootCause : '> _What was the root cause? (e.g., "A configuration change at 14:32 UTC caused the API to reject all connections")_'}

---

## Contributing Factors

> _What conditions made this incident possible or worse? (e.g., lack of tests, missing monitoring, capacity planning gaps)_

-

---

## Resolution

> _How was the incident resolved? What steps were taken?_

-

---

## Action Items

> _What will be done to prevent recurrence? Be specific with owner and deadline._

| Action | Owner | Due Date | Status |
|--------|-------|----------|--------|
| | | | |

---

## Lessons Learned

${incident.postmortemNotes ? incident.postmortemNotes : '> _What did we learn? What went well? What could be improved?_'}

---

_Generated automatically by PulseDock on ${fmt(new Date())}_
`;

    // Save to postmortemNotes if not already set
    let saved = false;
    if (!incident.postmortemNotes) {
      await this.prisma.incident.update({
        where: { id: incidentId },
        data: { postmortemNotes: markdown },
      });
      saved = true;
    }

    return { markdown, saved };
  }

  private formatDuration(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
  }

  /**
   * Used by the public status-page API and incident-history widgets.
   *
   * @param targetUserId - The workspace owner whose incidents are displayed
   */
  async getPublicIncidents(targetUserId: string) {
    return this.prisma.incident.findMany({
      where: { userId: targetUserId },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        severity: true,
        resolvedAt: true,
        createdAt: true,
        updatedAt: true,
        updates: {
          select: { id: true, body: true, status: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
        },
        monitors: {
          select: { monitor: { select: { id: true, name: true } } },
        },
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 50,
    });
  }

  /**
   * Returns incident analytics for the last N days.
   * - Frequency heatmap: hour-of-day × day-of-week counts
   * - Severity distribution over time (weekly buckets)
   * - Top 10 most affected monitors
   * - MTTD (minutes from first check failure to incident creation) and MTTR trends by week
   * - Incident count by status (open/resolved)
   */
  async incidentInsights(userId: string, days: number): Promise<{
    period: { days: number; since: string };
    totals: {
      total: number;
      open: number;
      resolved: number;
      avgResolutionMinutes: number | null;
      longestIncidentMinutes: number | null;
    };
    severityBreakdown: Array<{ severity: string; count: number; pct: number }>;
    hourHeatmap: Array<{ hour: number; dow: number; count: number }>; // dow 0=Sun
    topMonitors: Array<{ monitorId: string; monitorName: string; count: number; resolvedCount: number; avgMinutes: number | null }>;
    weeklyTrend: Array<{ weekStart: string; total: number; critical: number; high: number; medium: number; low: number; avgResolutionMin: number | null }>;
  }> {
    const clampedDays = Math.min(365, Math.max(7, days));
    const since = new Date(Date.now() - clampedDays * 24 * 60 * 60 * 1000);

    const incidents = await this.prisma.incident.findMany({
      where: { userId, createdAt: { gte: since } },
      select: {
        id: true,
        status: true,
        severity: true,
        createdAt: true,
        resolvedAt: true,
        monitors: { select: { monitor: { select: { id: true, name: true } } } },
      },
      orderBy: { createdAt: 'asc' },
    });

    const total = incidents.length;
    const open = incidents.filter(i => i.status !== 'RESOLVED').length;
    const resolved = incidents.filter(i => i.status === 'RESOLVED');

    const resolutionMinutes = resolved
      .filter(i => i.resolvedAt !== null)
      .map(i => Math.round((i.resolvedAt!.getTime() - i.createdAt.getTime()) / 60000));

    const avgResolutionMinutes = resolutionMinutes.length > 0
      ? Math.round(resolutionMinutes.reduce((a, b) => a + b, 0) / resolutionMinutes.length)
      : null;
    const longestIncidentMinutes = resolutionMinutes.length > 0
      ? Math.max(...resolutionMinutes)
      : null;

    // Severity breakdown
    const sevMap = new Map<string, number>();
    for (const i of incidents) {
      sevMap.set(i.severity, (sevMap.get(i.severity) ?? 0) + 1);
    }
    const severityBreakdown = Array.from(sevMap.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([severity, count]) => ({ severity, count, pct: total > 0 ? Math.round((count / total) * 100) : 0 }));

    // Hour × DOW heatmap
    const heatMap = new Map<string, number>(); // key: `${dow}:${hour}`
    for (const i of incidents) {
      const dow = i.createdAt.getUTCDay();
      const hour = i.createdAt.getUTCHours();
      const key = `${dow}:${hour}`;
      heatMap.set(key, (heatMap.get(key) ?? 0) + 1);
    }
    const hourHeatmap: Array<{ hour: number; dow: number; count: number }> = [];
    for (let dow = 0; dow < 7; dow++) {
      for (let hour = 0; hour < 24; hour++) {
        const count = heatMap.get(`${dow}:${hour}`) ?? 0;
        if (count > 0) hourHeatmap.push({ hour, dow, count });
      }
    }

    // Top affected monitors
    const monitorCounts = new Map<string, { name: string; total: number; resolved: number; minutes: number[] }>();
    for (const i of incidents) {
      const durationMin = i.resolvedAt
        ? Math.round((i.resolvedAt.getTime() - i.createdAt.getTime()) / 60000)
        : null;
      for (const m of i.monitors) {
        const mid = m.monitor.id;
        if (!monitorCounts.has(mid)) monitorCounts.set(mid, { name: m.monitor.name, total: 0, resolved: 0, minutes: [] });
        const mc = monitorCounts.get(mid)!;
        mc.total++;
        if (i.status === 'RESOLVED') mc.resolved++;
        if (durationMin !== null) mc.minutes.push(durationMin);
      }
    }
    const topMonitors = Array.from(monitorCounts.entries())
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 10)
      .map(([monitorId, v]) => ({
        monitorId,
        monitorName: v.name,
        count: v.total,
        resolvedCount: v.resolved,
        avgMinutes: v.minutes.length > 0
          ? Math.round(v.minutes.reduce((a, b) => a + b, 0) / v.minutes.length)
          : null,
      }));

    // Weekly trend
    const now = new Date();
    const dow2 = now.getUTCDay();
    const daysSinceMon = (dow2 + 6) % 7;
    const thisMonday = new Date(now);
    thisMonday.setUTCHours(0, 0, 0, 0);
    thisMonday.setUTCDate(now.getUTCDate() - daysSinceMon);

    const numWeeks = Math.ceil(clampedDays / 7);
    const weekStarts: string[] = [];
    for (let i = numWeeks - 1; i >= 0; i--) {
      const d = new Date(thisMonday);
      d.setUTCDate(thisMonday.getUTCDate() - i * 7);
      weekStarts.push(d.toISOString().slice(0, 10));
    }

    type WB = { total: number; critical: number; high: number; medium: number; low: number; minutes: number[] };
    const weekBuckets = new Map<string, WB>();
    for (const ws of weekStarts) weekBuckets.set(ws, { total: 0, critical: 0, high: 0, medium: 0, low: 0, minutes: [] });

    for (const i of incidents) {
      const dateStr = i.createdAt.toISOString().slice(0, 10);
      let bucket = weekStarts[0];
      for (const ws of weekStarts) { if (dateStr >= ws) bucket = ws; }
      const b = weekBuckets.get(bucket);
      if (!b) continue;
      b.total++;
      const sev = i.severity?.toUpperCase() ?? 'LOW';
      if (sev === 'CRITICAL') b.critical++;
      else if (sev === 'HIGH') b.high++;
      else if (sev === 'MEDIUM') b.medium++;
      else b.low++;
      if (i.resolvedAt) b.minutes.push(Math.round((i.resolvedAt.getTime() - i.createdAt.getTime()) / 60000));
    }

    const weeklyTrend = weekStarts.map(ws => {
      const b = weekBuckets.get(ws)!;
      return {
        weekStart: ws,
        total: b.total,
        critical: b.critical,
        high: b.high,
        medium: b.medium,
        low: b.low,
        avgResolutionMin: b.minutes.length > 0
          ? Math.round(b.minutes.reduce((a, b) => a + b, 0) / b.minutes.length)
          : null,
      };
    });

    return {
      period: { days: clampedDays, since: since.toISOString().slice(0, 10) },
      totals: { total, open, resolved: resolved.length, avgResolutionMinutes, longestIncidentMinutes },
      severityBreakdown,
      hourHeatmap,
      topMonitors,
      weeklyTrend,
    };
  }
}

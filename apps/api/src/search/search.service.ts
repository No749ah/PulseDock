/**
 * Global Search Service
 * Performs case-insensitive substring matching across all major entity types.
 */
import { Injectable } from '@nestjs/common';
import { MonitorType } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';

/** Monitor types that represent version intelligence (not uptime monitors). */
const VERSION_MONITOR_TYPES: MonitorType[] = [MonitorType.GIT_RELEASE, MonitorType.DOCKER_IMAGE];

export interface SearchItem {
  id: string;
  type: 'monitor' | 'incident' | 'status_page' | 'version';
  title: string;
  subtitle: string;
  url: string;
  /** Optional status/badge label */
  status?: string;
  /** Optional color hint: green | yellow | red | blue | gray */
  statusColor?: 'green' | 'yellow' | 'red' | 'blue' | 'gray';
  /** ISO timestamp for recency sorting */
  updatedAt?: string;
}

export interface SearchResultDto {
  query: string;
  total: number;
  monitors: SearchItem[];
  incidents: SearchItem[];
  status_pages: SearchItem[];
  versions: SearchItem[];
}

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Search entities owned by userId matching the query string.
   * @param userId - Authenticated user ID
   * @param q - Search query (case-insensitive substring)
   * @param limit - Max results per category
   * @param types - Set of entity types to search
   */
  async search(
    userId: string,
    q: string,
    limit: number,
    types: Set<string>,
  ): Promise<SearchResultDto> {
    if (!q || q.length < 2) {
      return { query: q, total: 0, monitors: [], incidents: [], status_pages: [], versions: [] };
    }

    const [monitors, incidents, statusPages, versions] = await Promise.all([
      types.has('monitors') ? this.searchMonitors(userId, q, limit) : [],
      types.has('incidents') ? this.searchIncidents(userId, q, limit) : [],
      types.has('status_pages') ? this.searchStatusPages(userId, q, limit) : [],
      types.has('versions') ? this.searchVersions(userId, q, limit) : [],
    ]);

    return {
      query: q,
      total: monitors.length + incidents.length + statusPages.length + versions.length,
      monitors,
      incidents,
      status_pages: statusPages,
      versions,
    };
  }

  // ─── Monitors ──────────────────────────────────────────────────────────────

  private async searchMonitors(userId: string, q: string, limit: number): Promise<SearchItem[]> {
    const rows = await this.prisma.monitor.findMany({
      where: {
        userId,
        type: { notIn: VERSION_MONITOR_TYPES },
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { target: { contains: q, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        name: true,
        target: true,
        type: true,
        enabled: true,
        createdAt: true,
        runs: {
          orderBy: { checkedAt: 'desc' },
          take: 1,
          select: { level: true, checkedAt: true },
        },
      },
      orderBy: { name: 'asc' },
      take: limit,
    });

    return rows.map((m) => {
      const latestRun = m.runs[0];
      const status = latestRun?.level?.toUpperCase() ?? 'UNKNOWN';
      return {
        id: m.id,
        type: 'monitor' as const,
        title: m.name,
        subtitle: `${String(m.type).replace('_', ' ')} · ${m.target}`,
        url: `/monitors/${m.id}`,
        status: m.enabled ? status : 'PAUSED',
        statusColor: this.monitorStatusColor(m.enabled, status),
        updatedAt: (latestRun?.checkedAt ?? m.createdAt).toISOString(),
      };
    });
  }

  private monitorStatusColor(enabled: boolean, status: string): SearchItem['statusColor'] {
    if (!enabled) return 'gray';
    switch (status) {
      case 'GREEN': return 'green';
      case 'YELLOW': return 'yellow';
      case 'RED': return 'red';
      default: return 'gray';
    }
  }

  // ─── Incidents ──────────────────────────────────────────────────────────────

  private async searchIncidents(userId: string, q: string, limit: number): Promise<SearchItem[]> {
    const rows = await this.prisma.incident.findMany({
      where: {
        userId,
        OR: [
          { title: { contains: q, mode: 'insensitive' } },
          { description: { contains: q, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        title: true,
        status: true,
        severity: true,
        createdAt: true,
        resolvedAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return rows.map((i: { id: string; title: string; status: string; severity: string; createdAt: Date; resolvedAt: Date | null; updatedAt: Date }) => ({
      id: i.id,
      type: 'incident' as const,
      title: i.title,
      subtitle: `${i.severity} · ${i.status}`,
      url: `/incidents`,
      status: i.status,
      statusColor: this.incidentStatusColor(i.status),
      updatedAt: (i.updatedAt ?? i.createdAt).toISOString(),
    }));
  }

  private incidentStatusColor(status: string): SearchItem['statusColor'] {
    switch (status) {
      case 'RESOLVED': return 'green';
      case 'MONITORING': return 'yellow';
      case 'IDENTIFIED':
      case 'INVESTIGATING': return 'red';
      default: return 'gray';
    }
  }

  // ─── Status Pages ──────────────────────────────────────────────────────────

  private async searchStatusPages(userId: string, q: string, limit: number): Promise<SearchItem[]> {
    const rows = await this.prisma.publicStatusPage.findMany({
      where: {
        userId,
        OR: [
          { title: { contains: q, mode: 'insensitive' } },
          { slug: { contains: q, mode: 'insensitive' } },
          { description: { contains: q, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        title: true,
        slug: true,
        isPublished: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: limit,
    });

    return rows.map((p: { id: string; title: string; slug: string; isPublished: boolean; updatedAt: Date }) => ({
      id: p.id,
      type: 'status_page' as const,
      title: p.title,
      subtitle: `/${p.slug} · ${p.isPublished ? 'Published' : 'Draft'}`,
      url: `/status-pages/${p.id}/edit`,
      status: p.isPublished ? 'Published' : 'Draft',
      statusColor: (p.isPublished ? 'green' : 'gray') as SearchItem['statusColor'],
      updatedAt: p.updatedAt.toISOString(),
    }));
  }

  // ─── Versions ──────────────────────────────────────────────────────────────

  private async searchVersions(userId: string, q: string, limit: number): Promise<SearchItem[]> {
    const rows = await this.prisma.monitor.findMany({
      where: {
        userId,
        type: { in: VERSION_MONITOR_TYPES },
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { target: { contains: q, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        name: true,
        target: true,
        enabled: true,
        createdAt: true,
        runs: {
          orderBy: { checkedAt: 'desc' },
          take: 1,
          select: { level: true, checkedAt: true },
        },
      },
      orderBy: { name: 'asc' },
      take: limit,
    });

    return rows.map((v) => {
      const latestRun = v.runs[0];
      const status = latestRun?.level?.toUpperCase() ?? 'UNKNOWN';
      return {
        id: v.id,
        type: 'version' as const,
        title: v.name,
        subtitle: v.target,
        url: `/versions`,
        status: v.enabled ? status : 'PAUSED',
        statusColor: this.monitorStatusColor(v.enabled, status),
        updatedAt: (latestRun?.checkedAt ?? v.createdAt).toISOString(),
      };
    });
  }
}

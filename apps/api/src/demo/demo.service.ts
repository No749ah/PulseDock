import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { MonitorsService } from '../monitors/monitors.service';
import { StatusPagesService } from '../status-pages/status-pages.service';

export interface SeedResult {
  monitors: string[];
  alertChannelId: string | null;
  statusPageId: string | null;
  statusPageSlug: string | null;
  alreadySeeded: boolean;
}

/**
 * Provides one-click demo data seeding for new users.
 * Creates sample HTTP/version monitors, an alert channel, and a status page
 * so users can immediately explore the app with realistic data.
 */
@Injectable()
export class DemoService {
  private readonly logger = new Logger(DemoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly monitorsService: MonitorsService,
    private readonly statusPagesService: StatusPagesService,
  ) {}

  /**
   * Seeds a user's account with sample monitors, an alert channel, and a status page.
   * Idempotent: skips seeding if the user already has 3+ monitors (already used the app).
   *
   * @param userId - The authenticated user's ID
   * @returns Details of created resources, or `alreadySeeded: true` if skipped
   */
  async seed(userId: string): Promise<SeedResult> {
    const existingCount = await this.prisma.monitor.count({ where: { userId } });
    if (existingCount >= 3) {
      return { monitors: [], alertChannelId: null, statusPageId: null, statusPageSlug: null, alreadySeeded: true };
    }

    this.logger.log(`Seeding demo data for user ${userId}`);

    // 1. Create a webhook alert channel (no external credentials needed)
    const alertChannel = await this.prisma.alertChannel.create({
      data: {
        userId,
        name: '📣 Demo Webhook',
        type: 'webhook',
        configJson: {
          webhookUrl: 'https://webhook.site/demo-placeholder',
          secret: '',
        } as Prisma.InputJsonValue,
      },
    });

    // 2. Create sample monitors
    const monitorDefs = [
      {
        name: '🌐 GitHub Status',
        target: 'https://www.githubstatus.com/',
        type: 'HTTP' as const,
        intervalSec: 60,
        tags: ['demo', 'external'],
        config: { bodyContains: '' },
      },
      {
        name: '📦 Docker Hub',
        target: 'https://hub.docker.com/',
        type: 'HTTP' as const,
        intervalSec: 120,
        tags: ['demo', 'external'],
        config: {},
      },
      {
        name: '🔍 Cloudflare DNS',
        target: '1.1.1.1',
        type: 'DNS' as const,
        intervalSec: 60,
        tags: ['demo', 'infrastructure'],
        config: { recordType: 'A', expectedValue: '' },
      },
      {
        name: '⚡ PulseDock API',
        target: 'https://api.pulsedock.io/health',
        type: 'HTTP' as const,
        intervalSec: 60,
        tags: ['demo', 'api'],
        config: {},
      },
      {
        name: '🔒 Grafana (version)',
        target: 'https://grafana.com/api/grafana/versions/stable',
        type: 'GIT_RELEASE' as const,
        intervalSec: 3600,
        tags: ['demo', 'versions'],
        config: {
          appVersionStrategy: 'json-path',
          appVersionEndpoint: 'https://grafana.com/api/grafana/versions/stable',
          jsonPath: 'version',
        },
      },
    ];

    const createdMonitorIds: string[] = [];
    for (const def of monitorDefs) {
      try {
        const m = await this.monitorsService.create(userId, {
          ...def,
          alertChannelIds: [alertChannel.id],
          description: 'Demo monitor — feel free to edit or delete',
        });
        createdMonitorIds.push(m.id);
      } catch (err) {
        this.logger.warn(`Failed to create demo monitor "${def.name}": ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // 3. Create a sample status page with a basic layout
    let statusPageId: string | null = null;
    let statusPageSlug: string | null = null;

    try {
      const uptimeBarWidgets = createdMonitorIds.slice(0, 3).map((monitorId, i) => ({
        id: `demo-widget-${i + 1}`,
        type: 'uptime-bar',
        x: 0,
        y: i * 2,
        w: 12,
        h: 2,
        config: { monitorId, label: '', periodDays: 30, showPercentage: true },
        zOrder: i,
        locked: false,
        hidden: false,
      }));

      const headerWidget = {
        id: 'demo-header',
        type: 'overall-system-status',
        x: 0,
        y: 0,
        w: 12,
        h: 2,
        config: { monitorIds: createdMonitorIds, label: 'System Status' },
        zOrder: 0,
        locked: false,
        hidden: false,
      };

      const layout = {
        widgets: [
          headerWidget,
          ...uptimeBarWidgets.map((w) => ({ ...w, y: w.y + 2 })),
        ],
      };

      const page = await this.statusPagesService.create(userId, {
        title: '🚀 Demo Status Page',
        slug: `demo-${userId.slice(0, 8)}`,
        description: 'Sample status page — customize with your own monitors and widgets',
        layout: layout as unknown as Parameters<typeof this.statusPagesService.create>[1]['layout'],
      });

      statusPageId = page.id;
      statusPageSlug = page.slug;
    } catch (err) {
      this.logger.warn(`Failed to create demo status page: ${err instanceof Error ? err.message : String(err)}`);
    }

    this.logger.log(`Demo seed complete for user ${userId}: ${createdMonitorIds.length} monitors, 1 alert channel, status page: ${statusPageSlug ?? 'none'}`);

    return {
      monitors: createdMonitorIds,
      alertChannelId: alertChannel.id,
      statusPageId,
      statusPageSlug,
      alreadySeeded: false,
    };
  }
}

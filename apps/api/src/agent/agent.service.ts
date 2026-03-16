import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { Prisma } from '@prisma/client';
import type { AgentReportBody, AgentReportResponse, AgentStatusItem } from './agent.dto';

@Injectable()
export class AgentService {
  constructor(private readonly prisma: PrismaService) {}

  async report(userId: string, body: AgentReportBody): Promise<AgentReportResponse> {
    const { toolId, version, monitorId, hostname } = body;

    if (!toolId || typeof toolId !== 'string') {
      throw new BadRequestException('toolId is required');
    }
    if (!version || typeof version !== 'string') {
      throw new BadRequestException('version is required');
    }

    const cleanVersion = version.trim().replace(/^v(?=\d)/i, '');
    if (!cleanVersion || cleanVersion.length > 128) {
      throw new BadRequestException('Invalid version string');
    }

    // Find the monitor to update
    let monitor;
    if (monitorId) {
      monitor = await this.prisma.monitor.findFirst({
        where: { id: monitorId, userId },
      });
      if (!monitor) {
        throw new NotFoundException(`Monitor ${monitorId} not found`);
      }
    } else {
      // Try to find a monitor matching this toolId by checking configJson
      const monitors = await this.prisma.monitor.findMany({
        where: { userId },
      });
      monitor = monitors.find((m) => {
        const config = (m.configJson as Record<string, unknown>) ?? {};
        return config.toolId === toolId || config.agentToolId === toolId;
      });

      if (!monitor) {
        throw new NotFoundException(
          `No monitor found for toolId "${toolId}". Create a version check first, or pass monitorId explicitly.`,
        );
      }
    }

    // Update monitor configJson with the reported version
    const currentConfig = (monitor.configJson as Record<string, unknown>) ?? {};
    const updatedConfig: Record<string, unknown> = {
      ...currentConfig,
      currentVersion: cleanVersion,
      currentTag: cleanVersion,
      agentToolId: toolId,
      agentHostname: hostname ?? currentConfig.agentHostname ?? null,
      agentLastReport: new Date().toISOString(),
    };

    await this.prisma.monitor.update({
      where: { id: monitor.id },
      data: { configJson: updatedConfig as Prisma.InputJsonValue },
    });

    // Create a MonitorRun record
    await this.prisma.monitorRun.create({
      data: {
        monitorId: monitor.id,
        userId,
        level: 'green',
        ok: true,
        status: 200,
        latencyMs: 0,
        message: `Agent reported version ${cleanVersion}${hostname ? ` from ${hostname}` : ''}`,
      },
    });

    return { ok: true, monitorId: monitor.id, version: cleanVersion };
  }

  async status(userId: string): Promise<AgentStatusItem[]> {
    // Find all monitors that have agent data
    const monitors = await this.prisma.monitor.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    const agentMonitors = monitors.filter((m) => {
      const config = (m.configJson as Record<string, unknown>) ?? {};
      return typeof config.agentToolId === 'string' || typeof config.agentLastReport === 'string';
    });

    return agentMonitors.map((m) => {
      const config = (m.configJson as Record<string, unknown>) ?? {};
      return {
        monitorId: m.id,
        monitorName: m.name,
        toolId: String(config.agentToolId ?? config.toolId ?? ''),
        version: String(config.currentVersion ?? ''),
        hostname: typeof config.agentHostname === 'string' ? config.agentHostname : null,
        reportedAt: typeof config.agentLastReport === 'string' ? config.agentLastReport : '',
      };
    });
  }
}

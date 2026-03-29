import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { SetDependenciesDto } from './dependencies.dto';

export interface DependencyNode {
  id: string;
  name: string;
  level: string | null;
  type: string;
  dependencies: string[];
  dependents: string[];
  cascadeAffected?: boolean;
}

@Injectable()
export class DependenciesService {
  constructor(private readonly prisma: PrismaService) {}

  async getDependencyGraph(userId: string): Promise<{ nodes: DependencyNode[]; edges: Array<{ from: string; to: string }> }> {
    const deps = await this.prisma.monitorDependency.findMany({
      where: { userId },
      include: {
        monitor: { select: { id: true, name: true, type: true } },
        dependsOn: { select: { id: true, name: true, type: true } },
      },
    });

    // Get all monitors involved
    const monitorIds = new Set<string>();
    deps.forEach((d) => { monitorIds.add(d.monitorId); monitorIds.add(d.dependsOnId); });

    const monitors = await this.prisma.monitor.findMany({
      where: { id: { in: Array.from(monitorIds) }, userId },
      select: {
        id: true, name: true, type: true,
        runs: { take: 1, orderBy: { checkedAt: 'desc' }, select: { level: true } },
      },
    });

    const monitorMap = new Map(monitors.map((m) => [m.id, m]));

    const nodeMap = new Map<string, DependencyNode>();
    deps.forEach((d) => {
      if (!nodeMap.has(d.monitorId)) {
        const m = monitorMap.get(d.monitorId);
        nodeMap.set(d.monitorId, { id: d.monitorId, name: d.monitor.name, level: m?.runs[0]?.level ?? null, type: d.monitor.type, dependencies: [], dependents: [] });
      }
      if (!nodeMap.has(d.dependsOnId)) {
        const m = monitorMap.get(d.dependsOnId);
        nodeMap.set(d.dependsOnId, { id: d.dependsOnId, name: d.dependsOn.name, level: m?.runs[0]?.level ?? null, type: d.dependsOn.type, dependencies: [], dependents: [] });
      }
      nodeMap.get(d.monitorId)!.dependencies.push(d.dependsOnId);
      nodeMap.get(d.dependsOnId)!.dependents.push(d.monitorId);
    });

    const edges = deps.map((d) => ({ from: d.dependsOnId, to: d.monitorId }));
    return { nodes: Array.from(nodeMap.values()), edges };
  }

  async getImpactAnalysis(userId: string, monitorId: string): Promise<{
    monitor: { id: string; name: string; level: string | null };
    affectedDownstream: Array<{ id: string; name: string; level: string | null; depth: number }>;
    rootCauses: Array<{ id: string; name: string; level: string | null }>;
  }> {
    const monitor = await this.prisma.monitor.findFirst({
      where: { id: monitorId, userId },
      select: { id: true, name: true, runs: { take: 1, orderBy: { checkedAt: 'desc' }, select: { level: true } } },
    });
    if (!monitor) throw new NotFoundException('Monitor not found');

    // Find all downstream monitors (BFS)
    const allDeps = await this.prisma.monitorDependency.findMany({
      where: { userId },
      select: { monitorId: true, dependsOnId: true },
    });

    const downstream = this.findDownstream(monitorId, allDeps);
    const upstream = this.findUpstream(monitorId, allDeps);

    // Get levels
    const allIds = [...downstream.map((d) => d.id), ...upstream];
    const statuses = allIds.length > 0 ? await this.prisma.monitor.findMany({
      where: { id: { in: allIds }, userId },
      select: { id: true, name: true, runs: { take: 1, orderBy: { checkedAt: 'desc' }, select: { level: true } } },
    }) : [];
    const statusMap = new Map(statuses.map((m) => [m.id, { name: m.name, level: m.runs[0]?.level ?? null }]));

    const rootCauses: Array<{ id: string; name: string; level: string | null }> = [];
    for (const id of upstream) {
      const m = statusMap.get(id);
      if (m && m.level !== 'green') {
        rootCauses.push({ id, name: m.name, level: m.level });
      }
    }

    return {
      monitor: { id: monitor.id, name: monitor.name, level: monitor.runs[0]?.level ?? null },
      affectedDownstream: downstream.map((d) => {
        const s = statusMap.get(d.id);
        return { id: d.id, name: s?.name ?? d.id, level: s?.level ?? null, depth: d.depth };
      }),
      rootCauses,
    };
  }

  async setDependencies(userId: string, monitorId: string, dto: SetDependenciesDto): Promise<void> {
    const monitor = await this.prisma.monitor.findFirst({ where: { id: monitorId, userId } });
    if (!monitor) throw new NotFoundException('Monitor not found');

    // Validate no circular dependencies
    if (dto.dependsOnIds.includes(monitorId)) {
      throw new BadRequestException('A monitor cannot depend on itself');
    }

    // Check all dependsOn monitors exist and belong to user
    if (dto.dependsOnIds.length > 0) {
      const found = await this.prisma.monitor.findMany({
        where: { id: { in: dto.dependsOnIds }, userId },
        select: { id: true },
      });
      if (found.length !== dto.dependsOnIds.length) {
        throw new NotFoundException('One or more dependency monitors not found');
      }
    }

    // Replace all dependencies for this monitor
    await this.prisma.$transaction([
      this.prisma.monitorDependency.deleteMany({ where: { monitorId, userId } }),
      ...dto.dependsOnIds.map((dependsOnId) =>
        this.prisma.monitorDependency.create({ data: { userId, monitorId, dependsOnId } }),
      ),
    ]);
  }

  async removeDependency(userId: string, monitorId: string, dependsOnId: string): Promise<void> {
    const existing = await this.prisma.monitorDependency.findFirst({
      where: { monitorId, dependsOnId, userId },
    });
    if (!existing) throw new NotFoundException('Dependency not found');
    await this.prisma.monitorDependency.delete({ where: { id: existing.id } });
  }

  async getDependenciesForMonitor(userId: string, monitorId: string) {
    const monitor = await this.prisma.monitor.findFirst({ where: { id: monitorId, userId } });
    if (!monitor) throw new NotFoundException('Monitor not found');

    return this.prisma.monitorDependency.findMany({
      where: { monitorId, userId },
      include: {
        dependsOn: {
          select: { id: true, name: true, type: true, runs: { take: 1, orderBy: { checkedAt: 'desc' }, select: { status: true } } },
        },
      },
    });
  }

  /** BFS to find all downstream monitors (monitors that depend on this one, transitively) */
  findDownstream(
    rootId: string,
    edges: Array<{ monitorId: string; dependsOnId: string }>,
  ): Array<{ id: string; depth: number }> {
    const result: Array<{ id: string; depth: number }> = [];
    const visited = new Set<string>();
    const queue: Array<{ id: string; depth: number }> = [{ id: rootId, depth: 0 }];

    while (queue.length > 0) {
      const { id, depth } = queue.shift()!;
      const children = edges.filter((e) => e.dependsOnId === id).map((e) => e.monitorId);
      for (const childId of children) {
        if (!visited.has(childId)) {
          visited.add(childId);
          result.push({ id: childId, depth: depth + 1 });
          queue.push({ id: childId, depth: depth + 1 });
        }
      }
    }
    return result;
  }

  /** Find all upstream monitors (what this monitor depends on, transitively) */
  findUpstream(
    rootId: string,
    edges: Array<{ monitorId: string; dependsOnId: string }>,
  ): string[] {
    const result: string[] = [];
    const visited = new Set<string>();
    const queue = [rootId];

    while (queue.length > 0) {
      const id = queue.shift()!;
      const parents = edges.filter((e) => e.monitorId === id).map((e) => e.dependsOnId);
      for (const parentId of parents) {
        if (!visited.has(parentId)) {
          visited.add(parentId);
          result.push(parentId);
          queue.push(parentId);
        }
      }
    }
    return result;
  }
}

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class MonitorsDiagnosticsService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  // ─── Monitor Health Score ──────────────────────────────────────────────────

  /**
   * Computes a composite health score (0–100) for a monitor.
   *
   * Formula breakdown (100 pts total):
   *   - Uptime       40 pts  — 7-day uptime % (linear from 90%→100%)
   *   - Latency      20 pts  — P95 latency trend: current 7d vs prior 7d
   *   - SLA          20 pts  — Error budget consumption against slaTarget
   *   - Streak       20 pts  — Days since last downtime event
   *
   * Grade thresholds: A 85–100, B 70–84, C 50–69, D 25–49, F 0–24
   *
   * @param userId    - The authenticated user's ID
   * @param monitorId - The monitor to score
   * @returns { score, grade, breakdown }
   * @throws NotFoundException if monitor not found or not owned by user
   */
  async getHealthScore(
    userId: string,
    monitorId: string,
  ): Promise<{
    score: number;
    grade: string;
    breakdown: {
      uptime: number;
      latency: number;
      sla: number;
      streak: number;
    };
  }> {
    const monitor = await this.prisma.monitor.findFirst({
      where: { id: monitorId, userId },
      select: {
        id: true,
        type: true,
        slaTarget: true,
        slaPeriodDays: true,
        slaBreachAlertedAt: true,
      },
    });
    if (!monitor) throw new NotFoundException('monitor not found');

    const now = new Date();
    const window7d = 7 * 86_400_000;
    const since14d = new Date(now.getTime() - 2 * window7d);

    // Fetch 14d of run data (ok + latencyMs + checkedAt)
    const allRuns = await this.prisma.monitorRun.findMany({
      where: { monitorId, userId, checkedAt: { gte: since14d } },
      orderBy: { checkedAt: 'asc' },
      select: { ok: true, latencyMs: true, checkedAt: true },
    });

    const boundary7d = new Date(now.getTime() - window7d);
    const recentRuns = allRuns.filter((r) => r.checkedAt >= boundary7d);
    const priorRuns = allRuns.filter((r) => r.checkedAt < boundary7d);

    // ── 1. Uptime score (40 pts) ─────────────────────────────────────────────
    // Linear mapping: 90% → 0 pts, 100% → 40 pts
    let uptimeScore = 40;
    if (recentRuns.length > 0) {
      const uptimePct =
        (recentRuns.filter((r) => r.ok).length / recentRuns.length) * 100;
      // Below 90% = 0, 90–100% = linear scale
      const clamped = Math.max(0, uptimePct - 90);
      uptimeScore = Math.round((clamped / 10) * 40);
    }

    // ── 2. Latency trend score (20 pts) ──────────────────────────────────────
    // Version monitors (GIT_RELEASE, DOCKER_IMAGE) have no latency → full pts
    const isVersionMonitor =
      monitor.type === 'GIT_RELEASE' || monitor.type === 'DOCKER_IMAGE';

    let latencyScore = 20;
    if (!isVersionMonitor) {
      const p95 = (runs: Array<{ latencyMs: number | null }>): number | null => {
        const values = runs
          .map((r) => r.latencyMs)
          .filter((v): v is number => v !== null)
          .sort((a, b) => a - b);
        if (values.length === 0) return null;
        const idx = Math.ceil(values.length * 0.95) - 1;
        return values[Math.max(0, idx)];
      };

      const recentP95 = p95(recentRuns);
      const priorP95 = p95(priorRuns);

      if (recentP95 !== null && priorP95 !== null && priorP95 > 0) {
        const changePct = ((recentP95 - priorP95) / priorP95) * 100;
        if (changePct > 50) {
          latencyScore = 0; // major degradation
        } else if (changePct > 10) {
          latencyScore = 10; // slight degradation
        } else {
          latencyScore = 20; // stable / improving
        }
      } else if (recentP95 === null) {
        latencyScore = 20; // no data → full pts
      }
    }

    // ── 3. SLA compliance score (20 pts) ─────────────────────────────────────
    // If no slaTarget configured → full pts
    let slaScore = 20;
    if (monitor.slaTarget !== null && monitor.slaTarget !== undefined) {
      const slaTarget = monitor.slaTarget;
      const allowedDownPct = (100 - slaTarget) / 100;
      const totalChecks = recentRuns.length;
      const failedChecks = recentRuns.filter((r) => !r.ok).length;
      const actualDownPct =
        totalChecks === 0 ? 0 : failedChecks / totalChecks;

      if (allowedDownPct <= 0) {
        // Target is 100% uptime
        slaScore = failedChecks === 0 ? 20 : 0;
      } else {
        const budgetConsumedPct = (actualDownPct / allowedDownPct) * 100;
        if (budgetConsumedPct >= 100) {
          slaScore = 0; // breached
        } else if (budgetConsumedPct >= 50) {
          slaScore = 10; // 50% consumed
        } else {
          slaScore = 20; // within budget
        }
      }
    }

    // ── 4. Incident-free streak score (20 pts) ────────────────────────────────
    // Find last downtime event (ok=false) in the 14d window; check current status
    let streakScore = 20;
    const lastFailRun = [...allRuns]
      .reverse()
      .find((r) => !r.ok);

    const lastRun = allRuns[allRuns.length - 1] ?? null;
    const isCurrentlyDown = lastRun !== null && !lastRun.ok;

    if (isCurrentlyDown) {
      streakScore = 0;
    } else if (lastFailRun) {
      const daysSinceFail =
        (now.getTime() - lastFailRun.checkedAt.getTime()) / 86_400_000;
      if (daysSinceFail >= 7) {
        streakScore = 20;
      } else if (daysSinceFail >= 3) {
        streakScore = 10;
      } else {
        streakScore = 5;
      }
    }
    // else: no failures found → 20 pts (already set)

    // ── Final score + grade ───────────────────────────────────────────────────
    const score = uptimeScore + latencyScore + slaScore + streakScore;

    let grade: string;
    if (score >= 85) grade = 'A';
    else if (score >= 70) grade = 'B';
    else if (score >= 50) grade = 'C';
    else if (score >= 25) grade = 'D';
    else grade = 'F';

    return {
      score,
      grade,
      breakdown: {
        uptime: uptimeScore,
        latency: latencyScore,
        sla: slaScore,
        streak: streakScore,
      },
    };
  }

  /**
   * Returns health scores for all monitors belonging to the user,
   * plus an aggregate summary (average, count per grade).
   *
   * @param userId - The authenticated user's ID
   * @returns { scores: [...], overall: { avg, a, b, c, d, f } }
   */
  async getHealthSummary(userId: string): Promise<{
    scores: Array<{ monitorId: string; name: string; score: number; grade: string }>;
    overall: { avg: number; a: number; b: number; c: number; d: number; f: number };
  }> {
    const now = new Date();
    const window7d = 7 * 86_400_000;
    const since14d = new Date(now.getTime() - 2 * window7d);
    const boundary7d = new Date(now.getTime() - window7d);

    // Batch: fetch all monitors with SLA config in a single query
    const monitors = await this.prisma.monitor.findMany({
      where: { userId },
      select: { id: true, name: true, type: true, slaTarget: true },
    });

    if (monitors.length === 0) {
      return { scores: [], overall: { avg: 0, a: 0, b: 0, c: 0, d: 0, f: 0 } };
    }

    const monitorIds = monitors.map((m) => m.id);

    // Batch: fetch ALL runs for ALL monitors in a single query (14d window)
    const allRuns = await this.prisma.monitorRun.findMany({
      where: { monitorId: { in: monitorIds }, userId, checkedAt: { gte: since14d } },
      orderBy: { checkedAt: 'asc' },
      select: { monitorId: true, ok: true, latencyMs: true, checkedAt: true },
    });

    // Group runs by monitorId
    const runsByMonitor = new Map<string, typeof allRuns>();
    for (const run of allRuns) {
      const arr = runsByMonitor.get(run.monitorId);
      if (arr) arr.push(run);
      else runsByMonitor.set(run.monitorId, [run]);
    }

    // Compute health score for each monitor using pre-fetched data
    const scores = monitors.map((m) => {
      const runs = runsByMonitor.get(m.id) ?? [];
      const recentRuns = runs.filter((r) => r.checkedAt >= boundary7d);
      const priorRuns = runs.filter((r) => r.checkedAt < boundary7d);

      // 1. Uptime score (40 pts)
      let uptimeScore = 40;
      if (recentRuns.length > 0) {
        const uptimePct = (recentRuns.filter((r) => r.ok).length / recentRuns.length) * 100;
        const clamped = Math.max(0, uptimePct - 90);
        uptimeScore = Math.round((clamped / 10) * 40);
      }

      // 2. Latency trend score (20 pts)
      const isVersionMonitor = m.type === 'GIT_RELEASE' || m.type === 'DOCKER_IMAGE';
      let latencyScore = 20;
      if (!isVersionMonitor) {
        const p95 = (r: Array<{ latencyMs: number | null }>): number | null => {
          const values = r.map((x) => x.latencyMs).filter((v): v is number => v !== null).sort((a, b) => a - b);
          if (values.length === 0) return null;
          return values[Math.max(0, Math.ceil(values.length * 0.95) - 1)];
        };
        const recentP95 = p95(recentRuns);
        const priorP95 = p95(priorRuns);
        if (recentP95 !== null && priorP95 !== null && priorP95 > 0) {
          const changePct = ((recentP95 - priorP95) / priorP95) * 100;
          if (changePct > 50) latencyScore = 0;
          else if (changePct > 10) latencyScore = 10;
        } else if (recentP95 === null) {
          latencyScore = 20;
        }
      }

      // 3. SLA compliance score (20 pts)
      let slaScore = 20;
      if (m.slaTarget !== null && m.slaTarget !== undefined) {
        const allowedDownPct = (100 - Number(m.slaTarget)) / 100;
        const failedChecks = recentRuns.filter((r) => !r.ok).length;
        if (allowedDownPct <= 0) {
          slaScore = failedChecks === 0 ? 20 : 0;
        } else {
          const actualDownPct = recentRuns.length === 0 ? 0 : failedChecks / recentRuns.length;
          const budgetConsumedPct = (actualDownPct / allowedDownPct) * 100;
          if (budgetConsumedPct >= 100) slaScore = 0;
          else if (budgetConsumedPct >= 50) slaScore = 10;
        }
      }

      // 4. Incident-free streak score (20 pts)
      let streakScore = 20;
      const lastFailRun = [...runs].reverse().find((r) => !r.ok);
      const lastRun = runs[runs.length - 1] ?? null;
      if (lastRun !== null && !lastRun.ok) {
        streakScore = 0;
      } else if (lastFailRun) {
        const daysSinceFail = (now.getTime() - lastFailRun.checkedAt.getTime()) / 86_400_000;
        if (daysSinceFail >= 7) streakScore = 20;
        else if (daysSinceFail >= 3) streakScore = 10;
        else streakScore = 5;
      }

      const score = uptimeScore + latencyScore + slaScore + streakScore;
      let grade: string;
      if (score >= 85) grade = 'A';
      else if (score >= 70) grade = 'B';
      else if (score >= 50) grade = 'C';
      else if (score >= 25) grade = 'D';
      else grade = 'F';

      return { monitorId: m.id, name: m.name, score, grade };
    });

    const gradeCount = { a: 0, b: 0, c: 0, d: 0, f: 0 };
    for (const s of scores) {
      const g = s.grade.toLowerCase() as keyof typeof gradeCount;
      gradeCount[g] = (gradeCount[g] ?? 0) + 1;
    }

    const avg =
      scores.length === 0
        ? 0
        : Math.round((scores.reduce((sum, s) => sum + s.score, 0) / scores.length) * 10) / 10;

    return { scores, overall: { avg, ...gradeCount } };
  }

  // ─── Monitor Health Score (v2: uptime/latency/incidents/flapping) ─────────

  /**
   * Computes a 0–100 health score for a single monitor.
   * Components:
   *   - Uptime (50 pts): based on last 24h uptime %
   *   - Latency (30 pts): p95 latency vs 7d baseline
   *   - Incidents (20 pts): deducted per active incident
   *   - Flapping penalty (-15): if monitor.isFlapping
   *
   * Returns null score when no runs in last 24h.
   */
  async healthScore(
    userId: string,
    monitorId: string,
  ): Promise<{
    score: number | null;
    breakdown: { uptime: number; latency: number; incidents: number; flapping: number; total: number } | null;
  }> {
    const monitor = await this.prisma.monitor.findFirst({ where: { id: monitorId, userId } });
    if (!monitor) throw new NotFoundException('Monitor not found');

    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const runs24h = await this.prisma.monitorRun.findMany({
      where: { monitorId, checkedAt: { gte: since24h } },
      select: { ok: true, latencyMs: true },
      orderBy: { checkedAt: 'desc' },
    });

    if (runs24h.length === 0) return { score: null, breakdown: null };

    // Uptime component (50 pts max)
    const okCount = runs24h.filter(r => r.ok).length;
    const uptimePct = (okCount / runs24h.length) * 100;
    const uptimeScore = Math.round((uptimePct / 100) * 50);

    // Latency component (30 pts max)
    const runs7d = await this.prisma.monitorRun.findMany({
      where: { monitorId, checkedAt: { gte: since7d }, latencyMs: { not: null } },
      select: { latencyMs: true },
      orderBy: { checkedAt: 'desc' },
      take: 500,
    });

    let latencyScore = 30;
    if (runs7d.length >= 10) {
      const latencies = runs7d.map(r => r.latencyMs!).sort((a, b) => a - b);
      const p95Idx = Math.floor(latencies.length * 0.95);
      const baselineP95 = latencies[p95Idx] ?? latencies[latencies.length - 1];

      const recent = runs24h.filter(r => r.latencyMs != null).map(r => r.latencyMs!).sort((a, b) => a - b);
      if (recent.length > 0) {
        const recentP95Idx = Math.floor(recent.length * 0.95);
        const recentP95 = recent[recentP95Idx] ?? recent[recent.length - 1];
        if (baselineP95 > 0) {
          const penalty = Math.floor(((recentP95 - baselineP95) / baselineP95) * 30);
          latencyScore = Math.max(0, 30 - Math.max(0, penalty));
        }
      }
    }

    // Incident component (20 pts max)
    const activeIncidents = await this.prisma.incident.count({
      where: {
        userId,
        status: { not: 'RESOLVED' },
        monitors: { some: { monitorId } },
      },
    });
    const incidentScore = Math.max(0, 20 - activeIncidents * 10);

    // Flapping penalty (-15 if flapping)
    const flappingPenalty = monitor.isFlapping ? 15 : 0;

    const total = Math.max(0, Math.min(100, uptimeScore + latencyScore + incidentScore - flappingPenalty));

    return {
      score: total,
      breakdown: { uptime: uptimeScore, latency: latencyScore, incidents: incidentScore, flapping: flappingPenalty === 0 ? 0 : -flappingPenalty, total },
    };
  }

  /**
   * Batch health scores for all monitors belonging to a user.
   * Skips the per-monitor latency computation for performance — gives full 30 pts.
   */
  async allHealthScores(userId: string): Promise<{ monitorId: string; score: number | null }[]> {
    const monitors = await this.prisma.monitor.findMany({
      where: { userId },
      select: { id: true, isFlapping: true },
    });

    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const runStats = await this.prisma.monitorRun.groupBy({
      by: ['monitorId'],
      where: { userId, checkedAt: { gte: since24h } },
      _count: { _all: true },
    });

    const okStats = await this.prisma.monitorRun.groupBy({
      by: ['monitorId'],
      where: { userId, checkedAt: { gte: since24h }, ok: true },
      _count: { _all: true },
    });

    const activeIncidentsByMonitor = await this.prisma.incidentMonitor.groupBy({
      by: ['monitorId'],
      where: {
        incident: { userId, status: { not: 'RESOLVED' } },
      },
      _count: { _all: true },
    });

    return monitors.map(m => {
      const total = runStats.find(r => r.monitorId === m.id)?._count._all ?? 0;
      if (total === 0) return { monitorId: m.id, score: null };

      const ok = okStats.find(r => r.monitorId === m.id)?._count._all ?? 0;
      const uptimeScore = Math.round((ok / total) * 50);
      const incidentCount = activeIncidentsByMonitor.find(r => r.monitorId === m.id)?._count._all ?? 0;
      const incidentScore = Math.max(0, 20 - incidentCount * 10);
      const flappingPenalty = m.isFlapping ? 15 : 0;
      // Latency: skip in batch for performance, give full 30 pts
      const score = Math.max(0, Math.min(100, uptimeScore + 30 + incidentScore - flappingPenalty));
      return { monitorId: m.id, score };
    });
  }

  // ─── Health Score Leaderboard ────────────────────────────────────────────

  /**
   * Returns enriched health score data for all monitors, suitable for a
   * leaderboard / comparison page. Includes name, type, score, grade, uptime%,
   * active incidents, and improvement hints.
   */
  async healthScoreLeaderboard(userId: string): Promise<{
    items: Array<{
      monitorId: string;
      monitorName: string;
      monitorType: string;
      score: number | null;
      grade: 'A' | 'B' | 'C' | 'D' | 'F' | null;
      uptimePct24h: number | null;
      totalChecks24h: number;
      activeIncidents: number;
      isFlapping: boolean;
      slaTarget: number | null;
      slaCompliant: boolean | null;
      hints: string[];
    }>;
    summary: {
      totalMonitors: number;
      noDataCount: number;
      gradeDistribution: Record<'A' | 'B' | 'C' | 'D' | 'F', number>;
      avgScore: number | null;
    };
  }> {
    const monitors = await this.prisma.monitor.findMany({
      where: { userId },
      select: { id: true, name: true, type: true, isFlapping: true, slaTarget: true },
    });

    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const runStats = await this.prisma.monitorRun.groupBy({
      by: ['monitorId'],
      where: { userId, checkedAt: { gte: since24h } },
      _count: { _all: true },
    });

    const okStats = await this.prisma.monitorRun.groupBy({
      by: ['monitorId'],
      where: { userId, checkedAt: { gte: since24h }, ok: true },
      _count: { _all: true },
    });

    const activeIncidentsByMonitor = await this.prisma.incidentMonitor.groupBy({
      by: ['monitorId'],
      where: { incident: { userId, status: { not: 'RESOLVED' } } },
      _count: { _all: true },
    });

    const gradeDistribution: Record<'A' | 'B' | 'C' | 'D' | 'F', number> = { A: 0, B: 0, C: 0, D: 0, F: 0 };
    let scoredCount = 0;
    let scoreSum = 0;

    const items = monitors.map((m) => {
      const total = runStats.find((r) => r.monitorId === m.id)?._count._all ?? 0;
      if (total === 0) {
        return {
          monitorId: m.id,
          monitorName: m.name,
          monitorType: m.type,
          score: null,
          grade: null as null,
          uptimePct24h: null,
          totalChecks24h: 0,
          activeIncidents: 0,
          isFlapping: m.isFlapping ?? false,
          slaTarget: m.slaTarget !== null ? Number(m.slaTarget) : null,
          slaCompliant: null as null,
          hints: ['No check data in the last 24h — verify the monitor is enabled and the target is reachable'],
        };
      }

      const ok = okStats.find((r) => r.monitorId === m.id)?._count._all ?? 0;
      const uptimePct = parseFloat(((ok / total) * 100).toFixed(2));
      const incidentCount = activeIncidentsByMonitor.find((r) => r.monitorId === m.id)?._count._all ?? 0;
      const uptimeScore = Math.round((ok / total) * 50);
      const incidentScore = Math.max(0, 20 - incidentCount * 10);
      const flappingPenalty = m.isFlapping ? 15 : 0;
      const score = Math.max(0, Math.min(100, uptimeScore + 30 + incidentScore - flappingPenalty));
      const grade: 'A' | 'B' | 'C' | 'D' | 'F' =
        score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : score >= 40 ? 'D' : 'F';

      gradeDistribution[grade] += 1;
      scoredCount += 1;
      scoreSum += score;

      const slaTarget = m.slaTarget !== null ? Number(m.slaTarget) : null;
      const slaCompliant = slaTarget !== null ? uptimePct >= slaTarget : null;

      const hints: string[] = [];
      if (uptimePct < 99) hints.push(`Uptime is ${uptimePct.toFixed(2)}% — review recent failures and check for infrastructure issues`);
      if (incidentCount > 0) hints.push(`${incidentCount} active incident(s) — resolve to improve score`);
      if (m.isFlapping) hints.push('Monitor is flapping — consider raising confirmations or adding retries to reduce noise');
      if (slaCompliant === false) hints.push(`SLA breached (${uptimePct.toFixed(2)}% < target ${slaTarget}%) — investigate root cause`);
      if (hints.length === 0 && score < 100) hints.push('Score is healthy — keep monitoring for regressions');
      if (hints.length === 0) hints.push('Excellent — this monitor is performing optimally');

      return {
        monitorId: m.id,
        monitorName: m.name,
        monitorType: m.type,
        score,
        grade,
        uptimePct24h: uptimePct,
        totalChecks24h: total,
        activeIncidents: incidentCount,
        isFlapping: m.isFlapping ?? false,
        slaTarget,
        slaCompliant,
        hints,
      };
    });

    // Sort: no-data last, then by score desc
    items.sort((a, b) => {
      if (a.score === null && b.score === null) return 0;
      if (a.score === null) return 1;
      if (b.score === null) return -1;
      return b.score - a.score;
    });

    return {
      items,
      summary: {
        totalMonitors: monitors.length,
        noDataCount: monitors.length - scoredCount,
        gradeDistribution,
        avgScore: scoredCount > 0 ? parseFloat((scoreSum / scoredCount).toFixed(1)) : null,
      },
    };
  }

  // ─── Check Schedule Overview ──────────────────────────────────────────────

  /**
   * Returns a fleet-level check scheduling overview.
   * Computes:
   *  - Per-monitor: intervalSec, cronExpression, checksPerHour, nextCheckEstimate, lastChecked
   *  - hourlyLoad: 24-bucket array (hour 0–23 UTC) of estimated checks that will fire each hour
   *  - summary: total enabled monitors, total checksPerHour across fleet, peak hour, quietest hour
   *
   * The hourly load is computed by distributing each monitor's checks evenly across the 24-hour
   * period. For cron-expression monitors, an hourly count is estimated using cron-parser.
   *
   * @param userId - Authenticated user
   */
  async checkSchedule(userId: string): Promise<{
    generatedAt: string;
    summary: {
      totalMonitors: number;
      enabledMonitors: number;
      fleetChecksPerHour: number;
      fleetChecksPerDay: number;
      peakHour: number;
      peakHourLoad: number;
      quietHour: number;
      quietHourLoad: number;
      avgChecksPerHour: number;
    };
    hourlyLoad: Array<{ hour: number; label: string; estimatedChecks: number }>;
    monitors: Array<{
      id: string;
      name: string;
      type: string;
      enabled: boolean;
      intervalSec: number;
      cronExpression: string | null;
      checksPerHour: number;
      lastCheckedAt: string | null;
      nextCheckEstimateSec: number | null;
    }>;
  }> {
    const now = new Date();

    const monitors = await this.prisma.monitor.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        type: true,
        enabled: true,
        intervalSec: true,
        cronExpression: true,
      },
    });

    // Fetch latest run per monitor in one batch
    const monitorIds = monitors.map((m) => m.id);
    const latestRuns = monitorIds.length > 0
      ? await this.prisma.monitorRun.findMany({
          where: {
            monitorId: { in: monitorIds },
            checkedAt: {
              gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000), // last 7 days
            },
          },
          orderBy: { checkedAt: 'desc' },
          select: { monitorId: true, checkedAt: true },
          distinct: ['monitorId'],
        })
      : [];

    const latestRunMap = new Map<string, Date>(
      latestRuns.map((r) => [r.monitorId, r.checkedAt]),
    );

    // Compute checks per hour for each monitor
    const monitorData = monitors.map((m) => {
      // Estimate checks per hour
      let checksPerHour: number;
      if (m.cronExpression) {
        // Simple heuristic: count how many times the cron fires in a 24-hour window → divide by 24
        // We use a limited analysis: if expression has specific hours, count them; otherwise estimate
        try {
          // Parse cron fields: [minute] [hour] [dom] [month] [dow]
          const parts = m.cronExpression.trim().split(/\s+/);
          if (parts.length === 5) {
            const [minField, hourField] = parts;

            // Step 1: how many times does this fire per day?
            let firesPerDay: number;
            if (hourField === '*') {
              // Fires every active hour; check minute field to determine how many times per hour
              let timesPerHour: number;
              if (minField === '*') {
                timesPerHour = 60; // every minute
              } else if (minField.startsWith('*/')) {
                const step = parseInt(minField.slice(2), 10) || 1;
                timesPerHour = Math.floor(60 / step);
              } else {
                // Specific minutes → one per listed minute
                timesPerHour = minField.split(',').filter(Boolean).length;
              }
              firesPerDay = timesPerHour * 24;
            } else if (hourField.startsWith('*/')) {
              const step = parseInt(hourField.slice(2), 10) || 1;
              const activeHours = Math.ceil(24 / step);
              // Minute field fires once per active hour (assuming specific or single minute)
              const timesPerActiveHour = minField === '*' ? 60 : (minField.startsWith('*/') ? Math.floor(60 / (parseInt(minField.slice(2), 10) || 1)) : 1);
              firesPerDay = activeHours * timesPerActiveHour;
            } else {
              // Specific hours list
              const activeHours = hourField.split(',').filter(Boolean).length;
              const timesPerActiveHour = minField === '*' ? 60 : (minField.startsWith('*/') ? Math.floor(60 / (parseInt(minField.slice(2), 10) || 1)) : 1);
              firesPerDay = activeHours * timesPerActiveHour;
            }

            checksPerHour = firesPerDay / 24;
          } else {
            checksPerHour = 3600 / m.intervalSec;
          }
        } catch {
          checksPerHour = 3600 / m.intervalSec;
        }
      } else {
        checksPerHour = 3600 / Math.max(1, m.intervalSec);
      }

      // Estimate seconds until next check
      const lastCheckedAt = latestRunMap.get(m.id) ?? null;
      let nextCheckEstimateSec: number | null = null;
      if (m.enabled && lastCheckedAt) {
        const elapsed = (now.getTime() - lastCheckedAt.getTime()) / 1000;
        const remaining = Math.max(0, m.intervalSec - elapsed);
        nextCheckEstimateSec = Math.round(remaining);
      } else if (m.enabled && !lastCheckedAt) {
        nextCheckEstimateSec = 0; // never run → due immediately
      }

      return {
        id: m.id,
        name: m.name,
        type: m.type,
        enabled: m.enabled,
        intervalSec: m.intervalSec,
        cronExpression: m.cronExpression ?? null,
        checksPerHour: Math.round(checksPerHour * 100) / 100,
        lastCheckedAt: lastCheckedAt ? lastCheckedAt.toISOString() : null,
        nextCheckEstimateSec,
      };
    });

    // Build hourly load distribution (0–23 UTC)
    // Distribute each monitor's checks evenly across all hours
    const hourlyLoad = Array.from({ length: 24 }, (_, h) => {
      let load = 0;
      for (const m of monitorData) {
        if (!m.enabled) continue;
        if (m.cronExpression) {
          // For cron monitors: spread their total daily checks evenly unless we can detect specific hours
          const dailyChecks = m.checksPerHour * 24;
          load += dailyChecks / 24;
        } else {
          // For interval monitors: spread evenly
          load += m.checksPerHour;
        }
      }
      return {
        hour: h,
        label: `${String(h).padStart(2, '0')}:00`,
        estimatedChecks: Math.round(load * 10) / 10,
      };
    });

    const enabledMonitors = monitorData.filter((m) => m.enabled);
    const fleetChecksPerHour = enabledMonitors.reduce((sum, m) => sum + m.checksPerHour, 0);
    const fleetChecksPerDay = Math.round(fleetChecksPerHour * 24);

    // For cron-expression monitors, try to detect specific fire hours
    // This is a best-effort improvement over even distribution
    const peakHour = hourlyLoad.reduce((best, h) => h.estimatedChecks > best.estimatedChecks ? h : best, hourlyLoad[0]).hour;
    const quietHour = hourlyLoad.reduce((best, h) => h.estimatedChecks < best.estimatedChecks ? h : best, hourlyLoad[0]).hour;
    const avgChecksPerHour = Math.round((fleetChecksPerDay / 24) * 10) / 10;

    return {
      generatedAt: now.toISOString(),
      summary: {
        totalMonitors: monitors.length,
        enabledMonitors: enabledMonitors.length,
        fleetChecksPerHour: Math.round(fleetChecksPerHour * 10) / 10,
        fleetChecksPerDay,
        peakHour,
        peakHourLoad: hourlyLoad[peakHour].estimatedChecks,
        quietHour,
        quietHourLoad: hourlyLoad[quietHour].estimatedChecks,
        avgChecksPerHour,
      },
      hourlyLoad,
      monitors: monitorData,
    };
  }

  /**
   * Returns effective check rate information for a monitor.
   * Includes throttleMs, maxChecksPerHour, checksLastHour, and whether the monitor
   * is currently throttled (checksLastHour >= maxChecksPerHour).
   */
  async checkRate(userId: string, monitorId: string): Promise<{
    intervalSec: number;
    throttleMs: number | null;
    maxChecksPerHour: number | null;
    checksLastHour: number;
    effectiveChecksPerHour: number;
    isThrottled: boolean;
  }> {
    const monitor = await this.prisma.monitor.findFirst({
      where: { id: monitorId, userId },
      select: {
        intervalSec: true,
        throttleMs: true,
        maxChecksPerHour: true,
      },
    });

    if (!monitor) throw new NotFoundException('Monitor not found');

    const since = new Date(Date.now() - 60 * 60 * 1000);
    const checksLastHour = await this.prisma.monitorRun.count({
      where: { monitorId, checkedAt: { gte: since } },
    });

    const intervalBasedRate = Math.floor(3600 / monitor.intervalSec);
    const effectiveChecksPerHour = monitor.maxChecksPerHour !== null
      ? Math.min(intervalBasedRate, monitor.maxChecksPerHour)
      : intervalBasedRate;

    const isThrottled = monitor.maxChecksPerHour !== null
      ? checksLastHour >= monitor.maxChecksPerHour
      : false;

    return {
      intervalSec: monitor.intervalSec,
      throttleMs: monitor.throttleMs,
      maxChecksPerHour: monitor.maxChecksPerHour,
      checksLastHour,
      effectiveChecksPerHour,
      isThrottled,
    };
  }

  /**
   * Analyzes monitoring configuration completeness.
   * Returns per-monitor coverage gaps and an aggregate coverage score (0-100).
   */
  async monitorCoverage(userId: string): Promise<{
    coverageScore: number;
    totalMonitors: number;
    monitorsWithAlerts: number;
    monitorsWithSla: number;
    monitorsWithDescription: number;
    monitorsWithRunbook: number;
    monitorsWithTags: number;
    monitorsEnabled: number;
    gaps: Array<{
      id: string;
      name: string;
      type: string;
      missingAlerts: boolean;
      missingSla: boolean;
      missingDescription: boolean;
      missingRunbook: boolean;
      missingTags: boolean;
      coverageScore: number;
    }>;
    generatedAt: string;
  }> {
    const monitors = await this.prisma.monitor.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        type: true,
        enabled: true,
        description: true,
        runbookUrl: true,
        slaTarget: true,
        _count: { select: { monitorAlerts: true, monitorTags: true } },
      },
      orderBy: [{ pinned: 'desc' }, { name: 'asc' }],
    });

    if (monitors.length === 0) {
      return {
        coverageScore: 100,
        totalMonitors: 0,
        monitorsWithAlerts: 0,
        monitorsWithSla: 0,
        monitorsWithDescription: 0,
        monitorsWithRunbook: 0,
        monitorsWithTags: 0,
        monitorsEnabled: 0,
        gaps: [],
        generatedAt: new Date().toISOString(),
      };
    }

    // Coverage criteria weights (out of 5 points per monitor):
    // - has alert channels: 2 pts (most critical)
    // - has SLA target: 1 pt
    // - has description: 1 pt
    // - has runbook URL: 1 pt
    const WEIGHTS = { alerts: 2, sla: 1, description: 1, runbook: 1 };
    const MAX_SCORE = WEIGHTS.alerts + WEIGHTS.sla + WEIGHTS.description + WEIGHTS.runbook;

    const gaps = monitors.map(m => {
      const missingAlerts = m._count.monitorAlerts === 0;
      const missingSla = m.slaTarget == null;
      const missingDescription = !m.description?.trim();
      const missingRunbook = !m.runbookUrl?.trim();
      const missingTags = m._count.monitorTags === 0;

      const pts =
        (missingAlerts ? 0 : WEIGHTS.alerts) +
        (missingSla ? 0 : WEIGHTS.sla) +
        (missingDescription ? 0 : WEIGHTS.description) +
        (missingRunbook ? 0 : WEIGHTS.runbook);
      const coverageScore = Math.round((pts / MAX_SCORE) * 100);

      return {
        id: m.id,
        name: m.name,
        type: m.type,
        missingAlerts,
        missingSla,
        missingDescription,
        missingRunbook,
        missingTags,
        coverageScore,
      };
    });

    const totalMonitors = monitors.length;
    const monitorsWithAlerts = monitors.filter(m => m._count.monitorAlerts > 0).length;
    const monitorsWithSla = monitors.filter(m => m.slaTarget != null).length;
    const monitorsWithDescription = monitors.filter(m => m.description?.trim()).length;
    const monitorsWithRunbook = monitors.filter(m => m.runbookUrl?.trim()).length;
    const monitorsWithTags = monitors.filter(m => m._count.monitorTags > 0).length;
    const monitorsEnabled = monitors.filter(m => m.enabled).length;

    const avgCoverage = gaps.reduce((s, g) => s + g.coverageScore, 0) / totalMonitors;
    const coverageScore = Math.round(avgCoverage);

    return {
      coverageScore,
      totalMonitors,
      monitorsWithAlerts,
      monitorsWithSla,
      monitorsWithDescription,
      monitorsWithRunbook,
      monitorsWithTags,
      monitorsEnabled,
      gaps: gaps.sort((a, b) => a.coverageScore - b.coverageScore), // worst first
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Analyzes each monitor's check interval vs incident history.
   * Returns per-monitor recommendations for optimal check frequency.
   */
  async intervalOptimizer(userId: string): Promise<{
    monitors: Array<{
      id: string;
      name: string;
      type: string;
      currentIntervalSec: number | null;
      cronExpression: string | null;
      incidents90d: number;
      avgDetectionMinutes: number | null;
      checksPerDay: number;
      recommendation: 'increase' | 'decrease' | 'optimal' | 'new';
      suggestedIntervalSec: number | null;
      reason: string;
    }>;
    summary: {
      optimal: number;
      tooFrequent: number;
      tooInfrequent: number;
      totalMonitors: number;
    };
  }> {
    const monitors = await this.prisma.monitor.findMany({
      where: { userId, enabled: true },
      select: {
        id: true, name: true, type: true,
        intervalSec: true, cronExpression: true,
        createdAt: true,
      },
      orderBy: { name: 'asc' },
    });

    const since90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const monitorIds = monitors.map(m => m.id);

    const incidents = await this.prisma.incident.findMany({
      where: {
        userId,
        createdAt: { gte: since90 },
        monitors: { some: { monitorId: { in: monitorIds } } },
      },
      select: {
        id: true,
        createdAt: true,
        monitors: { select: { monitorId: true } },
      },
    });

    // Get first-failure runs that preceded each incident (within 30 min before incident)
    const monitorIncidentMap = new Map<string, Date[]>();
    for (const inc of incidents) {
      for (const m of inc.monitors) {
        if (!monitorIncidentMap.has(m.monitorId)) monitorIncidentMap.set(m.monitorId, []);
        monitorIncidentMap.get(m.monitorId)!.push(inc.createdAt);
      }
    }

    // For detection time: find first failing run before each incident
    const failingRuns = await this.prisma.monitorRun.findMany({
      where: {
        userId,
        monitorId: { in: monitorIds },
        ok: false,
        checkedAt: { gte: since90 },
      },
      select: { monitorId: true, checkedAt: true },
      orderBy: { checkedAt: 'asc' },
    });

    // Group failing runs by monitor
    const failMap = new Map<string, Date[]>();
    for (const r of failingRuns) {
      if (!failMap.has(r.monitorId)) failMap.set(r.monitorId, []);
      failMap.get(r.monitorId)!.push(r.checkedAt);
    }

    const resultMonitors = monitors.map(m => {
      const incidentDates = monitorIncidentMap.get(m.id) ?? [];
      const incidents90d = incidentDates.length;
      const fails = failMap.get(m.id) ?? [];

      // Compute avg detection time: for each incident, find nearest fail run before it
      const detectionMinutes: number[] = [];
      for (const incDate of incidentDates) {
        const priorFail = fails.filter(f => f < incDate && (incDate.getTime() - f.getTime()) < 30 * 60 * 1000);
        if (priorFail.length > 0) {
          const firstFail = priorFail[0];
          detectionMinutes.push(Math.round((incDate.getTime() - firstFail.getTime()) / 60000));
        }
      }

      const avgDetectionMinutes = detectionMinutes.length > 0
        ? Math.round(detectionMinutes.reduce((a, b) => a + b, 0) / detectionMinutes.length)
        : null;

      const currentIntervalSec = m.intervalSec;
      const checksPerDay = currentIntervalSec ? Math.round(86400 / currentIntervalSec) : 0;

      // Age check: if monitor is < 7 days old, it's "new"
      const ageMs = Date.now() - m.createdAt.getTime();
      if (ageMs < 7 * 24 * 60 * 60 * 1000) {
        return { id: m.id, name: m.name, type: m.type, currentIntervalSec, cronExpression: m.cronExpression, incidents90d, avgDetectionMinutes, checksPerDay, recommendation: 'new' as const, suggestedIntervalSec: null, reason: 'Monitor is new — collect more data before optimizing.' };
      }

      if (!currentIntervalSec) {
        return { id: m.id, name: m.name, type: m.type, currentIntervalSec, cronExpression: m.cronExpression, incidents90d, avgDetectionMinutes, checksPerDay, recommendation: 'optimal' as const, suggestedIntervalSec: null, reason: 'Uses cron expression — manual tuning recommended.' };
      }

      // Too frequent: 0 incidents in 90d AND checking more than every 3 min
      if (incidents90d === 0 && currentIntervalSec < 300) {
        return { id: m.id, name: m.name, type: m.type, currentIntervalSec, cronExpression: m.cronExpression, incidents90d, avgDetectionMinutes, checksPerDay, recommendation: 'decrease' as const, suggestedIntervalSec: 300, reason: 'No incidents in 90 days — reduce frequency to save resources.' };
      }

      // Too infrequent: detection > 10min AND interval > 60s
      if (avgDetectionMinutes !== null && avgDetectionMinutes > 10 && currentIntervalSec > 60) {
        const suggested = Math.max(30, Math.min(60, Math.round(currentIntervalSec / 2)));
        return { id: m.id, name: m.name, type: m.type, currentIntervalSec, cronExpression: m.cronExpression, incidents90d, avgDetectionMinutes, checksPerDay, recommendation: 'increase' as const, suggestedIntervalSec: suggested, reason: `Avg detection time ${avgDetectionMinutes}m — increase check frequency.` };
      }

      return { id: m.id, name: m.name, type: m.type, currentIntervalSec, cronExpression: m.cronExpression, incidents90d, avgDetectionMinutes, checksPerDay, recommendation: 'optimal' as const, suggestedIntervalSec: null, reason: 'Check interval is well-calibrated for this monitor.' };
    });

    const optimal = resultMonitors.filter(m => m.recommendation === 'optimal' || m.recommendation === 'new').length;
    const tooFrequent = resultMonitors.filter(m => m.recommendation === 'decrease').length;
    const tooInfrequent = resultMonitors.filter(m => m.recommendation === 'increase').length;

    return {
      monitors: resultMonitors.sort((a, b) => {
        const order = { increase: 0, decrease: 1, new: 2, optimal: 3 };
        return order[a.recommendation] - order[b.recommendation];
      }),
      summary: { optimal, tooFrequent, tooInfrequent, totalMonitors: monitors.length },
    };
  }

  /**
   * Returns a SSL / TLS certificate inventory for all SSL_CERT and HTTP monitors.
   * Parses days-remaining from the latest run message for SSL_CERT monitors.
   * HTTP monitors return certificate details live on the `/certificate` endpoint;
   * here we only return their latest run status.
   *
   * @param userId - Owner's user ID
   */
  async getSslSummary(userId: string): Promise<{
    total: number;
    expired: number;
    critical: number;
    warning: number;
    healthy: number;
    certs: Array<{
      monitorId: string;
      name: string;
      target: string;
      type: string;
      enabled: boolean;
      folderId: string | null;
      folderName: string | null;
      status: string;
      daysRemaining: number | null;
      expiresAt: string | null;
      lastCheckedAt: string | null;
      lastMessage: string;
      level: string;
    }>;
  }> {
    // Fetch all SSL_CERT + HTTP monitors
    const monitors = await this.prisma.monitor.findMany({
      where: { userId, type: { in: ['SSL_CERT', 'HTTP', 'BROWSER'] } },
      select: {
        id: true,
        name: true,
        target: true,
        type: true,
        enabled: true,
        folderId: true,
        folder: { select: { name: true } },
        runs: {
          orderBy: { checkedAt: 'desc' },
          take: 1,
          select: { level: true, message: true, checkedAt: true, ok: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    const daysRemainingRegex = /expires?\s+in\s+(\d+)\s*days?/i;
    const expiresAtRegex = /\((\d{4}-\d{2}-\d{2})\)/;
    const expiredRegex = /expired?\s+(\d+)\s*days?\s*ago/i;

    const certs = monitors.map((m) => {
      const latestRun = m.runs[0] ?? null;
      const message = latestRun?.message ?? '';
      const level = latestRun?.level ?? 'unknown';

      let daysRemaining: number | null = null;
      let expiresAt: string | null = null;

      if (m.type === 'SSL_CERT') {
        // Try to parse days from message like "SSL cert expires in 42 days (2025-12-31)"
        const daysMatch = daysRemainingRegex.exec(message);
        if (daysMatch) daysRemaining = parseInt(daysMatch[1], 10);

        const expiredMatch = expiredRegex.exec(message);
        if (expiredMatch) daysRemaining = -parseInt(expiredMatch[1], 10);

        const dateMatch = expiresAtRegex.exec(message);
        if (dateMatch) expiresAt = dateMatch[1];

        // If level is red and no days parsed, assume expired/unknown
        if (daysRemaining === null && level === 'red' && message.toLowerCase().includes('expir')) {
          daysRemaining = 0;
        }
      }

      return {
        monitorId: m.id,
        name: m.name,
        target: m.target,
        type: m.type,
        enabled: m.enabled,
        folderId: m.folderId,
        folderName: m.folder?.name ?? null,
        status: latestRun?.ok ? 'up' : latestRun ? 'down' : 'unknown',
        daysRemaining,
        expiresAt,
        lastCheckedAt: latestRun?.checkedAt?.toISOString() ?? null,
        lastMessage: message,
        level,
      };
    });

    // Sort: expired first, then by daysRemaining ascending (soonest first), then unknown, then HTTP without days
    certs.sort((a, b) => {
      const aHasDays = a.daysRemaining !== null;
      const bHasDays = b.daysRemaining !== null;
      if (aHasDays && bHasDays) return (a.daysRemaining ?? 0) - (b.daysRemaining ?? 0);
      if (aHasDays) return -1;
      if (bHasDays) return 1;
      return a.name.localeCompare(b.name);
    });

    const sslCerts = certs.filter((c) => c.type === 'SSL_CERT');
    const expired = sslCerts.filter((c) => c.daysRemaining !== null && c.daysRemaining < 0).length;
    const critical = sslCerts.filter((c) => c.daysRemaining !== null && c.daysRemaining >= 0 && c.daysRemaining < 10).length;
    const warning = sslCerts.filter((c) => c.daysRemaining !== null && c.daysRemaining >= 10 && c.daysRemaining <= 30).length;
    const healthy = sslCerts.filter((c) => c.daysRemaining !== null && c.daysRemaining > 30).length;

    return {
      total: certs.length,
      expired,
      critical,
      warning,
      healthy,
      certs,
    };
  }

  /**
   * Security headers fleet summary.
   *
   * Aggregates the latest `securityAuditJson` from each HTTP/BROWSER monitor
   * and returns a fleet-level overview: grade distribution, per-header coverage
   * rate, and per-monitor rows sorted by score ascending (worst first).
   *
   * @param userId - Owner's user ID
   */
  async getSecurityHeadersSummary(userId: string): Promise<{
    total: number;
    gradeA: number;
    gradeB: number;
    gradeC: number;
    gradeD: number;
    gradeF: number;
    noData: number;
    avgScore: number | null;
    headerCoverage: Array<{ name: string; presentCount: number; totalCount: number; coveragePct: number; severity: string }>;
    monitors: Array<{
      monitorId: string;
      name: string;
      target: string;
      folderId: string | null;
      folderName: string | null;
      enabled: boolean;
      grade: string | null;
      score: number | null;
      checkedAt: string | null;
      headers: Array<{ name: string; present: boolean; severity: string }>;
    }>;
  }> {
    const monitors = await this.prisma.monitor.findMany({
      where: { userId, type: { in: ['HTTP', 'BROWSER'] } },
      select: {
        id: true,
        name: true,
        target: true,
        enabled: true,
        folderId: true,
        folder: { select: { name: true } },
        runs: {
          orderBy: { checkedAt: 'desc' },
          take: 1,
          where: { ok: true },
          select: { securityAuditJson: true, checkedAt: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    type HeaderResult = { name: string; present: boolean; severity: string; value?: string | null; description?: string; recommendation?: string };
    type AuditJson = { grade: string; score: number; headers: HeaderResult[] };

    const rows: Array<{
      monitorId: string;
      name: string;
      target: string;
      folderId: string | null;
      folderName: string | null;
      enabled: boolean;
      grade: string | null;
      score: number | null;
      checkedAt: string | null;
      headers: Array<{ name: string; present: boolean; severity: string }>;
    }> = [];

    let totalScore = 0;
    let scoredCount = 0;
    const gradeCounts: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 };
    const headerAccum: Map<string, { present: number; total: number; severity: string }> = new Map();

    for (const m of monitors) {
      const run = m.runs[0] ?? null;
      const audit = run?.securityAuditJson as AuditJson | null | undefined;

      if (audit && typeof audit === 'object' && 'grade' in audit) {
        const grade = String(audit.grade ?? 'F').toUpperCase();
        gradeCounts[grade] = (gradeCounts[grade] ?? 0) + 1;
        totalScore += typeof audit.score === 'number' ? audit.score : 0;
        scoredCount++;

        // Accumulate per-header coverage
        if (Array.isArray(audit.headers)) {
          for (const h of audit.headers as HeaderResult[]) {
            const existing = headerAccum.get(h.name);
            if (existing) {
              existing.total++;
              if (h.present) existing.present++;
            } else {
              headerAccum.set(h.name, { present: h.present ? 1 : 0, total: 1, severity: h.severity ?? 'info' });
            }
          }
        }

        rows.push({
          monitorId: m.id,
          name: m.name,
          target: m.target ?? '',
          folderId: m.folderId,
          folderName: m.folder?.name ?? null,
          enabled: m.enabled,
          grade,
          score: typeof audit.score === 'number' ? audit.score : null,
          checkedAt: run?.checkedAt?.toISOString() ?? null,
          headers: Array.isArray(audit.headers)
            ? (audit.headers as HeaderResult[]).map((h) => ({ name: h.name, present: h.present, severity: h.severity ?? 'info' }))
            : [],
        });
      } else {
        rows.push({
          monitorId: m.id,
          name: m.name,
          target: m.target ?? '',
          folderId: m.folderId,
          folderName: m.folder?.name ?? null,
          enabled: m.enabled,
          grade: null,
          score: null,
          checkedAt: null,
          headers: [],
        });
      }
    }

    // Sort: monitors with data first, sorted by score ascending (worst first), then no-data
    rows.sort((a, b) => {
      if (a.score === null && b.score === null) return a.name.localeCompare(b.name);
      if (a.score === null) return 1;
      if (b.score === null) return -1;
      return a.score - b.score;
    });

    const headerCoverage = Array.from(headerAccum.entries()).map(([name, v]) => ({
      name,
      presentCount: v.present,
      totalCount: v.total,
      coveragePct: v.total > 0 ? Math.round((v.present / v.total) * 100) : 0,
      severity: v.severity,
    }));
    // Sort critical first, then warning, then others; within severity sort by coverage ascending (most missing first)
    const severityOrder: Record<string, number> = { critical: 0, warning: 1, info: 2 };
    headerCoverage.sort((a, b) => {
      const so = (severityOrder[a.severity] ?? 2) - (severityOrder[b.severity] ?? 2);
      if (so !== 0) return so;
      return a.coveragePct - b.coveragePct;
    });

    const noData = monitors.length - scoredCount;

    return {
      total: monitors.length,
      gradeA: gradeCounts['A'] ?? 0,
      gradeB: gradeCounts['B'] ?? 0,
      gradeC: gradeCounts['C'] ?? 0,
      gradeD: gradeCounts['D'] ?? 0,
      gradeF: gradeCounts['F'] ?? 0,
      noData,
      avgScore: scoredCount > 0 ? Math.round(totalScore / scoredCount) : null,
      headerCoverage,
      monitors: rows,
    };
  }

  // ─── CT Log History ──────────────────────────────────────────────────────

  async ctLogHistory(userId: string, monitorId: string): Promise<{
    entries: Array<{
      checkedAt: Date;
      newCertCount: number;
      domains: string[];
      message: string;
      level: string;
    }>;
  }> {
    const monitor = await this.prisma.monitor.findFirst({ where: { id: monitorId, userId } });
    if (!monitor) throw new NotFoundException('Monitor not found');

    const runs = await this.prisma.monitorRun.findMany({
      where: { monitorId },
      orderBy: { checkedAt: 'desc' },
      take: 50,
      select: { checkedAt: true, message: true, level: true },
    });

    return {
      entries: runs.map((r) => {
        const msg = r.message ?? '';
        // Try to parse cert count from message: "N new certificate(s) found..."
        const countMatch = msg.match(/^(\d+) new certificate/i);
        const newCertCount = countMatch ? parseInt(countMatch[1], 10) : 0;

        // Extract domain list from message: "...: domain1, domain2 (+N more)"
        const domainsMatch = msg.match(/:\s+(.+?)(\s+\(\+\d+ more\))?$/);
        const domains = domainsMatch
          ? domainsMatch[1].split(',').map((d) => d.trim()).filter(Boolean)
          : [];

        return {
          checkedAt: r.checkedAt,
          message: msg,
          newCertCount,
          domains,
          level: r.level ?? 'green',
        };
      }),
    };
  }

  /**
   * Returns redirect chain statistics for a monitor based on the last 100 runs.
   */
  async redirectChainStats(userId: string, monitorId: string): Promise<{
    hasRedirects: boolean;
    avgRedirects: number;
    maxRedirects: number;
    commonChains: Array<{ chain: string[]; count: number }>;
  }> {
    const monitor = await this.prisma.monitor.findFirst({ where: { id: monitorId, userId } });
    if (!monitor) throw new NotFoundException('Monitor not found');

    const runs = await this.prisma.monitorRun.findMany({
      where: { monitorId },
      orderBy: { checkedAt: 'desc' },
      take: 100,
      select: { redirectChain: true },
    });

    const withRedirects = runs.filter(r => (r as typeof r & { redirectChain: string[] }).redirectChain.length > 0);
    if (withRedirects.length === 0) {
      return { hasRedirects: false, avgRedirects: 0, maxRedirects: 0, commonChains: [] };
    }

    const counts: Record<string, { chain: string[]; count: number }> = {};
    for (const r of withRedirects) {
      const chain = (r as typeof r & { redirectChain: string[] }).redirectChain;
      const key = JSON.stringify(chain);
      if (!counts[key]) counts[key] = { chain, count: 0 };
      counts[key].count++;
    }

    const commonChains = Object.values(counts)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const totalRedirects = withRedirects.reduce((sum, r) => sum + (r as typeof r & { redirectChain: string[] }).redirectChain.length, 0);
    const maxRedirects = withRedirects.reduce((max, r) => Math.max(max, (r as typeof r & { redirectChain: string[] }).redirectChain.length), 0);

    return {
      hasRedirects: true,
      avgRedirects: Math.round((totalRedirects / withRedirects.length) * 10) / 10,
      maxRedirects,
      commonChains,
    };
  }
}


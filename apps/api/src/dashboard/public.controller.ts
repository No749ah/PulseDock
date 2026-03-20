import { Controller, Get, NotFoundException, Param, Query, Res, Header } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { PrismaService } from '../common/prisma.service';

// ---------------------------------------------------------------------------
// SVG Badge helpers
// ---------------------------------------------------------------------------

function escapeXml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/**
 * Approximate Verdana 11px character widths (px).
 * Upper-case letters are ~20% wider on average.
 */
function textWidth(text: string, uppercase = false): number {
  // Per-char widths at 11px Verdana (normal case)
  const lowerWidths: Record<string, number> = {
    ' ': 3.3, '!': 4, '"': 5, '#': 9, '$': 7, '%': 9, '&': 8, "'": 3,
    '(': 4, ')': 4, '*': 6, '+': 9, ',': 4, '-': 4, '.': 4, '/': 5,
    '0': 7, '1': 7, '2': 7, '3': 7, '4': 7, '5': 7, '6': 7, '7': 7,
    '8': 7, '9': 7, ':': 4, ';': 4, '<': 9, '=': 9, '>': 9, '?': 6,
    '@': 11, a: 6, b: 7, c: 6, d: 7, e: 6, f: 4, g: 7, h: 7, i: 3,
    j: 3, k: 7, l: 3, m: 11, n: 7, o: 7, p: 7, q: 7, r: 5, s: 5,
    t: 5, u: 7, v: 7, w: 9, x: 7, y: 7, z: 6,
    A: 8, B: 7, C: 7, D: 8, E: 6, F: 6, G: 8, H: 8, I: 3, J: 5,
    K: 7, L: 6, M: 9, N: 8, O: 8, P: 7, Q: 8, R: 7, S: 6, T: 6,
    U: 8, V: 8, W: 11, X: 7, Y: 7, Z: 7,
  };
  let w = 0;
  for (const ch of text) {
    const key = uppercase ? ch.toUpperCase() : ch;
    w += lowerWidths[key] ?? lowerWidths[ch.toLowerCase()] ?? 7;
  }
  // for-the-badge uses bold — add ~10% for bold weight
  return Math.ceil(w * (uppercase ? 1.1 : 1));
}

type BadgeStyle = 'flat' | 'flat-square' | 'for-the-badge';

interface BadgeParams {
  label: string;
  message: string;
  color: string;
  labelColor: string;
  style: BadgeStyle;
}

function buildBadgeSvg({ label, message, color, labelColor, style }: BadgeParams): string {
  const isFtb = style === 'for-the-badge';

  // for-the-badge: uppercase + bold
  const displayLabel = isFtb ? label.toUpperCase() : label;
  const displayMessage = isFtb ? message.toUpperCase() : message;

  // Compute text widths with correct casing
  const padding = isFtb ? 22 : 16;
  const lw = textWidth(displayLabel, isFtb) + padding;
  const rw = textWidth(displayMessage, isFtb) + padding;
  const totalW = lw + rw;

  const height = isFtb ? 28 : 20;
  const radius = isFtb || style === 'flat-square' ? 0 : 3;
  // Use safe font-family — no raw double-quotes inside attribute
  const fontFamily = isFtb ? 'DejaVu Sans,Verdana,Geneva,sans-serif' : 'Verdana,Geneva,DejaVu Sans,sans-serif';
  const fontSize = isFtb ? 11 : 11;
  const fontWeight = isFtb ? 'bold' : 'normal';
  const letterSpacing = isFtb ? '0.5' : '0';
  const textY = Math.round(height * 0.68); // vertically centered, slightly below midpoint
  const labelX = Math.round(lw / 2);
  const messageX = lw + Math.round(rw / 2);

  const gradientOverlay = style === 'flat'
    ? `<rect width="${totalW}" height="${height}" fill="url(#s)"/>`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${height}" role="img" aria-label="${escapeXml(displayLabel)}: ${escapeXml(displayMessage)}">
  <title>${escapeXml(label)}: ${escapeXml(message)}</title>
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r"><rect width="${totalW}" height="${height}" rx="${radius}" fill="#fff"/></clipPath>
  <g clip-path="url(#r)">
    <rect width="${lw}" height="${height}" fill="${escapeXml(labelColor)}"/>
    <rect x="${lw}" width="${rw}" height="${height}" fill="${escapeXml(color)}"/>
    ${gradientOverlay}
  </g>
  <g fill="#fff" text-anchor="middle" font-family="${escapeXml(fontFamily)}" font-size="${fontSize}" font-weight="${fontWeight}" letter-spacing="${letterSpacing}">
    <text x="${labelX}" y="${textY + 1}" fill="#010101" fill-opacity=".25">${escapeXml(displayLabel)}</text>
    <text x="${labelX}" y="${textY}">${escapeXml(displayLabel)}</text>
    <text x="${messageX}" y="${textY + 1}" fill="#010101" fill-opacity=".25">${escapeXml(displayMessage)}</text>
    <text x="${messageX}" y="${textY}">${escapeXml(displayMessage)}</text>
  </g>
</svg>`;
}

// ---------------------------------------------------------------------------
// Embed Script builder
// ---------------------------------------------------------------------------

interface EmbedScriptParams {
  displayLabel: string;
  status: string;
  color: string;
  pos: string;
  isDark: boolean;
  latency: string;
  monitorId: string | null;
  pageSlug: string | null;
}

/**
 * Builds a self-contained JavaScript snippet that injects a floating status badge
 * into any host page when included via a `<script>` tag.
 */
function buildEmbedScript(p: EmbedScriptParams): string {
  const statusIcon = p.status === 'up' || p.status === 'operational' ? '●' :
    p.status === 'degraded' ? '◐' : p.status === 'down' || p.status === 'outage' ? '○' : '?';

  // Position CSS
  const posStyle = p.pos === 'bottom-left' ? 'bottom:16px;left:16px' :
    p.pos === 'top-right' ? 'top:16px;right:16px' :
    p.pos === 'top-left' ? 'top:16px;left:16px' :
    'bottom:16px;right:16px';

  const bg = p.isDark ? '#161b22' : '#fff';
  const borderColor = p.isDark ? '#30363d' : '#d0d7de';
  const textColor = p.isDark ? '#e6edf3' : '#1f2328';
  const subTextColor = p.isDark ? '#8b949e' : '#656d76';
  const labelEscaped = JSON.stringify(p.displayLabel);
  const statusEscaped = JSON.stringify(p.status);
  const latencyEscaped = JSON.stringify(p.latency);
  const colorEscaped = JSON.stringify(p.color);
  const iconEscaped = JSON.stringify(statusIcon);

  return `(function(){
  if(document.getElementById('_pd_embed_badge'))return;
  var el=document.createElement('div');
  el.id='_pd_embed_badge';
  el.style.cssText='position:fixed;${posStyle};z-index:99999;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;font-size:12px;line-height:1.4;border-radius:8px;padding:8px 12px;background:${bg};border:1px solid ${borderColor};box-shadow:0 4px 12px rgba(0,0,0,0.15);display:flex;align-items:center;gap:8px;cursor:pointer;text-decoration:none;color:${textColor};max-width:220px;';
  var icon=document.createElement('span');
  icon.textContent=${iconEscaped};
  icon.style.cssText='color:'+${colorEscaped}+';font-size:10px;flex-shrink:0;';
  var txt=document.createElement('span');
  txt.style.cssText='display:flex;flex-direction:column;min-width:0;';
  var lbl=document.createElement('span');
  lbl.textContent=${labelEscaped};
  lbl.style.cssText='font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:${textColor};';
  var sub=document.createElement('span');
  var subText=${statusEscaped}+(${latencyEscaped}?' · '+${latencyEscaped}:'');
  sub.textContent=subText;
  sub.style.cssText='color:${subTextColor};font-size:11px;';
  txt.appendChild(lbl);
  txt.appendChild(sub);
  el.appendChild(icon);
  el.appendChild(txt);
  el.setAttribute('role','status');
  el.setAttribute('aria-label','Service status: '+${statusEscaped});
  document.body.appendChild(el);
})();`;
}

@ApiTags('Public')
@Controller('v1/public')
export class PublicDashboardController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('overview/:userId')
  @ApiOperation({ summary: 'Public status page data', description: 'Returns public monitor stats for a given user. No auth required — for public status pages.' })
  @ApiParam({ name: 'userId', description: 'User ID whose public status page to fetch' })
  @ApiResponse({ status: 200, description: 'Public overview returned.' })
  @ApiResponse({ status: 404, description: 'User not found.' })
  async overview(@Param('userId') userId: string) {
    // Verify user exists
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true } });
    if (!user) throw new NotFoundException('User not found');

    const monitors = await this.prisma.monitor.findMany({
      where: { userId, enabled: true },
      orderBy: { name: 'asc' },
    });

    // Fetch last 500 runs across all monitors, ordered newest-first
    const runs = await this.prisma.monitorRun.findMany({
      where: { userId },
      orderBy: { checkedAt: 'desc' },
      take: 500,
    });

    // Group runs by monitorId (still newest-first)
    const runsByMonitor = new Map<string, (typeof runs)>();
    for (const run of runs) {
      if (!runsByMonitor.has(run.monitorId)) runsByMonitor.set(run.monitorId, []);
      runsByMonitor.get(run.monitorId)!.push(run);
    }

    let green = 0;
    let yellow = 0;
    let red = 0;

    const monitorStatuses = monitors.map((monitor) => {
      const monRuns = runsByMonitor.get(monitor.id) ?? [];
      const latest = monRuns[0]; // newest-first
      const level = (latest?.level ?? 'green') as 'green' | 'yellow' | 'red';

      if (!latest || level === 'green') green += 1;
      else if (level === 'yellow') yellow += 1;
      else red += 1;

      // Per-monitor uptime %: fraction of green runs in last 100 runs
      const recentRuns = monRuns.slice(0, 100);
      const greenCount = recentRuns.filter((r) => r.level === 'green').length;
      const monitorUptimePct = recentRuns.length === 0 ? 100 : Math.round((greenCount / recentRuns.length) * 10000) / 100;

      // Latency sparkline: last 30 runs with non-null latency, chronological order
      const latencyHistory = monRuns
        .slice(0, 30)
        .reverse()
        .filter((r) => r.latencyMs !== null)
        .map((r) => ({ checkedAt: r.checkedAt.toISOString(), latencyMs: r.latencyMs as number }));

      return {
        id: monitor.id,
        name: monitor.name,
        type: monitor.type,
        level,
        lastChecked: latest?.checkedAt.toISOString() ?? null,
        message: latest?.message ?? null,
        latencyMs: latest?.latencyMs ?? null,
        uptimePct: monitorUptimePct,
        latencyHistory,
      };
    });

    const total = monitors.length;
    const uptimePct = total === 0 ? 100 : Math.round((green / total) * 10000) / 100;

    // Compute incident history across all monitors
    // Strategy: per monitor, scan runs oldest-to-newest, track open incidents
    const incidents: Array<{
      id: string;
      monitorId: string;
      monitorName: string;
      level: 'yellow' | 'red';
      startedAt: string;
      resolvedAt: string | null;
      durationMs: number | null;
    }> = [];

    for (const monitor of monitors) {
      const monRuns = (runsByMonitor.get(monitor.id) ?? []).slice().reverse(); // oldest-first
      let incidentStart: (typeof monRuns)[number] | null = null;
      let incidentLevel: 'yellow' | 'red' = 'yellow';

      for (const run of monRuns) {
        const lvl = run.level as 'green' | 'yellow' | 'red';
        if (lvl !== 'green') {
          if (!incidentStart) {
            incidentStart = run;
            incidentLevel = lvl === 'red' ? 'red' : 'yellow';
          } else if (lvl === 'red') {
            // Escalate level if red encountered
            incidentLevel = 'red';
          }
        } else {
          if (incidentStart) {
            // Incident resolved
            const startMs = incidentStart.checkedAt.getTime();
            const endMs = run.checkedAt.getTime();
            incidents.push({
              id: `${monitor.id}-${startMs}`,
              monitorId: monitor.id,
              monitorName: monitor.name,
              level: incidentLevel,
              startedAt: incidentStart.checkedAt.toISOString(),
              resolvedAt: run.checkedAt.toISOString(),
              durationMs: endMs - startMs,
            });
            incidentStart = null;
            incidentLevel = 'yellow';
          }
        }
      }

      // Ongoing incident
      if (incidentStart) {
        incidents.push({
          id: `${monitor.id}-${incidentStart.checkedAt.getTime()}`,
          monitorId: monitor.id,
          monitorName: monitor.name,
          level: incidentLevel,
          startedAt: incidentStart.checkedAt.toISOString(),
          resolvedAt: null,
          durationMs: null,
        });
      }
    }

    // Sort incidents newest-first
    incidents.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());

    return {
      userId,
      displayName: user.email,
      totalMonitors: total,
      green,
      yellow,
      red,
      uptimePct,
      monitors: monitorStatuses,
      incidents: incidents.slice(0, 20),
      recentEvents: runs.slice(0, 20).map((r) => ({
        id: r.id,
        monitorId: r.monitorId,
        checkedAt: r.checkedAt.toISOString(),
        ok: r.ok,
        latencyMs: r.latencyMs,
        message: r.message,
        level: r.level as 'green' | 'yellow' | 'red',
      })),
    };
  }

  // ---------------------------------------------------------------------------
  // Embeddable SVG Status Badge
  // ---------------------------------------------------------------------------

  @Get('badge/:monitorId.svg')
  @Header('Content-Type', 'image/svg+xml')
  @ApiOperation({
    summary: 'Monitor status badge (SVG)',
    description: 'Returns a shields.io-style SVG badge for a monitor. No authentication required. Embed in GitHub READMEs with `![Status](https://your-instance/api/v1/public/badge/<monitorId>.svg)`.',
  })
  @ApiParam({ name: 'monitorId', description: 'Monitor ID to generate badge for.' })
  @ApiQuery({ name: 'style', required: false, enum: ['flat', 'flat-square', 'for-the-badge'], description: 'Badge style (default: flat)' })
  @ApiQuery({ name: 'label', required: false, description: 'Custom left-side label (default: monitor name)' })
  @ApiResponse({ status: 200, description: 'SVG badge returned.' })
  @ApiResponse({ status: 404, description: 'Monitor not found.' })
  async badge(
    @Param('monitorId') monitorId: string,
    @Query('style') style: string | undefined,
    @Query('label') labelOverride: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const monitor = await this.prisma.monitor.findUnique({
      where: { id: monitorId },
      select: { id: true, name: true, enabled: true },
    });
    if (!monitor) throw new NotFoundException('Monitor not found');

    // Fetch latest run
    const latest = await this.prisma.monitorRun.findFirst({
      where: { monitorId },
      orderBy: { checkedAt: 'desc' },
      select: { level: true, ok: true },
    });

    // Derive status + color
    const level = (latest?.level ?? 'green') as 'green' | 'yellow' | 'red';
    let message: string;
    let color: string;
    if (!monitor.enabled) {
      message = 'paused';
      color = '#9ca3af'; // gray
    } else if (level === 'green') {
      message = 'up';
      color = '#3fb950'; // green
    } else if (level === 'yellow') {
      message = 'degraded';
      color = '#d29922'; // yellow
    } else {
      message = 'down';
      color = '#f85149'; // red
    }

    const badgeStyle: BadgeStyle =
      style === 'flat-square' ? 'flat-square' :
      style === 'for-the-badge' ? 'for-the-badge' :
      'flat';

    const label = labelOverride ?? monitor.name;
    const svg = buildBadgeSvg({
      label,
      message,
      color,
      labelColor: '#555',
      style: badgeStyle,
    });

    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.end(svg);
  }

  // ---------------------------------------------------------------------------
  // Status Page Overall SVG Badge
  // ---------------------------------------------------------------------------

  // ── Embeddable JS Widget ─────────────────────────────────────────────────

  /**
   * Returns a self-contained JavaScript snippet that injects a live status badge
   * into the host page. Usage:
   *   <script src="https://your-pulsedock.example/api/v1/public/embed/monitor/MONITOR_ID.js"></script>
   *
   * @param monitorId - The monitor to display status for
   */
  @Get('embed/monitor/:monitorId.js')
  @Header('Content-Type', 'application/javascript; charset=utf-8')
  @ApiOperation({
    summary: 'Embeddable status badge script for a monitor',
    description: 'Returns a self-contained `<script>` that injects a live status badge into any webpage. Supports `?position=bottom-right|bottom-left|top-right|top-left` and `?label=Custom+Label`.',
  })
  @ApiParam({ name: 'monitorId', description: 'Monitor ID' })
  @ApiQuery({ name: 'position', required: false, enum: ['bottom-right', 'bottom-left', 'top-right', 'top-left'], description: 'Badge position (default: bottom-right)' })
  @ApiQuery({ name: 'label', required: false, description: 'Custom label override' })
  @ApiQuery({ name: 'theme', required: false, enum: ['dark', 'light'], description: 'Badge color theme (default: dark)' })
  @ApiResponse({ status: 200, description: 'JavaScript bundle.' })
  @ApiResponse({ status: 404, description: 'Monitor not found.' })
  async embedMonitorScript(
    @Param('monitorId') monitorId: string,
    @Query('position') position: string | undefined,
    @Query('label') label: string | undefined,
    @Query('theme') theme: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const monitor = await this.prisma.monitor.findUnique({
      where: { id: monitorId },
      select: { id: true, name: true, enabled: true },
    });
    if (!monitor) throw new NotFoundException('Monitor not found');

    // Get latest run
    const run = await this.prisma.monitorRun.findFirst({
      where: { monitorId },
      orderBy: { checkedAt: 'desc' },
      select: { ok: true, level: true, latencyMs: true, checkedAt: true },
    });

    const status = !run ? 'unknown' : run.level === 'red' ? 'down' : run.level === 'yellow' ? 'degraded' : 'up';
    const color = status === 'up' ? '#2da44e' : status === 'degraded' ? '#d1a317' : status === 'down' ? '#cf222e' : '#6e7681';
    const displayLabel = label ?? monitor.name;
    const pos = position === 'bottom-left' ? 'bottom-left' : position === 'top-right' ? 'top-right' : position === 'top-left' ? 'top-left' : 'bottom-right';
    const isDark = theme !== 'light';
    const latency = run?.latencyMs != null ? `${run.latencyMs}ms` : '';

    const script = buildEmbedScript({ displayLabel, status, color, pos, isDark, latency, monitorId, pageSlug: null });

    res.setHeader('Cache-Control', 'public, max-age=30, s-maxage=30');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.end(script);
  }

  /**
   * Returns a self-contained JavaScript snippet for a status page (overall status).
   * Usage:
   *   <script src="https://your-pulsedock.example/api/v1/public/embed/status/PAGE_SLUG.js"></script>
   */
  @Get('embed/status/:slug.js')
  @Header('Content-Type', 'application/javascript; charset=utf-8')
  @ApiOperation({
    summary: 'Embeddable status badge script for a status page',
    description: 'Returns a self-contained `<script>` showing overall status page health as a floating badge on any webpage.',
  })
  @ApiParam({ name: 'slug', description: 'Status page slug' })
  @ApiQuery({ name: 'position', required: false, enum: ['bottom-right', 'bottom-left', 'top-right', 'top-left'], description: 'Badge position (default: bottom-right)' })
  @ApiQuery({ name: 'label', required: false, description: 'Custom label override' })
  @ApiQuery({ name: 'theme', required: false, enum: ['dark', 'light'], description: 'Badge color theme (default: dark)' })
  @ApiResponse({ status: 200, description: 'JavaScript bundle.' })
  @ApiResponse({ status: 404, description: 'Status page not found or not published.' })
  async embedStatusPageScript(
    @Param('slug') slug: string,
    @Query('position') position: string | undefined,
    @Query('label') label: string | undefined,
    @Query('theme') theme: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const page = await this.prisma.publicStatusPage.findUnique({
      where: { slug },
      select: { id: true, title: true, isPublished: true, layout: true },
    });
    if (!page || !page.isPublished) throw new NotFoundException('Status page not found or not published');

    // Extract monitor IDs from layout
    const layoutStr = JSON.stringify(page.layout);
    const monitorIdRegex = /"monitorId"\s*:\s*"([^"]+)"/g;
    const monitorIds = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = monitorIdRegex.exec(layoutStr)) !== null) monitorIds.add(m[1]);

    let status: string;
    let color: string;

    if (monitorIds.size === 0) {
      status = 'up';
      color = '#2da44e';
    } else {
      const runs = await this.prisma.monitorRun.findMany({
        where: { monitorId: { in: [...monitorIds] } },
        orderBy: { checkedAt: 'desc' },
        distinct: ['monitorId'],
        select: { level: true },
      });

      const hasDown = runs.some(r => r.level === 'red');
      const hasDegraded = runs.some(r => r.level === 'yellow');

      if (hasDown) { status = 'outage'; color = '#cf222e'; }
      else if (hasDegraded) { status = 'degraded'; color = '#d1a317'; }
      else { status = 'operational'; color = '#2da44e'; }
    }

    const displayLabel = label ?? page.title;
    const pos = position === 'bottom-left' ? 'bottom-left' : position === 'top-right' ? 'top-right' : position === 'top-left' ? 'top-left' : 'bottom-right';
    const isDark = theme !== 'light';

    const script = buildEmbedScript({ displayLabel, status, color, pos, isDark, latency: '', monitorId: null, pageSlug: slug });

    res.setHeader('Cache-Control', 'public, max-age=30, s-maxage=30');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.end(script);
  }

  @Get('status-badge/:slug.svg')
  @Header('Content-Type', 'image/svg+xml')
  @ApiOperation({
    summary: 'Status page overall status badge (SVG)',
    description: 'Returns a shields.io-style SVG badge showing the overall status of a published status page. No authentication required.',
  })
  @ApiParam({ name: 'slug', description: 'Status page slug' })
  @ApiQuery({ name: 'style', required: false, enum: ['flat', 'flat-square', 'for-the-badge'], description: 'Badge style (default: flat)' })
  @ApiQuery({ name: 'label', required: false, description: 'Custom left-side label (default: page title)' })
  @ApiResponse({ status: 200, description: 'SVG badge returned.' })
  @ApiResponse({ status: 404, description: 'Status page not found or not published.' })
  async statusPageBadge(
    @Param('slug') slug: string,
    @Query('style') style: string | undefined,
    @Query('label') labelOverride: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const page = await this.prisma.publicStatusPage.findUnique({
      where: { slug },
      select: { id: true, title: true, isPublished: true, layout: true, userId: true },
    });
    if (!page || !page.isPublished) throw new NotFoundException('Status page not found or not published');

    // Extract monitor IDs from layout
    const layoutStr = JSON.stringify(page.layout);
    const monitorIdRegex = /"monitorId"\s*:\s*"([^"]+)"/g;
    const monitorIds = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = monitorIdRegex.exec(layoutStr)) !== null) monitorIds.add(m[1]);

    let message: string;
    let color: string;

    if (monitorIds.size === 0) {
      message = 'operational';
      color = '#2da44e';
    } else {
      // Fetch latest run for each monitor
      const runs = await this.prisma.monitorRun.findMany({
        where: { monitorId: { in: [...monitorIds] } },
        orderBy: { checkedAt: 'desc' },
        distinct: ['monitorId'],
        select: { monitorId: true, level: true, ok: true },
      });

      const hasDown = runs.some(r => r.level === 'red');
      const hasDegraded = runs.some(r => r.level === 'yellow');

      if (hasDown) {
        message = 'outage';
        color = '#cf222e';
      } else if (hasDegraded) {
        message = 'degraded';
        color = '#d1a317';
      } else {
        message = 'operational';
        color = '#2da44e';
      }
    }

    const badgeStyle: BadgeStyle =
      style === 'flat-square' ? 'flat-square' :
      style === 'for-the-badge' ? 'for-the-badge' :
      'flat';

    const label = labelOverride ?? page.title;
    const svg = buildBadgeSvg({
      label,
      message,
      color,
      labelColor: '#555',
      style: badgeStyle,
    });

    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.end(svg);
  }
}

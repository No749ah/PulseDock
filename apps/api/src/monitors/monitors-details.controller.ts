import * as tls from 'tls';
import { Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../common/auth.guard';
import { RequireScope } from '../common/require-scope.decorator';
import { ScopeGuard } from '../common/scope.guard';
import { ApiKeyScope } from '../apikeys/apikeys.dto';
import { MonitorsCrudService } from './monitors-crud.service';
import { PrismaService } from '../common/prisma.service';
import { CreateMonitorEventDto } from './monitors.dto';
import { Post } from '@nestjs/common';

@ApiTags('Monitors')
@ApiBearerAuth()
@UseGuards(AuthGuard, ScopeGuard)
@Controller('v1/monitors')
export class MonitorsDetailsController {
  constructor(
    private readonly crudService: MonitorsCrudService,
    private readonly prisma: PrismaService,
  ) {}

  // ─── Dependencies ────────────────────────────────────────────────────

  @Get(':id/dependencies')
  @RequireScope(ApiKeyScope.READ)
  @ApiOperation({
    summary: 'List dependencies for a monitor',
    description:
      'Returns all monitors that this monitor depends on. When a dependency is down, alerts on this monitor are suppressed.',
  })
  @ApiParam({ name: 'id', description: 'Monitor ID' })
  @ApiResponse({ status: 200, description: 'Dependencies returned.' })
  @ApiResponse({ status: 404, description: 'Monitor not found.' })
  listDependencies(@Req() req: { user: { id: string } }, @Param('id') id: string) {
    return this.crudService.listDependencies(req.user.id, id);
  }

  @Post(':id/dependencies/:dependsOnId')
  @HttpCode(200)
  @RequireScope(ApiKeyScope.WRITE)
  @ApiOperation({
    summary: 'Add a dependency to a monitor',
    description:
      'Mark another monitor as a dependency. Alerts on this monitor are suppressed while the dependency is down.',
  })
  @ApiParam({ name: 'id', description: 'Monitor ID' })
  @ApiParam({ name: 'dependsOnId', description: 'ID of the monitor this one depends on' })
  @ApiResponse({ status: 200, description: 'Dependency added.' })
  @ApiResponse({ status: 400, description: 'Self-dependency or circular dependency.' })
  @ApiResponse({ status: 404, description: 'Monitor not found.' })
  addDependency(
    @Req() req: { user: { id: string } },
    @Param('id') id: string,
    @Param('dependsOnId') dependsOnId: string,
  ) {
    return this.crudService.addDependency(req.user.id, id, dependsOnId);
  }

  @Delete(':id/dependencies/:dependsOnId')
  @RequireScope(ApiKeyScope.WRITE)
  @ApiOperation({ summary: 'Remove a dependency from a monitor' })
  @ApiParam({ name: 'id', description: 'Monitor ID' })
  @ApiParam({ name: 'dependsOnId', description: 'ID of the dependency to remove' })
  @ApiResponse({ status: 200, description: 'Dependency removed.' })
  @ApiResponse({ status: 404, description: 'Dependency not found.' })
  removeDependency(
    @Req() req: { user: { id: string } },
    @Param('id') id: string,
    @Param('dependsOnId') dependsOnId: string,
  ) {
    return this.crudService.removeDependency(req.user.id, id, dependsOnId);
  }

  // ─── Monitor Events (Timeline Annotations) ───────────────────────────

  @Get(':id/events')
  @RequireScope(ApiKeyScope.READ)
  @ApiOperation({
    summary: 'List monitor timeline events',
    description: 'Returns timestamped annotations pinned to this monitor timeline (deploys, notes, maintenance, etc.). Newest first, max 100.',
  })
  @ApiParam({ name: 'id', description: 'Monitor ID' })
  @ApiResponse({ status: 200, description: 'Events returned.' })
  @ApiResponse({ status: 404, description: 'Monitor not found.' })
  listEvents(@Req() req: { user: { id: string } }, @Param('id') id: string) {
    return this.crudService.listEvents(req.user.id, id);
  }

  @Post(':id/events')
  @RequireScope(ApiKeyScope.WRITE)
  @ApiOperation({
    summary: 'Create a monitor timeline event',
    description: 'Pin a timestamped annotation to this monitor\'s timeline. Useful for marking deploys, config changes, or incidents.',
  })
  @ApiParam({ name: 'id', description: 'Monitor ID' })
  @ApiResponse({ status: 201, description: 'Event created.' })
  @ApiResponse({ status: 404, description: 'Monitor not found.' })
  createEvent(
    @Req() req: { user: { id: string } },
    @Param('id') id: string,
    @Body() dto: CreateMonitorEventDto,
  ) {
    return this.crudService.createEvent(req.user.id, id, dto.message, dto.eventType ?? 'note');
  }

  @Delete(':id/events/:eventId')
  @RequireScope(ApiKeyScope.WRITE)
  @ApiOperation({ summary: 'Delete a monitor timeline event' })
  @ApiParam({ name: 'id', description: 'Monitor ID' })
  @ApiParam({ name: 'eventId', description: 'Event ID to delete' })
  @ApiResponse({ status: 200, description: 'Event deleted.' })
  @ApiResponse({ status: 404, description: 'Event not found.' })
  deleteEvent(
    @Req() req: { user: { id: string } },
    @Param('id') id: string,
    @Param('eventId') eventId: string,
  ) {
    return this.crudService.deleteEvent(req.user.id, id, eventId);
  }

  // ─── Security Advisories ─────────────────────────────────────────────

  @Get(':id/security')
  @RequireScope(ApiKeyScope.READ)
  @ApiOperation({
    summary: 'Security advisories for a version monitor',
    description:
      'Queries OSV.dev for known security vulnerabilities affecting the currently tracked version. ' +
      'Supports npm, PyPI, Cargo, GitHub repos. Returns up to 10 most recent advisories.',
  })
  @ApiParam({ name: 'id', description: 'Monitor ID' })
  @ApiResponse({ status: 200, description: 'Advisory list returned.' })
  @ApiResponse({ status: 404, description: 'Monitor not found.' })
  async securityAdvisories(
    @Req() req: { user: { id: string } },
    @Param('id') id: string,
  ) {
    const monitor = await this.prisma.monitor.findFirst({
      where: { id, userId: req.user.id },
      select: { id: true, type: true, target: true, configJson: true },
    });
    if (!monitor) throw new NotFoundException('Monitor not found');

    const config = (monitor.configJson as Record<string, unknown> | null) ?? {};
    const provider = String(config['provider'] ?? '').toLowerCase();
    const target = String(config['target'] ?? monitor.target ?? '').trim();

    let ecosystem: string | null = null;
    let packageName: string | null = null;

    if (provider === 'npm') {
      ecosystem = 'npm';
      packageName = target;
    } else if (provider === 'pypi') {
      ecosystem = 'PyPI';
      packageName = target;
    } else if (provider === 'cargo') {
      ecosystem = 'crates.io';
      packageName = target;
    } else if (provider === 'github' && target.includes('/')) {
      ecosystem = 'GitHub Actions';
      const parts = target.replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/, '').split('/');
      if (parts.length >= 2) {
        packageName = `${parts[0]}/${parts[1]}`;
      }
    }

    if (!ecosystem || !packageName) {
      return {
        supported: false,
        reason: 'Security advisories are available for npm, PyPI, Cargo, and GitHub monitors.',
        advisories: [],
      };
    }

    try {
      const osvBody: Record<string, unknown> = {
        package: { name: packageName, ecosystem },
      };

      const osvResp = await fetch('https://api.osv.dev/v1/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(osvBody),
        signal: AbortSignal.timeout(8000),
      });

      if (!osvResp.ok) {
        return { supported: true, source: 'osv.dev', advisories: [], error: `OSV API returned ${osvResp.status}` };
      }

      const osvData = await osvResp.json() as {
        vulns?: Array<{
          id: string;
          summary?: string;
          details?: string;
          severity?: Array<{ type: string; score: string }>;
          affected?: Array<{ ranges?: Array<{ type: string; events?: Array<{ introduced?: string; fixed?: string }> }> }>;
          published?: string;
          modified?: string;
          references?: Array<{ type: string; url: string }>;
          aliases?: string[];
        }>;
      };

      const vulns = (osvData.vulns ?? []).slice(0, 10);

      return {
        supported: true,
        source: 'osv.dev',
        total: osvData.vulns?.length ?? 0,
        advisories: vulns.map((v) => {
          const cvss = v.severity?.find((s) => s.type === 'CVSS_V3')?.score ?? v.severity?.[0]?.score ?? null;
          const cveId = v.aliases?.find((a) => a.startsWith('CVE-')) ?? null;
          const fixedInRef = v.affected?.[0]?.ranges?.[0]?.events?.find((e) => e.fixed);
          return {
            id: v.id,
            cveId,
            summary: v.summary ?? null,
            cvss,
            publishedAt: v.published ?? null,
            fixedIn: fixedInRef?.fixed ?? null,
            url: v.references?.find((r) => r.type === 'ADVISORY' || r.type === 'WEB')?.url ?? `https://osv.dev/vulnerability/${v.id}`,
          };
        }),
      };
    } catch {
      return { supported: true, source: 'osv.dev', advisories: [], error: 'Failed to query OSV API' };
    }
  }

  // ─── Release Notes ────────────────────────────────────────────────────

  @Get(':id/release-notes')
  @RequireScope(ApiKeyScope.READ)
  @ApiOperation({
    summary: 'Fetch release notes for a version monitor',
    description:
      'For GitHub-backed version monitors: fetches the release notes (body) of the latest release tag. Returns null for non-GitHub or non-version monitors.',
  })
  @ApiParam({ name: 'id', description: 'Monitor ID' })
  @ApiQuery({ name: 'version', required: false, description: 'Specific version tag to fetch notes for (defaults to latest)' })
  @ApiResponse({ status: 200, description: 'Release notes returned (or null if unavailable).' })
  @ApiResponse({ status: 404, description: 'Monitor not found.' })
  async releaseNotes(
    @Req() req: { user: { id: string } },
    @Param('id') id: string,
    @Query('version') version?: string,
  ) {
    const monitor = await this.prisma.monitor.findFirst({
      where: { id, userId: req.user.id },
      select: { id: true, type: true, target: true, configJson: true },
    });
    if (!monitor) throw new NotFoundException('Monitor not found');

    const config = (monitor.configJson as Record<string, unknown> | null) ?? {};
    const provider = String(config['provider'] ?? '');

    if (!['github'].includes(provider) || !['GIT_RELEASE', 'DOCKER_IMAGE'].includes(monitor.type)) {
      return { available: false, reason: 'Release notes are only available for GitHub version monitors.' };
    }

    const target2 = String(config['target'] ?? monitor.target ?? '').trim();
    const parts = target2.replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/, '').split('/');
    if (parts.length < 2) {
      return { available: false, reason: 'Cannot parse repository from monitor target.' };
    }
    const [owner, repo] = parts;

    const token = config['token'] ? String(config['token']) : (process.env.GITHUB_TOKEN ?? '');
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    try {
      let releaseUrl: string;
      if (version) {
        releaseUrl = `https://api.github.com/repos/${owner}/${repo}/releases/tags/${encodeURIComponent(version)}`;
      } else {
        releaseUrl = `https://api.github.com/repos/${owner}/${repo}/releases/latest`;
      }

      const resp = await fetch(releaseUrl, { headers });
      if (!resp.ok) {
        return { available: false, reason: `GitHub API returned ${resp.status}` };
      }

      const release = await resp.json() as {
        tag_name?: string;
        name?: string;
        body?: string;
        published_at?: string;
        html_url?: string;
        prerelease?: boolean;
        assets?: Array<{ name: string; download_count: number; size: number; browser_download_url: string }>;
      };

      return {
        available: true,
        version: release.tag_name ?? null,
        releaseName: release.name ?? null,
        body: release.body ? release.body.slice(0, 10000) : null,
        publishedAt: release.published_at ?? null,
        url: release.html_url ?? null,
        prerelease: release.prerelease ?? false,
        assetCount: release.assets?.length ?? 0,
      };
    } catch {
      return { available: false, reason: 'Failed to fetch release notes from GitHub.' };
    }
  }

  // ─── Linked Incidents ─────────────────────────────────────────────────

  @Get(':id/incidents')
  @RequireScope(ApiKeyScope.READ)
  @ApiOperation({
    summary: 'Incidents linked to a monitor',
    description: 'Returns all formal incidents that reference this monitor, ordered by most recent first.',
  })
  @ApiParam({ name: 'id', description: 'Monitor ID' })
  @ApiQuery({ name: 'limit', required: false, description: 'Max incidents to return (1-100, default 20)' })
  @ApiResponse({ status: 200, description: 'Incidents returned.' })
  @ApiResponse({ status: 404, description: 'Monitor not found.' })
  async monitorIncidents(
    @Req() req: { user: { id: string } },
    @Param('id') id: string,
    @Query('limit') limit?: string,
  ) {
    const monitor = await this.prisma.monitor.findFirst({ where: { id, userId: req.user.id }, select: { id: true } });
    if (!monitor) throw new NotFoundException('Monitor not found');

    const take = Math.min(100, Math.max(1, parseInt(limit ?? '20', 10) || 20));

    const links = await this.prisma.incidentMonitor.findMany({
      where: { monitorId: id },
      include: {
        incident: {
          select: {
            id: true,
            title: true,
            status: true,
            severity: true,
            createdAt: true,
            resolvedAt: true,
            autoCreated: true,
          },
        },
      },
      orderBy: { incident: { createdAt: 'desc' } },
      take,
    });

    return {
      total: links.length,
      incidents: links.map((l) => ({
        id: l.incident.id,
        title: l.incident.title,
        status: l.incident.status,
        severity: l.incident.severity,
        autoCreated: l.incident.autoCreated,
        createdAt: l.incident.createdAt,
        resolvedAt: l.incident.resolvedAt,
        durationSec: l.incident.resolvedAt
          ? Math.floor((new Date(l.incident.resolvedAt).getTime() - new Date(l.incident.createdAt).getTime()) / 1000)
          : null,
      })),
    };
  }

  // ─── Certificate Details ─────────────────────────────────────────────

  @Get(':id/certificate')
  @RequireScope(ApiKeyScope.READ)
  @ApiOperation({
    summary: 'Live TLS certificate details for a monitor',
    description:
      'Fetches the live TLS certificate for the monitor target. Works for HTTP and SSL_CERT monitors. ' +
      'Returns subject, issuer, SANs, validity dates, days remaining, fingerprint, and TLS protocol.',
  })
  @ApiParam({ name: 'id', description: 'Monitor ID' })
  @ApiResponse({ status: 200, description: 'Certificate details returned.' })
  @ApiResponse({ status: 400, description: 'Monitor type does not support certificate inspection.' })
  @ApiResponse({ status: 404, description: 'Monitor not found.' })
  async certificateDetails(
    @Req() req: { user: { id: string } },
    @Param('id') id: string,
  ) {
    const monitor = await this.prisma.monitor.findFirst({
      where: { id, userId: req.user.id },
      select: { id: true, type: true, target: true, timeoutMs: true },
    });
    if (!monitor) throw new NotFoundException('Monitor not found');

    const supportedTypes = ['HTTP', 'SSL_CERT', 'BROWSER'];
    if (!supportedTypes.includes(monitor.type)) {
      return {
        supported: false,
        reason: `Certificate inspection is only available for HTTP and SSL_CERT monitors (got ${monitor.type}).`,
      };
    }

    let hostname: string;
    try {
      const raw = monitor.target.startsWith('http') ? monitor.target : `https://${monitor.target}`;
      hostname = new URL(raw).hostname;
    } catch {
      return { supported: false, reason: 'Cannot parse hostname from monitor target.' };
    }

    const timeoutMs = Math.min(monitor.timeoutMs ?? 10000, 15000);
    const started = Date.now();

    return new Promise<Record<string, unknown>>((resolve) => {
      const socket = tls.connect(
        { host: hostname, port: 443, servername: hostname, rejectUnauthorized: false, timeout: timeoutMs },
        () => {
          const cert = socket.getPeerCertificate(true);
          const protocol = socket.getProtocol() ?? null;
          const cipher = socket.getCipher();
          socket.end();

          const latencyMs = Date.now() - started;

          if (!cert || !cert.valid_to) {
            resolve({ supported: true, available: false, reason: 'Certificate metadata unavailable', latencyMs });
            return;
          }

          const validFrom = new Date(cert.valid_from);
          const validTo = new Date(cert.valid_to);
          const daysRemaining = Math.floor((validTo.getTime() - Date.now()) / (24 * 60 * 60 * 1000));

          const subjectCN = Array.isArray(cert.subject?.CN) ? cert.subject.CN[0] : (cert.subject?.CN ?? null);
          const subjectO = Array.isArray(cert.subject?.O) ? cert.subject.O[0] : (cert.subject?.O ?? null);
          const issuerCN = Array.isArray(cert.issuer?.CN) ? cert.issuer.CN[0] : (cert.issuer?.CN ?? null);
          const issuerO = Array.isArray(cert.issuer?.O) ? cert.issuer.O[0] : (cert.issuer?.O ?? null);

          const sanString = (cert.subjectaltname ?? '') as string;
          const sans = sanString
            ? sanString.split(', ').map((s) => s.replace(/^DNS:|^IP Address:/i, '').trim()).filter(Boolean)
            : [];

          const fingerprint = cert.fingerprint256 ?? cert.fingerprint ?? null;
          const serialNumber = cert.serialNumber ?? null;
          const keyUsage = cert.ext_key_usage ? (cert.ext_key_usage as string[]) : [];
          const isCA = !!(cert.issuerCertificate && cert.issuerCertificate !== cert);

          const grade =
            daysRemaining < 0 ? 'expired' :
            daysRemaining <= 7 ? 'critical' :
            daysRemaining <= 30 ? 'warning' :
            protocol?.startsWith('TLSv1.3') || protocol?.startsWith('TLSv1.2') ? 'good' :
            'fair';

          resolve({
            supported: true,
            available: true,
            latencyMs,
            hostname,
            subject: { CN: subjectCN, O: subjectO },
            issuer: { CN: issuerCN, O: issuerO },
            sans,
            validFrom: validFrom.toISOString(),
            validTo: validTo.toISOString(),
            daysRemaining,
            fingerprint,
            serialNumber,
            keyUsage,
            protocol,
            cipher: cipher ? { name: cipher.name, version: cipher.version } : null,
            isChained: isCA,
            grade,
            status: daysRemaining < 0 ? 'expired' : daysRemaining <= 7 ? 'critical' : daysRemaining <= 30 ? 'expiring' : 'valid',
          });
        },
      );

      socket.setTimeout(timeoutMs, () => {
        socket.destroy();
        resolve({ supported: true, available: false, reason: 'TLS connection timed out', latencyMs: Date.now() - started });
      });

      socket.on('error', (err) => {
        resolve({ supported: true, available: false, reason: err.message, latencyMs: Date.now() - started });
      });
    });
  }

  // ─── Response Body Diff ───────────────────────────────────────────────

  @Get(':id/response-diff')
  @RequireScope(ApiKeyScope.READ)
  @ApiOperation({
    summary: 'Get response body diff for a failing run',
    description: 'Returns the response bodies of a failing run and the most recent passing run before it, for client-side diff display.',
  })
  @ApiParam({ name: 'id', description: 'Monitor ID' })
  @ApiQuery({ name: 'runId', required: true, description: 'ID of the failing run to compare' })
  @ApiQuery({ name: 'baseRunId', required: false, description: 'ID of the baseline (passing) run. If omitted, finds the most recent OK run before the failing run.' })
  @ApiResponse({
    status: 200,
    description: 'Diff bodies returned.',
    schema: {
      example: {
        failedBody: '{"status":"error"}',
        baseBody: '{"status":"ok"}',
        runId: 'run-abc',
        baseRunId: 'run-xyz',
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Monitor or run not found.' })
  getResponseDiff(
    @Req() req: { user: { id: string } },
    @Param('id') id: string,
    @Query('runId') runId: string,
    @Query('baseRunId') baseRunId?: string,
  ) {
    return this.crudService.getResponseDiff(req.user.id, id, runId, baseRunId);
  }

  // ─── Config History ───────────────────────────────────────────────────

  @Get(':id/config-history')
  @RequireScope(ApiKeyScope.READ)
  @ApiOperation({
    summary: 'Get config change history for a monitor',
    description:
      'Returns a field-level audit trail of all configuration changes made to a monitor. Newest entries first. Each entry includes changed fields with before/after values and a human-readable summary.',
  })
  @ApiParam({ name: 'id', description: 'Monitor ID' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Max entries to return (default 50, max 200)' })
  @ApiResponse({ status: 200, description: 'Config change history entries, newest first.' })
  @ApiResponse({ status: 404, description: 'Monitor not found.' })
  getConfigHistory(
    @Req() req: { user: { id: string } },
    @Param('id') id: string,
    @Query('limit') limit?: string,
  ) {
    return this.crudService.getConfigHistory(req.user.id, id, limit ? parseInt(limit, 10) : 50);
  }
}

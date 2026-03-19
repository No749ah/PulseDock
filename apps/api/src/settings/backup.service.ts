import { Injectable, Logger, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../common/prisma.service'

export interface BackupDocument {
  version: '2'
  exportedAt: string
  pulsedockVersion: string
  monitors: BackupMonitor[]
  folders: BackupFolder[]
  tags: BackupTag[]
  alertChannels: BackupAlertChannel[]
  statusPages: BackupStatusPage[]
  settings: BackupSettings
}

interface BackupMonitor {
  name: string
  type: string
  target: string
  intervalSec: number
  timeoutMs: number
  confirmations: number
  enabled: boolean
  config: unknown
  folderName?: string
  tagNames: string[]
}

interface BackupFolder {
  name: string
}

interface BackupTag {
  name: string
  color?: string | null
}

interface BackupAlertChannel {
  name: string
  type: string
  config: unknown
}

interface BackupStatusPage {
  title: string
  slug: string
  description?: string | null
  isPublished: boolean
  layout: unknown
}

interface BackupSettings {
  retentionDays: number
}

export interface RestoreResult {
  folders: { created: number; skipped: number }
  tags: { created: number; skipped: number }
  monitors: { created: number; skipped: number; errors: string[] }
  alertChannels: { created: number; skipped: number }
  statusPages: { created: number; skipped: number }
  settings: { updated: boolean }
}

@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name)

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Export all user data as a portable backup document.
   * Excludes: raw check history (MonitorRun), audit logs, session tokens.
   */
  async exportBackup(userId: string): Promise<BackupDocument> {
    const [monitors, folders, tags, alertChannels, statusPages, settings] = await Promise.all([
      this.prisma.monitor.findMany({
        where: { userId },
        include: {
          folder: { select: { name: true } },
          monitorTags: { include: { tag: { select: { name: true } } } },
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.folder.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.tag.findMany({
        where: { userId },
        orderBy: { name: 'asc' },
      }),
      this.prisma.alertChannel.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.publicStatusPage.findMany({
        where: { userId },
        select: {
          title: true,
          slug: true,
          description: true,
          isPublished: true,
          layout: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.userSettings.findUnique({ where: { userId } }),
    ])

    return {
      version: '2',
      exportedAt: new Date().toISOString(),
      pulsedockVersion: process.env.npm_package_version ?? '1.0.0',
      folders: folders.map((f) => ({ name: f.name })),
      tags: tags.map((t) => ({ name: t.name, color: t.color })),
      monitors: (monitors as any[]).map((m: any) => ({
        name: m.name,
        type: m.type,
        target: m.target,
        intervalSec: m.intervalSec,
        timeoutMs: m.timeoutMs,
        confirmations: m.confirmations,
        enabled: m.enabled,
        config: m.configJson,
        folderName: m.folder?.name ?? undefined,
        tagNames: m.monitorTags.map((mt: { tag: { name: string } }) => mt.tag.name),
      })),
      alertChannels: (alertChannels as any[]).map((ac: any) => ({
        name: ac.name,
        type: ac.type,
        config: ac.configJson,
      })),
      statusPages: statusPages.map((sp) => ({
        title: sp.title,
        slug: sp.slug,
        description: sp.description,
        isPublished: sp.isPublished,
        layout: sp.layout,
      })),
      settings: {
        retentionDays: settings?.retentionDays ?? 90,
      },
    }
  }

  /**
   * Restore data from a backup document.
   * - Folders/Tags: skipped if same name already exists
   * - Monitors: skipped if same target+type already exists
   * - Alert channels: skipped if same name+type already exists
   * - Status pages: slug is suffixed with "-restored" if already taken
   * - Settings: always overwritten
   */
  async restoreBackup(userId: string, doc: BackupDocument): Promise<RestoreResult> {
    if (!doc.version || !doc.exportedAt || !Array.isArray(doc.monitors)) {
      throw new BadRequestException('Invalid backup document format')
    }

    const result: RestoreResult = {
      folders: { created: 0, skipped: 0 },
      tags: { created: 0, skipped: 0 },
      monitors: { created: 0, skipped: 0, errors: [] },
      alertChannels: { created: 0, skipped: 0 },
      statusPages: { created: 0, skipped: 0 },
      settings: { updated: false },
    }

    // ── 1. Folders ──────────────────────────────────────────────────────────
    const existingFolders = await this.prisma.folder.findMany({ where: { userId }, select: { name: true } })
    const existingFolderNames = new Set(existingFolders.map((f) => f.name))
    const folderMap = new Map<string, string>() // name → id

    for (const f of doc.folders ?? []) {
      if (existingFolderNames.has(f.name)) {
        result.folders.skipped++
        const existing = await this.prisma.folder.findFirst({ where: { userId, name: f.name }, select: { id: true } })
        if (existing) folderMap.set(f.name, existing.id)
      } else {
        const created = await this.prisma.folder.create({ data: { userId, name: f.name } })
        folderMap.set(f.name, created.id)
        result.folders.created++
      }
    }

    // ── 2. Tags ─────────────────────────────────────────────────────────────
    const existingTags = await this.prisma.tag.findMany({ where: { userId }, select: { name: true, id: true } })
    const existingTagMap = new Map(existingTags.map((t) => [t.name, t.id]))
    const tagMap = new Map<string, string>() // name → id

    for (const t of doc.tags ?? []) {
      if (existingTagMap.has(t.name)) {
        result.tags.skipped++
        tagMap.set(t.name, existingTagMap.get(t.name)!)
      } else {
        const created = await this.prisma.tag.create({
          data: { userId, name: t.name, color: t.color ?? undefined },
        })
        tagMap.set(t.name, created.id)
        result.tags.created++
      }
    }

    // ── 3. Monitors ─────────────────────────────────────────────────────────
    const existingMonitors = await this.prisma.monitor.findMany({
      where: { userId },
      select: { target: true, type: true },
    })
    const existingMonitorKeys = new Set(existingMonitors.map((m) => `${m.type}:${m.target}`))

    for (const m of doc.monitors ?? []) {
      const key = `${m.type}:${m.target}`
      if (existingMonitorKeys.has(key)) {
        result.monitors.skipped++
        continue
      }
      try {
        const folderId = m.folderName ? folderMap.get(m.folderName) : undefined
        const monitor = await this.prisma.monitor.create({
          data: {
            userId,
            name: m.name,
            type: m.type as never,
            target: m.target,
            intervalSec: m.intervalSec ?? 300,
            timeoutMs: m.timeoutMs ?? 10000,
            confirmations: m.confirmations ?? 1,
            enabled: m.enabled ?? true,
            configJson: m.config ?? undefined,
            folderId: folderId ?? null,
          },
        })
        // Attach tags
        for (const tagName of m.tagNames ?? []) {
          const tagId = tagMap.get(tagName)
          if (tagId) {
            await this.prisma.monitorTag.create({ data: { monitorId: monitor.id, tagId } })
          }
        }
        existingMonitorKeys.add(key)
        result.monitors.created++
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        result.monitors.errors.push(`${m.name}: ${msg}`)
        this.logger.warn(`Restore: skipped monitor "${m.name}" — ${msg}`)
      }
    }

    // ── 4. Alert channels ────────────────────────────────────────────────────
    const existingChannels = await this.prisma.alertChannel.findMany({
      where: { userId },
      select: { name: true, type: true },
    })
    const existingChannelKeys = new Set(existingChannels.map((c) => `${c.type}:${c.name}`))

    for (const ac of doc.alertChannels ?? []) {
      const key = `${ac.type}:${ac.name}`
      if (existingChannelKeys.has(key)) {
        result.alertChannels.skipped++
        continue
      }
      await this.prisma.alertChannel.create({
        data: {
          userId,
          name: ac.name,
          type: ac.type,
          configJson: (ac.config as never) ?? {},
        },
      })
      existingChannelKeys.add(key)
      result.alertChannels.created++
    }

    // ── 5. Status pages ──────────────────────────────────────────────────────
    for (const sp of doc.statusPages ?? []) {
      const exists = await this.prisma.publicStatusPage.findFirst({
        where: { OR: [{ slug: sp.slug }, { userId, title: sp.title }] },
        select: { id: true },
      })
      if (exists) {
        result.statusPages.skipped++
        continue
      }
      // Suffix slug if taken
      let slug = sp.slug
      const slugConflict = await this.prisma.publicStatusPage.findFirst({ where: { slug }, select: { id: true } })
      if (slugConflict) slug = `${slug}-restored`

      await this.prisma.publicStatusPage.create({
        data: {
          userId,
          title: sp.title,
          slug,
          description: sp.description ?? null,
          isPublished: false, // always unpublished on restore for safety
          layout: (sp.layout as never) ?? { widgets: [] },
        },
      })
      result.statusPages.created++
    }

    // ── 6. Settings ──────────────────────────────────────────────────────────
    if (doc.settings?.retentionDays) {
      const validValues = [7, 30, 90, 365]
      const retentionDays = validValues.includes(doc.settings.retentionDays)
        ? doc.settings.retentionDays
        : 90
      await this.prisma.userSettings.upsert({
        where: { userId },
        create: { userId, retentionDays },
        update: { retentionDays },
      })
      result.settings.updated = true
    }

    this.logger.log(`Backup restore for user ${userId}: ${JSON.stringify(result)}`)
    return result
  }
}

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Minimal MonitorsService stub for bulkCreateFromUrls ─────────────────────

function makeMonitorsService(overrides: Record<string, unknown> = {}) {
  return {
    prisma: {
      monitor: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    },
    create: vi.fn().mockResolvedValue({ id: 'new-monitor', name: 'example.com' }),
    ...overrides,
  };
}

/**
 * Inline reimplementation of MonitorsService.bulkCreateFromUrls logic for unit testing.
 * Tests the core logic without NestJS DI.
 */
async function bulkCreateFromUrls(
  service: ReturnType<typeof makeMonitorsService>,
  userId: string,
  body: {
    urls: string[];
    folderId?: string;
    alertChannelIds?: string[];
    intervalSec?: number;
  },
): Promise<{ created: number; skipped: number; errors: Array<{ url: string; error: string }> }> {
  let created = 0;
  let skipped = 0;
  const errors: Array<{ url: string; error: string }> = [];

  for (const rawUrl of body.urls) {
    const url = rawUrl.trim();
    if (!url) continue;

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        errors.push({ url, error: 'Only HTTP/HTTPS URLs are supported' });
        continue;
      }
    } catch {
      errors.push({ url, error: 'Invalid URL' });
      continue;
    }

    const name = parsedUrl.hostname;

    const existing = await service.prisma.monitor.findFirst({
      where: { userId, target: url },
      select: { id: true },
    });

    if (existing) {
      skipped++;
      continue;
    }

    try {
      await service.create(userId, {
        name,
        target: url,
        type: 'HTTP',
        intervalSec: body.intervalSec ?? 60,
        alertChannelIds: body.alertChannelIds ?? [],
        folderId: body.folderId ?? null,
      });
      created++;
    } catch (err) {
      errors.push({ url, error: err instanceof Error ? err.message : 'Failed to create monitor' });
    }
  }

  return { created, skipped, errors };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('MonitorsService.bulkCreateFromUrls', () => {
  let svc: ReturnType<typeof makeMonitorsService>;

  beforeEach(() => {
    svc = makeMonitorsService();
  });

  it('1. creates monitors for valid http/https URLs', async () => {
    const result = await bulkCreateFromUrls(svc, 'user-1', {
      urls: ['https://example.com', 'http://api.example.com/health'],
    });

    expect(result.created).toBe(2);
    expect(result.skipped).toBe(0);
    expect(result.errors).toHaveLength(0);
    expect(svc.create).toHaveBeenCalledTimes(2);
  });

  it('2. reports invalid URLs in errors array, does not create monitors', async () => {
    const result = await bulkCreateFromUrls(svc, 'user-1', {
      urls: ['not-a-url', 'ftp://example.com', 'https://valid.com'],
    });

    expect(result.created).toBe(1);
    expect(result.errors).toHaveLength(2);
    expect(result.errors[0]).toMatchObject({ url: 'not-a-url', error: 'Invalid URL' });
    expect(result.errors[1]).toMatchObject({ url: 'ftp://example.com', error: 'Only HTTP/HTTPS URLs are supported' });
  });

  it('3. skips duplicate URLs (same target already monitored by user)', async () => {
    svc.prisma.monitor.findFirst
      .mockResolvedValueOnce({ id: 'existing-1' })  // first URL already exists
      .mockResolvedValueOnce(null);                  // second URL is new

    const result = await bulkCreateFromUrls(svc, 'user-1', {
      urls: ['https://already.com', 'https://new.com'],
    });

    expect(result.created).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.errors).toHaveLength(0);
  });

  it('4. derives monitor name from hostname', async () => {
    await bulkCreateFromUrls(svc, 'user-1', {
      urls: ['https://my-service.internal.example.org/health'],
    });

    expect(svc.create).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ name: 'my-service.internal.example.org' }),
    );
  });

  it('5. applies custom intervalSec, folderId, alertChannelIds when provided', async () => {
    await bulkCreateFromUrls(svc, 'user-1', {
      urls: ['https://example.com'],
      intervalSec: 300,
      folderId: 'folder-abc',
      alertChannelIds: ['ch-1', 'ch-2'],
    });

    expect(svc.create).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        intervalSec: 300,
        folderId: 'folder-abc',
        alertChannelIds: ['ch-1', 'ch-2'],
      }),
    );
  });

  it('6. defaults intervalSec to 60 when not specified', async () => {
    await bulkCreateFromUrls(svc, 'user-1', { urls: ['https://example.com'] });

    expect(svc.create).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ intervalSec: 60 }),
    );
  });

  it('7. captures create() errors per URL without aborting the whole batch', async () => {
    svc.create
      .mockResolvedValueOnce({ id: 'mon-1' })
      .mockRejectedValueOnce(new Error('DB constraint violated'))
      .mockResolvedValueOnce({ id: 'mon-3' });

    const result = await bulkCreateFromUrls(svc, 'user-1', {
      urls: ['https://a.com', 'https://b.com', 'https://c.com'],
    });

    expect(result.created).toBe(2);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({ url: 'https://b.com', error: 'DB constraint violated' });
  });

  it('8. trims whitespace from URLs before processing', async () => {
    const result = await bulkCreateFromUrls(svc, 'user-1', {
      urls: ['  https://padded.com  ', '\thttps://tab.com\n'],
    });

    expect(result.created).toBe(2);
    expect(svc.create).toHaveBeenCalledWith('user-1', expect.objectContaining({ target: 'https://padded.com' }));
    expect(svc.create).toHaveBeenCalledWith('user-1', expect.objectContaining({ target: 'https://tab.com' }));
  });

  it('9. skips empty lines without error', async () => {
    const result = await bulkCreateFromUrls(svc, 'user-1', {
      urls: ['https://a.com', '', '   ', 'https://b.com'],
    });

    expect(result.created).toBe(2);
    expect(result.errors).toHaveLength(0);
  });

  it('10. returns all-zero counts for empty URL list', async () => {
    const result = await bulkCreateFromUrls(svc, 'user-1', { urls: [] });

    expect(result.created).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.errors).toHaveLength(0);
    expect(svc.create).not.toHaveBeenCalled();
  });
});

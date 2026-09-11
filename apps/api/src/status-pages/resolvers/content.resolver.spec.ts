import { describe, it, expect } from 'vitest';
import { resolveContentWidget } from './content.resolver';
import type { Widget } from '../status-pages.types';

// ── helpers ──────────────────────────────────────────────────────────────────

// Most content resolver cases don't need prisma/cache/userId
const noop = {} as never;

function makeWidget(type: string, config: Record<string, unknown> = {}): Widget {
  return {
    id: `w-${type}`,
    type: type as Widget['type'],
    x: 0, y: 0, w: 3, h: 2,
    config,
  };
}

// ── announcement-bar ─────────────────────────────────────────────────────────

describe('content resolver — announcement-bar', () => {
  it('returns message, type, and dismissable flag', async () => {
    const widget = makeWidget('announcement-bar', {
      message: 'System maintenance tonight',
      type: 'warning',
      dismissable: true,
    });
    const result = await resolveContentWidget(noop, noop, 'user1', widget, undefined);
    expect(result.message).toBe('System maintenance tonight');
    expect(result.type).toBe('warning');
    expect(result.dismissable).toBe(true);
    expect(result.expired).toBe(false);
  });

  it('defaults type to "info" and dismissable to false', async () => {
    const widget = makeWidget('announcement-bar', { message: 'Hello' });
    const result = await resolveContentWidget(noop, noop, 'user1', widget, undefined);
    expect(result.type).toBe('info');
    expect(result.dismissable).toBe(false);
  });

  it('marks expired=true when expiresAt is in the past', async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const widget = makeWidget('announcement-bar', { message: 'Old announcement', expiresAt: past });
    const result = await resolveContentWidget(noop, noop, 'user1', widget, undefined);
    expect(result.expired).toBe(true);
  });

  it('marks expired=false when expiresAt is in the future', async () => {
    const future = new Date(Date.now() + 3_600_000).toISOString();
    const widget = makeWidget('announcement-bar', { message: 'Upcoming', expiresAt: future });
    const result = await resolveContentWidget(noop, noop, 'user1', widget, undefined);
    expect(result.expired).toBe(false);
  });

  it('returns fetchedAt timestamp', async () => {
    const widget = makeWidget('announcement-bar', { message: 'x' });
    const result = await resolveContentWidget(noop, noop, 'user1', widget, undefined);
    expect(typeof result.fetchedAt).toBe('string');
    expect(new Date(result.fetchedAt as string).getTime()).toBeGreaterThan(0);
  });
});

// ── link-list ────────────────────────────────────────────────────────────────

describe('content resolver — link-list', () => {
  it('returns links array from config', async () => {
    const links = [
      { label: 'Docs', url: 'https://docs.example.com', icon: 'book' },
      { label: 'Status', url: 'https://status.example.com', icon: 'activity' },
    ];
    const widget = makeWidget('link-list', { links });
    const result = await resolveContentWidget(noop, noop, 'user1', widget, undefined);
    expect(result.links).toEqual(links);
  });

  it('returns empty array when links not configured', async () => {
    const widget = makeWidget('link-list', {});
    const result = await resolveContentWidget(noop, noop, 'user1', widget, undefined);
    expect(result.links).toEqual([]);
  });
});

// ── faq-accordion ────────────────────────────────────────────────────────────

describe('content resolver — faq-accordion', () => {
  it('returns items array from config', async () => {
    const items = [
      { question: 'What is this?', answer: 'A status page.' },
      { question: 'How to contact?', answer: 'Email us.' },
    ];
    const widget = makeWidget('faq-accordion', { items });
    const result = await resolveContentWidget(noop, noop, 'user1', widget, undefined);
    expect(result.items).toEqual(items);
  });

  it('returns empty array when items not configured', async () => {
    const widget = makeWidget('faq-accordion', {});
    const result = await resolveContentWidget(noop, noop, 'user1', widget, undefined);
    expect(result.items).toEqual([]);
  });
});

// ── social-links ─────────────────────────────────────────────────────────────

describe('content resolver — social-links', () => {
  it('returns social links from config', async () => {
    const socialLinks = [
      { platform: 'github', url: 'https://github.com/example' },
      { platform: 'twitter', url: 'https://twitter.com/example' },
    ];
    const widget = makeWidget('social-links', { socialLinks });
    const result = await resolveContentWidget(noop, noop, 'user1', widget, undefined);
    expect(result.links).toEqual(socialLinks);
  });

  it('returns empty array when social links not configured', async () => {
    const widget = makeWidget('social-links', {});
    const result = await resolveContentWidget(noop, noop, 'user1', widget, undefined);
    expect(result.links).toEqual([]);
  });
});

// ── embed-iframe ─────────────────────────────────────────────────────────────

describe('content resolver — embed-iframe', () => {
  it('returns _noConfig when url is missing', async () => {
    const widget = makeWidget('embed-iframe', { height: 400 });
    const result = await resolveContentWidget(noop, noop, 'user1', widget, undefined);
    expect(result._noConfig).toBe(true);
  });

  it('returns url, height, title and sandbox from config', async () => {
    const widget = makeWidget('embed-iframe', {
      url: 'https://grafana.example.com/panel',
      height: 600,
      title: 'Grafana Panel',
      sandbox: 'allow-scripts',
    });
    const result = await resolveContentWidget(noop, noop, 'user1', widget, undefined);
    expect(result.url).toBe('https://grafana.example.com/panel');
    expect(result.height).toBe(600);
    expect(result.title).toBe('Grafana Panel');
    expect(result.sandbox).toBe('allow-scripts');
  });

  it('defaults height to 400 and sandbox to allow-scripts allow-same-origin', async () => {
    const widget = makeWidget('embed-iframe', { url: 'https://example.com' });
    const result = await resolveContentWidget(noop, noop, 'user1', widget, undefined);
    expect(result.height).toBe(400);
    expect(result.sandbox).toBe('allow-scripts allow-same-origin');
  });
});

// ── subscriber-form ──────────────────────────────────────────────────────────

describe('content resolver — subscriber-form', () => {
  it('returns default subscriber form content', async () => {
    const widget = makeWidget('subscriber-form', {});
    const result = await resolveContentWidget(noop, noop, 'user1', widget, undefined);
    expect(result.title).toBe('Subscribe to Updates');
    expect(result.description).toContain('notified');
    expect(result.buttonText).toBe('Subscribe');
    expect(result.successMessage).toContain('subscribed');
  });

  it('uses custom content when provided', async () => {
    const widget = makeWidget('subscriber-form', {
      title: 'Get Alerts',
      description: 'Sign up below',
      buttonText: 'Sign Up',
      successMessage: 'Done!',
    });
    const result = await resolveContentWidget(noop, noop, 'user1', widget, undefined);
    expect(result.title).toBe('Get Alerts');
    expect(result.description).toBe('Sign up below');
    expect(result.buttonText).toBe('Sign Up');
    expect(result.successMessage).toBe('Done!');
  });
});

// ── text-block / image-banner / video-embed / code-block ─────────────────────
// These are pass-through widgets: the resolver returns { widgetType, config, fetchedAt }.
// Tests verify the shape and that the config is passed through correctly.

describe('content resolver — pass-through widgets (text-block, image-banner, video-embed, code-block)', () => {
  const passThroughTypes = ['text-block', 'image-banner', 'video-embed', 'code-block'];

  for (const type of passThroughTypes) {
    it(`${type}: returns { widgetType, config, fetchedAt }`, async () => {
      const config = { key: 'value', nested: { a: 1 } };
      const widget = makeWidget(type, config);
      const result = await resolveContentWidget(noop, noop, 'user1', widget, undefined);
      expect(result.widgetType).toBe(type);
      expect(result.config).toEqual(config);
      expect(typeof result.fetchedAt).toBe('string');
    });
  }

  it('text-block: config includes text + markdown properties', async () => {
    const widget = makeWidget('text-block', { text: '# Hello', markdown: true });
    const result = await resolveContentWidget(noop, noop, 'user1', widget, undefined);
    expect((result.config as Record<string, unknown>).text).toBe('# Hello');
    expect((result.config as Record<string, unknown>).markdown).toBe(true);
  });

  it('image-banner: config includes url and alt', async () => {
    const widget = makeWidget('image-banner', { url: 'https://example.com/banner.png', alt: 'Logo' });
    const result = await resolveContentWidget(noop, noop, 'user1', widget, undefined);
    expect((result.config as Record<string, unknown>).url).toBe('https://example.com/banner.png');
    expect((result.config as Record<string, unknown>).alt).toBe('Logo');
  });
});

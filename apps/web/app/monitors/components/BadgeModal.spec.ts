import { describe, it, expect } from 'vitest';

// Pure string-generation helpers mirroring BadgeModal component logic

function buildMarkdownBadge(name: string, badgeBase: string, id: string): string {
  return `![${name}](${badgeBase}/${id}.svg)`;
}

function buildHtmlBadge(name: string, badgeBase: string, id: string): string {
  return `<img src="${badgeBase}/${id}.svg" alt="${name} status" />`;
}

function buildDirectUrl(badgeBase: string, id: string): string {
  return `${badgeBase}/${id}.svg`;
}

function buildIframeEmbed(origin: string, id: string): string {
  return `<iframe src="${origin}/embed/monitor/${id}" frameborder="0" style="border:none;" width="300" height="60"></iframe>`;
}

function buildCardIframe(origin: string, id: string): string {
  return `<iframe src="${origin}/embed/monitor/${id}?style=card" frameborder="0" style="border:none;" width="300" height="120"></iframe>`;
}

function buildScriptTagEmbed(origin: string, id: string): string {
  return `<div data-pulsedock-monitor="${id}"></div>\n<script src="${origin}/embed.js" async></script>`;
}

function buildFloatingWidgetScript(origin: string, id: string): string {
  return `<script src="${origin}/embed/monitor/${id}/widget.js" async></script>`;
}

function badgeStyleUrl(base: string, id: string, style: string): string {
  return `${base}/${id}.svg?style=${style}`;
}

describe('BadgeModal — pure string generation', () => {
  const base = 'https://badges.example.com';
  const origin = 'https://pulsedock.example.com';
  const id = 'abc123';
  const name = 'My API';

  describe('buildMarkdownBadge', () => {
    it('produces correct markdown badge syntax', () => {
      expect(buildMarkdownBadge(name, base, id)).toBe(`![${name}](${base}/${id}.svg)`);
    });
    it('includes name, base, and id', () => {
      const result = buildMarkdownBadge(name, base, id);
      expect(result).toContain(name);
      expect(result).toContain(base);
      expect(result).toContain(id);
    });
  });

  describe('buildHtmlBadge', () => {
    it('produces correct HTML img tag', () => {
      expect(buildHtmlBadge(name, base, id)).toBe(`<img src="${base}/${id}.svg" alt="${name} status" />`);
    });
    it('includes alt text with "status"', () => {
      expect(buildHtmlBadge(name, base, id)).toContain('status');
    });
    it('includes the .svg extension', () => {
      expect(buildHtmlBadge(name, base, id)).toContain('.svg');
    });
  });

  describe('buildDirectUrl', () => {
    it('returns base/id.svg', () => {
      expect(buildDirectUrl(base, id)).toBe(`${base}/${id}.svg`);
    });
    it('ends with .svg', () => {
      expect(buildDirectUrl(base, id).endsWith('.svg')).toBe(true);
    });
  });

  describe('buildIframeEmbed', () => {
    it('contains origin and id', () => {
      const result = buildIframeEmbed(origin, id);
      expect(result).toContain(origin);
      expect(result).toContain(id);
    });
    it('contains frameborder="0"', () => {
      expect(buildIframeEmbed(origin, id)).toContain('frameborder="0"');
    });
    it('is an iframe element', () => {
      expect(buildIframeEmbed(origin, id)).toMatch(/<iframe/);
    });
  });

  describe('buildCardIframe', () => {
    it('contains style=card', () => {
      expect(buildCardIframe(origin, id)).toContain('style=card');
    });
    it('has height="120"', () => {
      expect(buildCardIframe(origin, id)).toContain('height="120"');
    });
    it('contains origin and id', () => {
      const result = buildCardIframe(origin, id);
      expect(result).toContain(origin);
      expect(result).toContain(id);
    });
  });

  describe('buildScriptTagEmbed', () => {
    it('contains data-pulsedock-monitor attribute', () => {
      expect(buildScriptTagEmbed(origin, id)).toContain(`data-pulsedock-monitor="${id}"`);
    });
    it('contains embed.js', () => {
      expect(buildScriptTagEmbed(origin, id)).toContain('embed.js');
    });
    it('contains the id', () => {
      expect(buildScriptTagEmbed(origin, id)).toContain(id);
    });
  });

  describe('buildFloatingWidgetScript', () => {
    it('script src contains embed/monitor path', () => {
      const result = buildFloatingWidgetScript(origin, id);
      expect(result).toContain('embed/monitor');
    });
    it('contains origin and id', () => {
      const result = buildFloatingWidgetScript(origin, id);
      expect(result).toContain(origin);
      expect(result).toContain(id);
    });
    it('is a script tag', () => {
      expect(buildFloatingWidgetScript(origin, id)).toMatch(/<script/);
    });
  });

  describe('badgeStyleUrl', () => {
    it('appends style query param', () => {
      expect(badgeStyleUrl(base, id, 'flat')).toBe(`${base}/${id}.svg?style=flat`);
    });
    it('works with different styles', () => {
      expect(badgeStyleUrl(base, id, 'for-the-badge')).toContain('style=for-the-badge');
    });
    it('includes .svg before query', () => {
      const url = badgeStyleUrl(base, id, 'flat');
      expect(url).toMatch(/\.svg\?/);
    });
  });
});

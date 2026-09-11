import { PrismaService } from '../../common/prisma.service';
import { RedisCacheService } from '../../common/redis-cache.service';
import { Widget } from '../status-pages.types';

export async function resolveContentWidget(
  _prisma: PrismaService,
  _cache: RedisCacheService,
  _userId: string,
  widget: Widget,
  _overrideDays: number | undefined,
): Promise<Record<string, unknown>> {
  switch (widget.type) {
    case 'announcement-bar': {
      const message = (widget.config.message as string) ?? '';
      const type = (widget.config.type as string) ?? 'info';
      const expiresAt = widget.config.expiresAt as string | undefined;
      const dismissable = (widget.config.dismissable as boolean) ?? false;
      const expired = expiresAt ? new Date(expiresAt) <= new Date() : false;
      return {
        message,
        type,
        expiresAt,
        dismissable,
        expired,
        fetchedAt: new Date().toISOString(),
      };
    }

    case 'link-list': {
      const links = (widget.config.links as Array<{ label: string; url: string; icon: string; description?: string }>) ?? [];
      return { links , fetchedAt: new Date().toISOString()};
    }

    case 'faq-accordion': {
      const items = (widget.config.items as Array<{ question: string; answer: string }>) ?? [];
      return { items , fetchedAt: new Date().toISOString()};
    }

    case 'social-links': {
      const links = (widget.config.socialLinks as Array<{ platform: string; url: string }>) ?? [];
      return { links , fetchedAt: new Date().toISOString()};
    }

    case 'embed-iframe': {
      const url = widget.config.url as string | undefined;
      if (!url) return { _noConfig: true };
      const height = (widget.config.height as number) ?? 400;
      const title = widget.config.title as string | undefined;
      const sandbox = (widget.config.sandbox as string) ?? 'allow-scripts allow-same-origin';
      return { url, height, title, sandbox , fetchedAt: new Date().toISOString()};
    }

    case 'subscriber-form': {
      return {
        title: (widget.config.title as string) ?? 'Subscribe to Updates',
        description: (widget.config.description as string) ?? 'Get notified when incidents are created or resolved.',
        buttonText: (widget.config.buttonText as string) ?? 'Subscribe',
        successMessage: (widget.config.successMessage as string) ?? 'You are subscribed!',
        fetchedAt: new Date().toISOString(),
      };
    }

    case 'countdown': {
      const label = (widget.config.label as string) ?? 'Event';
      const targetAt = widget.config.targetAt as string | undefined;
      const hideAfterExpiry = (widget.config.hideAfterExpiry as boolean) ?? false;
      if (!targetAt) {
        return { label, targetAt: null, secondsRemaining: 0, expired: true, hideAfterExpiry };
      }
      const secondsRemaining = Math.max(0, Math.floor((new Date(targetAt).getTime() - Date.now()) / 1000));
      const expired = secondsRemaining === 0;
      return { label, targetAt, secondsRemaining, expired, hideAfterExpiry , fetchedAt: new Date().toISOString()};
    }

    case 'text-block':
    case 'code-block':
    case 'image-banner':
    case 'video-embed':
    case 'rss-feed-widget':
      return { widgetType: widget.type, config: widget.config, fetchedAt: new Date().toISOString() };

    default:
      return { widgetType: widget.type, message: 'Widget data not yet implemented for this type' };
  }
}

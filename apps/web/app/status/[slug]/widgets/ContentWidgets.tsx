// Content widgets — text, images, embeds, forms, links, FAQs, social
import React from "react";
import {
  type WidgetProps,
  type MonitorSummary,
  WidgetCard,
  LevelBadge,
  formatRelative,
  levelLabel,
} from "./shared";
import { SubscriberFormWidget } from "./SubscriberFormWidget";
import { CountdownWidget } from "./CountdownWidget";
import { AnnouncementBarClient } from "./AnnouncementBarClient";
import { RssFeedCopyButton } from "./RssFeedCopyButton";

export function TextBlock({ widget }: WidgetProps) {
  const text = (widget.config.text as string) ?? "";
  const label = widget.config.label as string | undefined;
  if (!text && !label) return null;
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      {label && <p className="mb-2 text-sm font-semibold text-text-primary">{label}</p>}
      {text && <p className="whitespace-pre-wrap text-sm text-text-secondary">{text}</p>}
    </div>
  );
}

// Scheduled Maintenance — real maintenance windows from API

export function Divider() {
  return <hr className="border-border my-2" />;
}

// ── New P1 Widgets ───────────────────────────────────────────────────────

// Component Status List — per-component status: Operational / Degraded / Partial Outage / Major Outage

export function AnnouncementBar({ widget, extra }: WidgetProps) {
  const data = extra.widgetDataById[widget.id] as {
    message: string;
    type: "info" | "warning" | "danger" | "success";
    expiresAt?: string;
    dismissable: boolean;
    expired: boolean;
  } | undefined;

  if (!data || data.expired || !data.message) return null;

  return (
    <AnnouncementBarClient
      message={data.message}
      type={data.type}
      dismissable={data.dismissable}
    />
  );
}

// ── Link List ────────────────────────────────────────────────────────────


export function LinkList({ widget, extra }: WidgetProps) {
  const data = extra.widgetDataById[widget.id] as {
    links: Array<{ label: string; url: string; icon: string; description?: string }>;
  } | undefined;

  const title = (widget.config.label as string) || "Links";
  const isEditor = (widget.config._editor as boolean) ?? false;

  if (!data?.links?.length) {
    if (isEditor) {
      return (
        <div className="rounded-xl border border-dashed border-border bg-surface/30 p-4 text-center text-sm text-text-secondary">
          No links configured. Add links in the widget settings.
        </div>
      );
    }
    return null;
  }

  return (
    <div className="rounded-xl border border-border bg-surface/50 p-4 space-y-3">
      <div className="text-sm font-semibold text-text-primary">{title}</div>
      <div className="divide-y divide-border/50">
        {data.links.map((link, i) => (
          <a
            key={i}
            href={link.url}
            target="_blank"
            rel="noreferrer noopener"
            className="flex items-center gap-3 py-2.5 hover:bg-white/5 rounded-lg px-2 -mx-2 transition-colors group"
          >
            <span className="text-xl flex-shrink-0">{link.icon}</span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-text-primary group-hover:text-white transition-colors">{link.label}</div>
              {link.description && (
                <div className="text-[11px] text-text-secondary truncate">{link.description}</div>
              )}
            </div>
            <span className="text-text-secondary group-hover:text-white transition-colors flex-shrink-0">→</span>
          </a>
        ))}
      </div>
    </div>
  );
}

// ── FAQ Accordion ────────────────────────────────────────────────────────


export function FaqAccordion({ widget, extra }: WidgetProps) {
  const data = extra.widgetDataById[widget.id] as {
    items: Array<{ question: string; answer: string }>;
  } | undefined;

  const items = data?.items ?? (widget.config.items as Array<{ question: string; answer: string }> | undefined) ?? [];
  const title = (widget.config.label as string) || undefined;
  const isEditor = (widget.config._editor as boolean) ?? false;

  if (!items.length) {
    if (isEditor) {
      return (
        <div className="rounded-xl border border-dashed border-border bg-surface/30 p-4 text-center text-sm text-text-secondary">
          No FAQ items configured. Add Q&A pairs in the widget settings.
        </div>
      );
    }
    return null;
  }

  return (
    <div className="rounded-xl border border-border bg-surface/50 p-4">
      {title && <div className="mb-3 text-sm font-semibold text-text-primary">{title}</div>}
      <div className="space-y-0">
        {items.map((item, i) => (
          <details
            key={i}
            className="group border-b border-border/50 last:border-0"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-3 text-left text-sm font-medium text-text-primary hover:text-white transition-colors select-none">
              <span>{item.question}</span>
              <svg
                className="h-4 w-4 flex-shrink-0 text-text-secondary transition-transform duration-200 group-open:rotate-180"
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </summary>
            <div className="pb-3">
              <p className="text-sm text-text-secondary leading-relaxed">{item.answer}</p>
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}

// ── Social Links ─────────────────────────────────────────────────────────

type SocialPlatform = "github" | "twitter" | "discord" | "linkedin" | "youtube" | "mastodon" | "bluesky" | "website";

const SOCIAL_CONFIG: Record<SocialPlatform, { color: string; label: string; svgPath: string }> = {
  github: {
    color: "bg-neutral-700 hover:bg-neutral-600",
    label: "GitHub",
    svgPath: "M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.92.359.31.678.921.678 1.856 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z",
  },
  twitter: {
    color: "bg-sky-700 hover:bg-sky-600",
    label: "Twitter / X",
    svgPath: "M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.259 5.631 5.905-5.631zm-1.161 17.52h1.833L7.084 4.126H5.117z",
  },
  discord: {
    color: "bg-indigo-700 hover:bg-indigo-600",
    label: "Discord",
    svgPath: "M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028 14.09 14.09 0 001.226-1.994.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z",
  },
  linkedin: {
    color: "bg-blue-800 hover:bg-blue-700",
    label: "LinkedIn",
    svgPath: "M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z",
  },
  youtube: {
    color: "bg-red-700 hover:bg-red-600",
    label: "YouTube",
    svgPath: "M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z",
  },
  mastodon: {
    color: "bg-purple-700 hover:bg-purple-600",
    label: "Mastodon",
    svgPath: "M23.268 5.313c-.35-2.578-2.617-4.61-5.304-5.004C17.51.242 15.792 0 11.813 0h-.03c-3.98 0-4.835.242-5.288.309C3.882.692 1.496 2.518.917 5.127.64 6.412.61 7.837.661 9.143c.074 1.874.088 3.745.26 5.611.118 1.24.325 2.47.62 3.68.55 2.237 2.777 4.098 4.96 4.857 2.336.792 4.849.923 7.256.38.265-.061.527-.132.786-.213.585-.184 1.27-.39 1.774-.753a.057.057 0 00.023-.043v-1.809a.052.052 0 00-.02-.041.053.053 0 00-.046-.01 20.282 20.282 0 01-4.709.545c-2.73 0-3.463-1.284-3.674-1.818a5.593 5.593 0 01-.319-1.433.053.053 0 01.066-.054c1.517.363 3.072.546 4.632.546.376 0 .75 0 1.125-.01 1.57-.044 3.224-.124 4.768-.422.038-.008.077-.015.11-.024 2.435-.464 4.753-1.92 4.989-5.604.008-.145.03-1.52.03-1.67.002-.512.167-3.63-.024-5.545zm-3.748 9.195h-2.561V8.29c0-1.309-.55-1.976-1.67-1.976-1.23 0-1.846.79-1.846 2.35v3.403h-2.546V8.663c0-1.56-.617-2.35-1.848-2.35-1.112 0-1.668.668-1.67 1.977v6.218H4.822V8.102c0-1.31.337-2.35 1.011-3.12.696-.77 1.608-1.164 2.74-1.164 1.311 0 2.302.5 2.962 1.498l.638 1.06.638-1.06c.66-.999 1.65-1.498 2.96-1.498 1.13 0 2.043.395 2.74 1.164.675.77 1.012 1.81 1.012 3.12z",
  },
  bluesky: {
    color: "bg-sky-600 hover:bg-sky-500",
    label: "Bluesky",
    svgPath: "M12 10.8c-1.087-2.114-4.046-6.053-6.798-7.995C2.566.944 1.561 1.266.902 1.565.139 1.908 0 3.08 0 3.768c0 .69.378 5.65.624 6.479.815 2.736 3.713 3.66 6.383 3.364.136-.02.275-.039.415-.056-.138.022-.276.04-.415.056-3.912.58-7.387 2.005-2.83 7.078 5.013 5.19 6.87-1.113 7.823-4.308.953 3.195 2.05 9.271 7.733 4.308 4.267-4.308 1.172-6.498-2.74-7.078a8.741 8.741 0 01-.415-.056c.14.017.279.036.415.056 2.67.297 5.568-.628 6.383-3.364.246-.828.624-5.79.624-6.478 0-.69-.139-1.861-.902-2.204-.659-.299-1.664-.62-4.3 1.24C16.046 4.748 13.087 8.687 12 10.8z",
  },
  website: {
    color: "bg-gray-700 hover:bg-gray-600",
    label: "Website",
    svgPath: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z",
  },
};


export function SocialLinks({ widget, extra }: WidgetProps) {
  const data = extra.widgetDataById[widget.id] as {
    links: Array<{ platform: string; url: string }>;
  } | undefined;

  const links = data?.links ?? (widget.config.socialLinks as Array<{ platform: string; url: string }> | undefined) ?? [];
  const isEditor = (widget.config._editor as boolean) ?? false;

  if (!links.length) {
    if (isEditor) {
      return (
        <div className="rounded-xl border border-dashed border-border bg-surface/30 p-4 text-center text-sm text-text-secondary">
          No social links configured. Add platforms in the widget settings.
        </div>
      );
    }
    return null;
  }

  return (
    <div className="rounded-xl border border-border bg-surface/50 p-4">
      <div className="flex flex-wrap gap-2">
        {links.map((link, i) => {
          const platform = link.platform as SocialPlatform;
          const cfg = SOCIAL_CONFIG[platform] ?? SOCIAL_CONFIG.website;
          return (
            <a
              key={i}
              href={link.url}
              target="_blank"
              rel="noreferrer noopener"
              title={cfg.label}
              className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors ${cfg.color}`}
            >
              <svg className="h-5 w-5 fill-white" viewBox="0 0 24 24" aria-hidden="true">
                <path d={cfg.svgPath} />
              </svg>
              <span className="sr-only">{cfg.label}</span>
            </a>
          );
        })}
      </div>
    </div>
  );
}

// ── Embed / iFrame Block ──────────────────────────────────────────────────


export function EmbedIframe({ widget, extra }: WidgetProps) {
  const data = extra.widgetDataById[widget.id] as {
    url: string;
    height: number;
    title?: string;
    sandbox: string;
  } | undefined;

  const url = data?.url ?? (widget.config.url as string | undefined) ?? "";
  const height = data?.height ?? (widget.config.height as number | undefined) ?? 400;
  const title = data?.title ?? (widget.config.title as string | undefined) ?? "Embedded content";
  const sandbox = data?.sandbox ?? (widget.config.sandbox as string | undefined) ?? "allow-scripts allow-same-origin";

  if (!url) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-surface/30 p-4 text-center text-sm text-text-secondary">
        No URL configured for embed.
      </div>
    );
  }

  const isHttps = url.startsWith("https://");

  return (
    <div className="rounded-xl border border-border bg-surface/50 overflow-hidden">
      {!isHttps && (
        <div className="flex items-center gap-2 bg-yellow-500/10 border-b border-yellow-500/30 px-3 py-2 text-xs text-yellow-400">
          <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          Non-HTTPS URL — content may be blocked by browsers.
        </div>
      )}
      <div style={{ height }}>
        <iframe
          src={url}
          title={title}
          sandbox={sandbox}
          className="w-full border-0 bg-surface/30"
          style={{ height }}
          loading="lazy"
        />
      </div>
    </div>
  );
}

// ── Subscriber Form ───────────────────────────────────────────────────────


export function SubscriberForm({ widget, extra }: WidgetProps) {
  const data = extra.widgetDataById[widget.id] as {
    title: string;
    description: string;
    buttonText: string;
    successMessage: string;
  } | undefined;

  const slug = (widget.config._slug as string | undefined) ?? "";
  const title = data?.title ?? (widget.config.title as string | undefined) ?? "Subscribe to Updates";
  const description = data?.description ?? (widget.config.description as string | undefined) ?? "Get notified when incidents are created or resolved.";
  const buttonText = data?.buttonText ?? (widget.config.buttonText as string | undefined) ?? "Subscribe";
  const successMessage = data?.successMessage ?? (widget.config.successMessage as string | undefined) ?? "You are subscribed!";

  return (
    <SubscriberFormWidget
      slug={slug}
      title={title}
      description={description}
      buttonText={buttonText}
      successMessage={successMessage}
    />
  );
}

// ── Countdown ─────────────────────────────────────────────────────────────


export function Countdown({ widget, extra }: WidgetProps) {
  const data = extra.widgetDataById[widget.id] as {
    label: string;
    targetAt: string | null;
    secondsRemaining: number;
    expired: boolean;
    hideAfterExpiry: boolean;
  } | undefined;

  const label = data?.label ?? (widget.config.label as string | undefined) ?? "Event";
  const targetAt = data?.targetAt ?? (widget.config.targetAt as string | undefined) ?? null;
  const hideAfterExpiry = data?.hideAfterExpiry ?? (widget.config.hideAfterExpiry as boolean | undefined) ?? false;
  const initialSeconds = data?.secondsRemaining ?? (
    targetAt ? Math.max(0, Math.floor((new Date(targetAt).getTime() - Date.now()) / 1000)) : 0
  );

  return (
    <CountdownWidget
      label={label}
      targetAt={targetAt}
      initialSecondsRemaining={initialSeconds}
      hideAfterExpiry={hideAfterExpiry}
    />
  );
}

// ── Maintenance Calendar ──────────────────────────────────────────────────


export function ImageBanner({ widget }: WidgetProps) {
  const imageUrl = widget.config.imageUrl as string | undefined;
  const altText = (widget.config.altText as string | undefined) ?? "";
  const linkUrl = widget.config.linkUrl as string | undefined;
  const maxHeight = (widget.config.maxHeight as number | undefined) ?? 200;
  const caption = widget.config.caption as string | undefined;

  if (!imageUrl) {
    return (
      <div className="bg-surface/50 border border-border rounded-xl p-4 flex flex-col items-center justify-center gap-2 text-text-secondary" style={{ minHeight: 80 }}>
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect width="18" height="18" x="3" y="3" rx="2" ry="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
        </svg>
        <span className="text-sm">Add image URL in config</span>
      </div>
    );
  }

  const imgEl = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={imageUrl}
      alt={altText}
      style={{ maxHeight, objectFit: "cover", width: "100%", borderRadius: "0.75rem" }}
    />
  );

  return (
    <div className="bg-surface/50 border border-border rounded-xl overflow-hidden">
      {linkUrl ? (
        <a href={linkUrl} target="_blank" rel="noreferrer noopener">
          {imgEl}
        </a>
      ) : imgEl}
      {caption && (
        <p className="px-4 py-2 text-sm text-text-secondary">{caption}</p>
      )}
    </div>
  );
}

// ── Data Table ────────────────────────────────────────────────────────────


export function DataTable({ widget, monitors }: WidgetProps) {
  const columns = (widget.config.columns as string[] | undefined) ?? ["name", "status", "latency", "lastChecked"];
  const maxRows = (widget.config.maxRows as number | undefined) ?? 20;
  const showHeader = (widget.config.showHeader as boolean | undefined) ?? true;

  const rows = monitors.slice(0, maxRows);

  const colLabel: Record<string, string> = {
    name: "Name",
    status: "Status",
    latency: "Latency",
    lastChecked: "Last Checked",
    type: "Type",
    message: "Message",
  };

  const levelDot: Record<string, string> = {
    green: "bg-green-400",
    yellow: "bg-yellow-400",
    red: "bg-red-400",
  };

  return (
    <div className="bg-surface/50 border border-border rounded-xl overflow-hidden">
      <table className="w-full text-sm" aria-label="Monitor status table">
        {showHeader && (
          <thead>
            <tr className="border-b border-border">
              {columns.map((col) => (
                <th key={col} scope="col" className="px-3 py-2 text-left text-xs font-medium text-text-secondary uppercase tracking-wide">
                  {colLabel[col] ?? col}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-3 py-4 text-center text-text-secondary text-xs">
                No monitors configured
              </td>
            </tr>
          ) : rows.map((m) => (
            <tr key={m.id} className="border-b border-border/50 last:border-0 hover:bg-surface/80">
              {columns.map((col) => (
                <td key={col} className="px-3 py-2 text-text-primary">
                  {col === "status" ? (
                    <span className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${levelDot[m.level] ?? "bg-gray-400"}`} />
                      <span className="text-xs">{levelLabel(m.level)}</span>
                    </span>
                  ) : col === "latency" ? (
                    <span className="text-xs font-mono">{m.latencyMs != null ? `${m.latencyMs}ms` : "—"}</span>
                  ) : col === "lastChecked" ? (
                    <span className="text-xs text-text-secondary">{m.lastChecked ? formatRelative(m.lastChecked) : "—"}</span>
                  ) : col === "name" ? (
                    <span className="font-medium text-xs">{m.name}</span>
                  ) : col === "type" ? (
                    <span className="text-xs text-text-secondary">{m.type}</span>
                  ) : col === "message" ? (
                    <span className="text-xs text-text-secondary truncate max-w-xs block">{m.message ?? "—"}</span>
                  ) : null}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── RSS Feed Widget ───────────────────────────────────────────────────────


export function RssFeedWidget({ widget }: WidgetProps) {
  const feedTitle = (widget.config.feedTitle as string | undefined) ?? "Status Updates";
  const slugOverride = widget.config.slugOverride as string | undefined;

  const feedUrl = slugOverride
    ? `https://your-domain.com/status/${slugOverride}/feed.xml`
    : "Configure slug in widget settings";
  const isPlaceholder = !slugOverride;

  return (
    <div className="bg-surface/50 border border-border rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-orange-400" aria-hidden="true">
          <path d="M4 11a9 9 0 0 1 9 9" /><path d="M4 4a16 16 0 0 1 16 16" /><circle cx="5" cy="19" r="1" />
        </svg>
        <span className="font-semibold text-text-primary">{feedTitle}</span>
      </div>
      <div className="rounded-lg bg-surface border border-border p-2 flex items-center justify-between gap-2">
        <code className="text-xs font-mono text-text-secondary truncate">{feedUrl}</code>
        {!isPlaceholder && <RssFeedCopyButton feedUrl={feedUrl} />}
      </div>
      <p className="text-xs text-text-secondary">Subscribe in your RSS reader to receive status updates.</p>
    </div>
  );
}

// ── Content widgets ──────────────────────────────────────────────────────


export function CodeBlock({ widget }: WidgetProps) {
  const code = (widget.config.code as string) ?? "";
  const language = (widget.config.language as string) ?? "bash";
  const label = (widget.config.label as string) ?? "Code";

  return (
    <div className="rounded-xl border border-border bg-surface/50 p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-text-secondary">{label}</span>
        <span className="text-xs bg-surface-elevated border border-border/60 px-2 py-0.5 rounded font-mono text-text-muted">{language}</span>
      </div>
      <pre className="bg-bg/80 rounded-lg p-4 overflow-x-auto">
        <code className="text-xs font-mono text-text-primary whitespace-pre">{code || "# Add code in the config panel"}</code>
      </pre>
    </div>
  );
}


export function VideoEmbed({ widget }: WidgetProps) {
  const url = (widget.config.videoUrl as string) ?? "";
  const label = (widget.config.label as string) ?? "";
  const height = (widget.config.height as number) ?? 300;

  function toEmbedUrl(rawUrl: string): string | null {
    if (!rawUrl) return null;
    try {
      const u = new URL(rawUrl);
      if (u.hostname.includes('youtube.com') && u.searchParams.get('v')) {
        return `https://www.youtube.com/embed/${u.searchParams.get('v')}`;
      }
      if (u.hostname.includes('youtu.be')) {
        return `https://www.youtube.com/embed${u.pathname}`;
      }
      if (u.hostname.includes('vimeo.com')) {
        const id = u.pathname.split('/').filter(Boolean).pop();
        return `https://player.vimeo.com/video/${id}`;
      }
      return rawUrl;
    } catch {
      return null;
    }
  }

  const embedUrl = toEmbedUrl(url);

  return (
    <div className="rounded-xl border border-border bg-surface/50 overflow-hidden">
      {label && <div className="px-4 py-2 border-b border-border text-sm font-medium text-text-secondary">{label}</div>}
      {embedUrl ? (
        <iframe
          src={embedUrl}
          style={{ height: `${height}px`, width: '100%' }}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="block"
          title={label || "Video"}
        />
      ) : (
        <div className="flex items-center justify-center text-text-muted text-sm" style={{ height: `${height}px` }}>
          Add a YouTube or Vimeo URL in config
        </div>
      )}
    </div>
  );
}


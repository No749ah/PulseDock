// ── Types ──────────────────────────────────────────────────────────────────

export interface Widget {
  id: string;
  type: string;
  x: number;
  y: number;
  w: number;
  h: number;
  locked?: boolean;
  zOrder?: number;
  config: {
    monitorId?: string;
    monitorIds?: string[];
    monitorMode?: "single" | "multiple" | "all";
    label?: string;
    periodDays?: number;
    text?: string;
    [key: string]: unknown;
  };
}

export type ViewportMode = "desktop" | "tablet" | "mobile";

export interface PageSettings {
  autoRefreshInterval?: number; // seconds, 0 = off
  showBranding?: boolean;
  logoUrl?: string;
  faviconUrl?: string;
  accentColor?: string;
  theme?: "dark" | "light" | "system";
  fontFamily?: "inter" | "roboto" | "system" | "mono";
  backgroundStyle?: "solid" | "gradient" | "grid-dots";
  backgroundColor?: string;
  // SEO
  metaTitle?: string;
  metaDescription?: string;
  ogImageUrl?: string;
  robotsIndex?: boolean;
  // Webhook notifications
  notifyWebhookUrl?: string;
  slackWebhookUrl?: string;
  discordWebhookUrl?: string;
  // Advanced
  customCss?: string;
}

export interface PageLayout {
  widgets: Widget[];
  settings?: PageSettings;
}

export interface StatusPage {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  isPublished: boolean;
  hasPassword: boolean;
  notifyWebhookUrl?: string | null;
  slackWebhookUrl?: string | null;
  discordWebhookUrl?: string | null;
  customCss?: string | null;
  layout: PageLayout;
}

export interface Monitor {
  id: string;
  name: string;
  type: string;
  folderId?: string | null;
  tags?: { id: string; name: string; color?: string }[];
}

export interface TagOption {
  id: string;
  name: string;
  color: string;
}

export interface FolderOption {
  id: string;
  name: string;
}

export interface WidgetPaletteItem {
  type: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  category: string;
  defaultW: number;
  defaultH: number;
}

export interface StatusTemplate {
  id: string;
  name: string;
  description: string;
  preview: string;
  widgets: Omit<Widget, 'id'>[];
}

export interface VersionEntry {
  ts: number;
  widgetCount: number;
  widgets: Widget[];
  settings: PageSettings;
}

export interface ApiHistoryEntry {
  id: string;
  savedAt: string;
  label: string | null;
  layout: { widgets?: unknown[]; settings?: unknown };
}

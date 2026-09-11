/**
 * Design system constants for PulseDock.
 * All values reference CSS custom properties defined in globals.css (@theme block).
 * Use these instead of ad-hoc Tailwind color classes for consistent theming.
 */

/** Semantic spacing classes (4px grid) */
export const spacing = {
  cardPadding: "p-6",
  cardPaddingSm: "p-4",
  sectionGap: "gap-6",
  sectionGapSm: "gap-4",
  tableCellPadding: "py-3 px-4",
  tableCellPaddingCompact: "py-2 px-3",
} as const;

/** Typography scale */
export const typography = {
  /** Section headings inside cards */
  sectionHeading: "text-lg font-semibold text-text-primary",
  /** Sub-headings, secondary labels */
  subHeading: "text-sm font-medium text-text-secondary",
  /** Large stat / KPI values */
  cardValue: "text-2xl font-bold text-text-primary",
  /** Table cell text */
  tableCell: "text-sm text-text-primary",
  /** Muted table cell, secondary data */
  tableCellMuted: "text-sm text-text-secondary",
  /** Caption / helper text */
  caption: "text-xs text-text-muted",
  /** Monospace value (timestamps, IDs, URLs) */
  mono: "text-xs font-mono text-text-secondary",
} as const;

/** Monitor/check status badges */
export const statusBadge = {
  up: "text-xs px-2 py-0.5 rounded-full bg-success/20 text-success border border-success/30",
  down: "text-xs px-2 py-0.5 rounded-full bg-danger/20 text-danger border border-danger/30",
  degraded: "text-xs px-2 py-0.5 rounded-full bg-warning/20 text-warning border border-warning/30",
  paused: "text-xs px-2 py-0.5 rounded-full bg-border/40 text-text-muted border border-border",
  pending: "text-xs px-2 py-0.5 rounded-full bg-accent/20 text-accent border border-accent/30",
} as const;

/** Alert channel brand colors (semantic: these are brand/type-specific) */
export const channelColors = {
  email: "text-success",
  slack: "text-warning",
  discord: "text-indigo-400",
  telegram: "text-accent",
  webhook: "text-blue-400",
  pagerduty: "text-danger",
} as const;

/** Surface / card base classes */
export const surfaces = {
  card: "rounded-2xl border border-border bg-surface",
  cardElevated: "rounded-2xl border border-border bg-surface-elevated",
  /** Interactive card with hover state */
  cardHover: "rounded-2xl border border-border bg-surface hover:border-border-hover hover:bg-surface-elevated transition-all duration-200",
  /** Input fields */
  input: "bg-surface-elevated border border-border rounded-xl text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent/50 transition-colors",
  /** Table row hover */
  tableRow: "hover:bg-surface-hover transition-colors",
} as const;

/** Button variants (mirrors Button.tsx but as bare class strings for inline use) */
export const buttonClasses = {
  primary: "bg-accent hover:bg-accent-hover text-bg font-semibold rounded-xl transition-all active:scale-[0.97]",
  secondary: "border border-border hover:border-border-hover text-text-primary font-semibold rounded-xl transition-all active:scale-[0.97]",
  danger: "bg-danger/10 hover:bg-danger/20 border border-danger/30 hover:border-danger/50 text-danger font-semibold rounded-xl transition-all active:scale-[0.97]",
  ghost: "text-text-secondary hover:text-text-primary transition-colors",
} as const;

/** Size modifiers for buttons/badges */
export const sizes = {
  xs: "px-2.5 py-1 text-xs",
  sm: "px-3 py-1.5 text-sm",
  md: "px-4 py-2 text-base",
  lg: "px-6 py-3 text-base",
} as const;

/** Status dot / indicator colors */
export const statusDot = {
  up: "bg-success",
  down: "bg-danger",
  degraded: "bg-warning",
  paused: "text-text-muted",
} as const;

/** Chart/sparkline line colors (matches Recharts usage) */
export const chartColors = {
  primary: "#58a6ff",    // accent
  success: "#3fb950",    // success
  danger: "#f85149",     // danger
  warning: "#d29922",    // warning
  muted: "#6e7681",      // text-muted
  purple: "#a78bfa",     // decorative
} as const;

/**
 * PulseDock Design Tokens
 *
 * Authoritative reference for the design system constants used throughout
 * the dashboard. All actual CSS variables are declared in `globals.css`
 * via the `@theme` block (Tailwind CSS v4 format).
 *
 * Usage: import { CARD, HEADING, BADGE } from "@/app/design-tokens";
 *
 * These string constants ensure every component uses the same class
 * combinations without copy-paste drift.
 */

// ── Typography ──────────────────────────────────────────────────────────────

/**
 * Primary section heading used throughout the dashboard pages.
 * Example: "Monitors", "Recent Activity"
 */
export const HEADING_PRIMARY = "text-xl font-bold text-text-primary";

/**
 * Subsection label — small, uppercase, secondary colour.
 * Example: "Uptime Monitoring", "Version Tracking"
 */
export const HEADING_LABEL = "text-sm font-semibold text-text-secondary uppercase tracking-wide";

/**
 * Card stat number — large, bold, tabular digits.
 */
export const STAT_NUMBER = "text-3xl font-bold tabular-nums";

// ── Cards ───────────────────────────────────────────────────────────────────

/**
 * Standard dashboard card.
 * Matches the `<Card>` component default class.
 */
export const CARD_BASE = "rounded-2xl border border-border bg-surface p-6 transition-all duration-200";

/**
 * Interactive card (hover lift + border highlight).
 * Extend CARD_BASE with this to make a card clickable.
 */
export const CARD_HOVER = "hover:border-border-hover hover:bg-surface-elevated hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/20 cursor-pointer";

/**
 * Compact card variant for tighter layouts.
 */
export const CARD_COMPACT = "rounded-2xl border border-border bg-surface p-4 transition-all duration-200";

// ── Icon containers ──────────────────────────────────────────────────────────

/**
 * Stat card icon container (e.g., accent-coloured background behind a lucide icon).
 */
export const ICON_CONTAINER = "p-3 rounded-xl";

// ── Buttons ──────────────────────────────────────────────────────────────────

/**
 * Inline action button — small, pill-shaped, subdued style.
 * Used for time-range selectors, auto-refresh toggles, etc.
 */
export const BUTTON_INLINE = "flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md border border-border bg-surface text-text-secondary hover:text-text-primary hover:border-accent/50 transition-colors";

// ── Badges ───────────────────────────────────────────────────────────────────

/**
 * Status badge — coloured pill for monitor state.
 * Matches the `<Badge>` component.
 */
export const BADGE_BASE = "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold";

// ── Alerts / banners ─────────────────────────────────────────────────────────

export const BANNER_DANGER  = "flex items-start gap-3 p-4 rounded-xl bg-danger/10 border border-danger/20";
export const BANNER_SUCCESS = "flex items-start gap-3 p-4 rounded-xl bg-success/10 border border-success/20";
export const BANNER_WARNING = "flex items-start gap-3 p-4 rounded-xl bg-warning/10 border border-warning/20";

// ── Color palette reference ──────────────────────────────────────────────────
//
// These are defined in globals.css @theme and consumed as Tailwind utilities.
// Do NOT import them as JS values — use Tailwind classes instead.
//
// bg          #050a0e     Deepest background
// surface     #0a1118     Card / panel background
// surface-elevated  #111a22   Hover / elevated surface
// border      rgba(255,255,255,0.06)
// border-hover rgba(255,255,255,0.12)
// text-primary  #f0f6fc
// text-secondary #8b949e
// text-muted    #6e7681
// accent        #58a6ff
// accent-hover  #79b8ff
// success       #3fb950
// warning       #d29922
// danger        #f85149

"use client";

export function RssFeedCopyButton({ feedUrl }: { feedUrl: string }) {
  return (
    <button
      onClick={() => navigator.clipboard.writeText(feedUrl)}
      className="shrink-0 text-xs px-2 py-0.5 rounded bg-surface/80 border border-border text-text-secondary hover:text-text-primary transition-colors"
    >
      Copy
    </button>
  );
}

"use client";

import dynamic from "next/dynamic";

// Lazy-load interactive overlays — not needed on initial render
const CommandPalette = dynamic(
  () => import("./command-palette").then(m => ({ default: m.CommandPalette })),
  { ssr: false }
);
const KeyboardShortcuts = dynamic(
  () => import("./keyboard-shortcuts").then(m => ({ default: m.KeyboardShortcuts })),
  { ssr: false }
);
const PWAInstallBanner = dynamic(
  () => import("./pwa-install-banner").then(m => ({ default: m.PWAInstallBanner })),
  { ssr: false }
);

export function ClientOverlays() {
  return (
    <>
      <CommandPalette />
      <KeyboardShortcuts />
      <PWAInstallBanner />
    </>
  );
}

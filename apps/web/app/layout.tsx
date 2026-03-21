// Force all pages to be dynamic (server-rendered on every request).
// This prevents Next.js from pre-rendering HTML with cached chunk hashes that
// become stale after a rebuild, causing 404s on /_next/static/*.css|js files.
export const dynamic = 'force-dynamic';

import "./globals.css";
import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { brand } from "../lib/brand";
import { ThemeProvider } from "../components/theme-provider";
import { ToastProvider } from "../components/ui/toast";
import { SWRegister } from "../components/sw-register";
import { PWAInstallBanner } from "../components/pwa-install-banner";
import { I18nProvider } from "../components/i18n-provider";
import { KeyboardShortcuts } from "../components/keyboard-shortcuts";
import { CommandPalette } from "../components/command-palette";
import { PageTransition } from "../components/page-transition";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
  variable: "--font-inter",
  // preload: true emits <link rel="preload"> hints that the browser warns about
  // when heavy JS bundles (like the status-page editor) delay font usage past
  // the browser's threshold. display:"swap" ensures text is visible immediately
  // via the fallback font — no need for aggressive preloading.
  preload: false,
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#050a0e',
};

export const metadata: Metadata = {
  title: `${brand.name} — ${brand.description}`,
  description: brand.fullDescription,
  keywords: ["monitoring", "uptime", "version tracking", "security", "open source"],
  authors: [{ name: "No749ah", url: "https://github.com/No749ah" }],
  creator: "No749ah",
  alternates: {
    canonical: brand.url,
  },
  openGraph: {
    title: `${brand.name} — ${brand.description}`,
    description: brand.fullDescription,
    type: "website",
    locale: "en_US",
    url: brand.url,
    images: [
      {
        url: brand.ogImageUrl,
        width: 1200,
        height: 630,
        alt: `${brand.name} Dashboard`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: brand.name,
    description: `${brand.description} for your stack.`,
  },
  robots: "index, follow",
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      "name": brand.name,
      "applicationCategory": "DeveloperApplication",
      "operatingSystem": "Any",
      "description": brand.fullDescription,
      "url": brand.url,
      "author": {
        "@type": "Person",
        "name": "No749ah",
        "url": "https://github.com/No749ah",
      },
      "license": `${brand.githubUrl}/blob/main/LICENSE`,
      "codeRepository": brand.githubUrl,
      "offers": {
        "@type": "Offer",
        "price": "0",
        "priceCurrency": "USD",
      },
      "featureList": [
        "Version Intelligence — track 5000+ tools",
        "Uptime Monitoring — HTTP, TCP, SSL, Heartbeat",
        "Public Status Pages with drag-and-drop editor",
        "Incident Management with post-mortems",
        "Alert Channels — Slack, Discord, Telegram, Webhook",
        "SLA Tracking and compliance reporting",
        "CLI tool and Docker support",
        "Self-hosted and free forever",
      ],
    },
    {
      "@type": "WebSite",
      "name": brand.name,
      "url": brand.url,
      "description": `${brand.description} for developers.`,
      "potentialAction": {
        "@type": "SearchAction",
        "target": `${brand.url}/versions?q={search_term_string}`,
        "query-input": "required name=search_term_string",
      },
    },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`dark ${inter.variable}`}>
      <head>
        {/* Favicon — supports white-label override via NEXT_PUBLIC_APP_FAVICON_URL */}
        {brand.faviconUrl ? (
          <link rel="icon" href={brand.faviconUrl} />
        ) : (
          <>
            <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
            <link rel="icon" href="/favicon.ico" sizes="32x32" />
          </>
        )}
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180" />
        <link rel="manifest" href="/site.webmanifest" />

        {/* DNS prefetch for tool registry icon CDN */}
        <link rel="dns-prefetch" href="https://cdn.simpleicons.org" />
        <link rel="preconnect" href="https://cdn.simpleicons.org" crossOrigin="anonymous" />

        {/* White-label: override accent color if configured */}
        {brand.accentColor !== '#58a6ff' && (
          <style dangerouslySetInnerHTML={{
            __html: `:root { --color-accent: ${brand.accentColor}; --color-accent-hover: ${brand.accentColor}cc; }`
          }} />
        )}

        {/* JSON-LD structured data */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        
      </head>
      <body className="bg-bg text-text-primary antialiased">
        {/* Skip-to-content — keyboard users can skip repetitive navigation */}
        <a href="#main-content" className="skip-to-content">
          Skip to main content
        </a>
        <I18nProvider>
          <ThemeProvider>
            <ToastProvider>
              <PageTransition>
              {children}
              </PageTransition>
              <CommandPalette />
              <KeyboardShortcuts />
              <PWAInstallBanner />
              <SWRegister />
            </ToastProvider>
          </ThemeProvider>
        </I18nProvider>
      </body>
    </html>
  );
}

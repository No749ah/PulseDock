// Force all pages to be dynamic (server-rendered on every request).
// This prevents Next.js from pre-rendering HTML with cached chunk hashes that
// become stale after a rebuild, causing 404s on /_next/static/*.css|js files.
export const dynamic = 'force-dynamic';

import "./globals.css";
import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import { ThemeProvider } from "../components/theme-provider";
import { ToastProvider } from "../components/ui/toast";
import { SWRegister } from "../components/sw-register";
import { PWAInstallBanner } from "../components/pwa-install-banner";
import { I18nProvider } from "../components/i18n-provider";
import { CommandPalette } from "../components/command-palette";

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#050a0e',
};

export const metadata: Metadata = {
  title: "PulseDock — Version Intelligence & Uptime Monitoring",
  description:
    "Monitor your applications for version updates, security patches, and uptime. Open source, self-hosted, built for developers.",
  keywords: ["monitoring", "uptime", "version tracking", "security", "open source"],
  authors: [{ name: "No749ah", url: "https://github.com/No749ah" }],
  creator: "No749ah",
  alternates: {
    canonical: "https://oc-dev-test.no749ah.com",
  },
  openGraph: {
    title: "PulseDock — Version Intelligence & Uptime Monitoring",
    description: "Monitor your applications for version updates, security patches, and uptime.",
    type: "website",
    locale: "en_US",
    url: "https://oc-dev-test.no749ah.com",
    images: [
      {
        url: "https://oc-dev-test.no749ah.com/og-image.png",
        width: 1200,
        height: 630,
        alt: "PulseDock Dashboard",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "PulseDock",
    description: "Version intelligence & uptime monitoring for your stack.",
  },
  robots: "index, follow",
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      "name": "PulseDock",
      "applicationCategory": "DeveloperApplication",
      "operatingSystem": "Any",
      "description": "Open-source version intelligence and uptime monitoring tool. Track version updates, monitor uptime, manage incidents, and share public status pages.",
      "url": "https://oc-dev-test.no749ah.com",
      "author": {
        "@type": "Person",
        "name": "No749ah",
        "url": "https://github.com/No749ah",
      },
      "license": "https://github.com/No749ah/PulseDock/blob/main/LICENSE",
      "codeRepository": "https://github.com/No749ah/PulseDock",
      "offers": {
        "@type": "Offer",
        "price": "0",
        "priceCurrency": "USD",
      },
      "featureList": [
        "Version Intelligence — track 1300+ tools",
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
      "name": "PulseDock",
      "url": "https://oc-dev-test.no749ah.com",
      "description": "Version intelligence & uptime monitoring for developers.",
      "potentialAction": {
        "@type": "SearchAction",
        "target": "https://oc-dev-test.no749ah.com/versions?q={search_term_string}",
        "query-input": "required name=search_term_string",
      },
    },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        {/* Favicon */}
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="icon" href="/favicon.ico" sizes="32x32" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180" />
        <link rel="manifest" href="/site.webmanifest" />
        
        {/* Fonts */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />

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
              {children}
              <CommandPalette />
              <PWAInstallBanner />
              <SWRegister />
            </ToastProvider>
          </ThemeProvider>
        </I18nProvider>
      </body>
    </html>
  );
}

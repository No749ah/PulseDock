import "./globals.css";
import "@mantine/core/styles.css";
import type { ReactNode } from "react";
import type { Metadata } from "next";
import { MantineProvider } from "@mantine/core";

export const metadata: Metadata = {
  title: "PulseDock — Version Intelligence & Uptime Monitoring",
  description:
    "Monitor your applications for version updates, security patches, and uptime. Open source, self-hosted, built for developers.",
  keywords: ["monitoring", "uptime", "version tracking", "security", "open source"],
  viewport: "width=device-width, initial-scale=1",
  authors: [{ name: "No749ah", url: "https://github.com/No749ah" }],
  creator: "No749ah",
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
  canonical: "https://oc-dev-test.no749ah.com",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        {/* Favicon */}
        <link rel="icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
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
        
        {/* Theme Color */}
        <meta name="theme-color" content="#050a0e" />
      </head>
      <body className="bg-bg text-text-primary antialiased">
        <MantineProvider forceColorScheme="dark">{children}</MantineProvider>
      </body>
    </html>
  );
}

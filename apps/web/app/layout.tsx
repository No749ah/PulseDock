import "./globals.css";
import "@mantine/core/styles.css";
import type { ReactNode } from "react";
import type { Metadata } from "next";
import { MantineProvider } from "@mantine/core";

export const metadata: Metadata = {
  title: "PulseDock — Version Intelligence & Uptime Monitoring",
  description:
    "Monitor your applications for version updates, security patches, and uptime. Open source, self-hosted, built for developers.",
  openGraph: {
    title: "PulseDock",
    description: "Version intelligence & uptime monitoring for your stack.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
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
      </head>
      <body className="bg-bg text-text-primary antialiased">
        <MantineProvider forceColorScheme="dark">{children}</MantineProvider>
      </body>
    </html>
  );
}

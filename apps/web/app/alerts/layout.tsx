import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Alert Channels — PulseDock",
};

export default function AlertsLayout({ children }: { children: ReactNode }) {
  return children;
}

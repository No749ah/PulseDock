import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Monitor Detail — PulseDock",
};

export default function MonitorDetailLayout({ children }: { children: ReactNode }) {
  return children;
}

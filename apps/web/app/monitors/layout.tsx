import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Monitors — PulseDock",
};

export default function MonitorsLayout({ children }: { children: ReactNode }) {
  return children;
}

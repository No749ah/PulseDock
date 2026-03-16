import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Status Page Editor — PulseDock",
};

export default function StatusPageEditorLayout({ children }: { children: ReactNode }) {
  return children;
}

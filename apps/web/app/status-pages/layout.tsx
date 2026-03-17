import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Status Pages — PulseDock",
};

export default function StatusPagesLayout({ children }: { children: ReactNode }) {
  return children;
}

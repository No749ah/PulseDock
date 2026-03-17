import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Version Checks — PulseDock",
};

export default function VersionsLayout({ children }: { children: ReactNode }) {
  return children;
}

import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Projects — PulseDock",
};

export default function ProjectsLayout({ children }: { children: ReactNode }) {
  return children;
}

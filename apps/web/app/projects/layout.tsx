import type { Metadata } from "next";
import type { ReactNode } from "react";
import { brand } from "../../lib/brand";

export const metadata: Metadata = {
  title: `Projects — ${brand.name}`,
};

export default function ProjectsLayout({ children }: { children: ReactNode }) {
  return children;
}

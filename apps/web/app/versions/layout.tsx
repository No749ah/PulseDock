import type { Metadata } from "next";
import type { ReactNode } from "react";
import { brand } from "../../lib/brand";

export const metadata: Metadata = {
  title: `Version Checks — ${brand.name}`,
};

export default function VersionsLayout({ children }: { children: ReactNode }) {
  return children;
}

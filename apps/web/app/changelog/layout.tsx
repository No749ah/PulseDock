import type { Metadata } from "next";
import type { ReactNode } from "react";
import { brand } from "../../lib/brand";

export const metadata: Metadata = {
  title: `Changelog — ${brand.name}`,
};

export default function ChangelogLayout({ children }: { children: ReactNode }) {
  return children;
}

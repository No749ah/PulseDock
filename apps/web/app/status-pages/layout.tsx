import type { Metadata } from "next";
import type { ReactNode } from "react";
import { brand } from "../../lib/brand";

export const metadata: Metadata = {
  title: `Status Pages — ${brand.name}`,
};

export default function StatusPagesLayout({ children }: { children: ReactNode }) {
  return children;
}

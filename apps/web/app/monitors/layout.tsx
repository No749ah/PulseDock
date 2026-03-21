import type { Metadata } from "next";
import type { ReactNode } from "react";
import { brand } from "../../lib/brand";

export const metadata: Metadata = {
  title: `Monitors — ${brand.name}`,
};

export default function MonitorsLayout({ children }: { children: ReactNode }) {
  return children;
}

import type { Metadata } from "next";
import type { ReactNode } from "react";
import { brand } from "../../lib/brand";

export const metadata: Metadata = {
  title: `Dashboard — ${brand.name}`,
};

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return children;
}

import type { Metadata } from "next";
import type { ReactNode } from "react";
import { brand } from "../../lib/brand";

export const metadata: Metadata = {
  title: `Maintenance Windows — ${brand.name}`,
};

export default function MaintenanceLayout({ children }: { children: ReactNode }) {
  return children;
}

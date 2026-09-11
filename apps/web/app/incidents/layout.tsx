import type { Metadata } from "next";
import type { ReactNode } from "react";
import { brand } from "../../lib/brand";

export const metadata: Metadata = {
  title: `Incidents — ${brand.name}`,
};

export default function IncidentsLayout({ children }: { children: ReactNode }) {
  return children;
}

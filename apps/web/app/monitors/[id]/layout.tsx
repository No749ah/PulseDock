import type { Metadata } from "next";
import type { ReactNode } from "react";
import { brand } from "../../../lib/brand";

export const metadata: Metadata = {
  title: `Monitor Detail — ${brand.name}`,
};

export default function MonitorDetailLayout({ children }: { children: ReactNode }) {
  return children;
}

import type { Metadata } from "next";
import type { ReactNode } from "react";
import { brand } from "../../lib/brand";

export const metadata: Metadata = {
  title: `Alert Channels — ${brand.name}`,
};

export default function AlertsLayout({ children }: { children: ReactNode }) {
  return children;
}

import type { Metadata } from "next";
import type { ReactNode } from "react";
import { brand } from "../../lib/brand";

export const metadata: Metadata = {
  title: `Reliability Analytics — ${brand.name}`,
};

export default function MttrLayout({ children }: { children: ReactNode }) {
  return children;
}

import type { Metadata } from "next";
import type { ReactNode } from "react";
import { brand } from "../../lib/brand";

export const metadata: Metadata = {
  title: `Reports — ${brand.name}`,
};

export default function ReportsLayout({ children }: { children: ReactNode }) {
  return children;
}

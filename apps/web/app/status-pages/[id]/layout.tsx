import type { Metadata } from "next";
import type { ReactNode } from "react";
import { brand } from "../../../lib/brand";

export const metadata: Metadata = {
  title: `Status Page Editor — ${brand.name}`,
};

export default function StatusPageEditorLayout({ children }: { children: ReactNode }) {
  return children;
}

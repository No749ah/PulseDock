import type { Metadata } from "next";
import type { ReactNode } from "react";
import { brand } from "../../lib/brand";

export const metadata: Metadata = {
  title: `Folders — ${brand.name}`,
};

export default function FoldersLayout({ children }: { children: ReactNode }) {
  return children;
}

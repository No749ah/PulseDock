import type { Metadata } from "next";
import type { ReactNode } from "react";
import { brand } from "../../lib/brand";

export const metadata: Metadata = {
  title: `Admin — ${brand.name}`,
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return children;
}

import type { Metadata } from "next";
import type { ReactNode } from "react";
import { brand } from "../../lib/brand";

export const metadata: Metadata = {
  title: `Account — ${brand.name}`,
};

export default function AccountLayout({ children }: { children: ReactNode }) {
  return children;
}

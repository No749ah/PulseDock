import type { Metadata } from "next";
import type { ReactNode } from "react";
import { brand } from "../../lib/brand";

export const metadata: Metadata = {
  title: `Sign In — ${brand.name}`,
};

export default function LoginLayout({ children }: { children: ReactNode }) {
  return children;
}

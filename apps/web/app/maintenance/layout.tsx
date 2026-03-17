import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Maintenance Windows — PulseDock",
};

export default function MaintenanceLayout({ children }: { children: ReactNode }) {
  return children;
}

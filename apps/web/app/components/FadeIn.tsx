"use client";

import type { ReactNode } from "react";

interface FadeInProps {
  children: ReactNode;
  delay?: number;
  duration?: number;
  className?: string;
}

/**
 * Placeholder FadeIn component - framer-motion v12 has typing issues with React 19.
 * TODO: Migrate to alternative animation library or wait for framer-motion fix.
 * For now, renders children without animations.
 */
export function FadeIn({ children, className }: FadeInProps) {
  return (
    <div className={className}>
      {children}
    </div>
  );
}

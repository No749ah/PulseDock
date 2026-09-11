"use client";

import type { CSSProperties, ReactNode } from "react";

interface GradientTextProps {
  children: ReactNode;
  className?: string;
  from?: string;
  to?: string;
}

export function GradientText({
  children,
  className = "",
  from = "#58a6ff",
  to = "#a78bfa",
}: GradientTextProps) {
  return (
    <span
      className={`bg-clip-text text-transparent ${className}`}
      style={{ '--grad-from': from, '--grad-to': to, backgroundImage: 'linear-gradient(135deg, var(--grad-from), var(--grad-to))' } as CSSProperties}
    >
      {children}
    </span>
  );
}

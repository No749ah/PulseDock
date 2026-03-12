"use client";

import type { ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  className?: string;
  hover?: boolean;
}

export function Card({ children, className = "", hover = false }: CardProps) {
  return (
    <div
      className={`rounded-2xl border border-border bg-surface p-6 transition-all ${
        hover ? "hover:border-border-hover hover:bg-surface-elevated" : ""
      } ${className}`}
    >
      {children}
    </div>
  );
}

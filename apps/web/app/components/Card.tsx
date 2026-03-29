"use client";

import type { ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  onClick?: () => void;
}

export function Card({ children, className = "", hover = false, onClick }: CardProps) {
  return (
    <div
      onClick={onClick}
      className={`rounded-2xl border border-border bg-surface p-6 transition-all duration-200 ${
        hover
          ? "hover:border-border-hover hover:bg-surface-elevated hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/20 cursor-pointer"
          : ""
      } ${className}`}
    >
      {children}
    </div>
  );
}

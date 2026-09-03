"use client";

import type { ReactNode } from "react";
import { CARD_BASE, CARD_HOVER } from "../design-tokens";

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
      className={`${CARD_BASE} ${hover ? CARD_HOVER : ""} ${className}`}
    >
      {children}
    </div>
  );
}

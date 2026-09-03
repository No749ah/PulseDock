"use client";

import type { KeyboardEvent, ReactNode } from "react";
import { CARD_BASE, CARD_HOVER } from "../design-tokens";

interface CardProps {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  onClick?: () => void;
}

export function Card({ children, className = "", hover = false, onClick }: CardProps) {
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!onClick || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    onClick();
  };

  return (
    <div
      onClick={onClick}
      onKeyDown={handleKeyDown}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      className={`${CARD_BASE} ${hover ? CARD_HOVER : ""} ${className}`}
    >
      {children}
    </div>
  );
}

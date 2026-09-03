"use client";

import type { ReactNode } from "react";
import { BUTTON_BASE } from "../design-tokens";

interface ButtonProps {
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  loading?: boolean;
  onClick?: () => void;
  className?: string;
  type?: "button" | "submit" | "reset";
  title?: string;
}

const variants = {
  primary:
    "bg-accent hover:bg-accent-hover text-bg",
  secondary:
    "border border-border hover:border-border-hover text-text-primary",
  ghost:
    "text-text-secondary hover:text-text-primary",
};

const sizes = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-4 py-2 text-base",
  lg: "px-6 py-3 text-base",
};

export function Button({
  children,
  variant = "primary",
  size = "md",
  disabled = false,
  loading = false,
  onClick,
  className = "",
  type = "button",
  title,
}: ButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      title={title}
      className={`${BUTTON_BASE} ${variants[variant]} ${sizes[size]} ${className}`}
    >
      {children}
    </button>
  );
}

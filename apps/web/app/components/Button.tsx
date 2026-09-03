"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { BUTTON_BASE } from "../design-tokens";

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children"> {
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  loading?: boolean;
  onClick?: ButtonHTMLAttributes<HTMLButtonElement>["onClick"];
  className?: string;
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
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      {...props}
      onClick={onClick}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`${BUTTON_BASE} ${variants[variant]} ${sizes[size]} ${className}`}
    >
      {children}
    </button>
  );
}

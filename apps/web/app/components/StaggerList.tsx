"use client";

import type { ReactNode } from "react";

interface StaggerListProps {
  children: ReactNode;
  className?: string;
  /** When true, animate children in staggered sequence on mount */
  animate?: boolean;
}

/**
 * Wraps children in a staggered fade-in-up animation.
 * Uses CSS `.stagger-children` class defined in globals.css.
 * Respects `prefers-reduced-motion` automatically.
 *
 * @example
 * <StaggerList className="grid grid-cols-3 gap-4">
 *   <Card>...</Card>
 *   <Card>...</Card>
 * </StaggerList>
 */
export function StaggerList({ children, className = "", animate = true }: StaggerListProps) {
  return (
    <div className={`${animate ? "stagger-children" : ""} ${className}`}>
      {children}
    </div>
  );
}

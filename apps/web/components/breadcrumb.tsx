"use client";

import Link from "next/link";
import { ChevronRight, Home } from "lucide-react";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
  className?: string;
}

export function Breadcrumb({ items, className = "" }: BreadcrumbProps) {
  return (
    <nav aria-label="Breadcrumb" className={`flex items-center gap-1 text-xs text-text-muted ${className}`}>
      <Link href="/dashboard" className="hover:text-text-secondary transition-colors" aria-label="Home">
        <Home className="h-3 w-3" />
      </Link>
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1">
          <ChevronRight className="h-3 w-3 opacity-40 shrink-0" />
          {item.href && i < items.length - 1 ? (
            <Link href={item.href} className="hover:text-text-secondary transition-colors truncate max-w-[200px]">
              {item.label}
            </Link>
          ) : (
            <span className="text-text-secondary font-medium truncate max-w-[200px]" aria-current="page">
              {item.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  );
}

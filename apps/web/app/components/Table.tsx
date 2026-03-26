"use client";

import type { ReactNode } from "react";

interface TableProps {
  children: ReactNode;
  className?: string;
  noScroll?: boolean;
}

export function Table({ children, className = "", noScroll = false }: TableProps) {
  return (
    <div className={`${noScroll ? "overflow-hidden" : "overflow-x-auto"} rounded-lg border border-border ${className}`}>
      <table className="w-full text-sm min-w-0">
        {children}
      </table>
    </div>
  );
}

export function TableHead({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <thead className={`bg-surface-elevated border-b border-border ${className}`}>
      {children}
    </thead>
  );
}

export function TableBody({ children }: { children: ReactNode }) {
  return <tbody>{children}</tbody>;
}

export function TableRow({ children, hover = true, className = "", onClick }: { children: ReactNode; hover?: boolean; className?: string; onClick?: () => void }) {
  return (
    <tr className={`border-b border-border last:border-b-0 ${hover ? "hover:bg-surface-hover transition-colors" : ""} ${className}`} onClick={onClick}>
      {children}
    </tr>
  );
}

export function TableHeader({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <th className={`px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider ${className}`}>
      {children}
    </th>
  );
}

export function TableCell({ children, className = "", title, colSpan }: { children: ReactNode; className?: string; title?: string; colSpan?: number }) {
  return (
    <td className={`px-4 py-3 text-text-primary ${className}`} title={title} colSpan={colSpan}>
      {children}
    </td>
  );
}

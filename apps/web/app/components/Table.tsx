"use client";

import type { ReactNode } from "react";

interface TableProps {
  children: ReactNode;
  className?: string;
}

export function Table({ children, className = "" }: TableProps) {
  return (
    <div className={`overflow-x-auto rounded-lg border border-border ${className}`}>
      <table className="w-full text-sm">
        {children}
      </table>
    </div>
  );
}

export function TableHead({ children }: { children: ReactNode }) {
  return (
    <thead className="bg-surface-elevated border-b border-border">
      {children}
    </thead>
  );
}

export function TableBody({ children }: { children: ReactNode }) {
  return <tbody>{children}</tbody>;
}

export function TableRow({ children, hover = true }: { children: ReactNode; hover?: boolean }) {
  return (
    <tr className={`border-b border-border last:border-b-0 ${hover ? "hover:bg-surface-hover transition-colors" : ""}`}>
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

export function TableCell({ children, className = "", title }: { children: ReactNode; className?: string; title?: string }) {
  return (
    <td className={`px-4 py-3 text-text-primary ${className}`} title={title}>
      {children}
    </td>
  );
}

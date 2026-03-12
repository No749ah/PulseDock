'use client';

import { ReactNode } from 'react';

export function ResponsiveTable({ children }: { children: ReactNode; minWidth?: number }) {
  return (
    <div className="overflow-x-auto w-full">
      <table className="w-full text-sm text-left border-collapse">
        {children}
      </table>
    </div>
  );
}

export default ResponsiveTable;

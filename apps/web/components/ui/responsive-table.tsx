'use client';

import type { ReactNode } from 'react';
import { ScrollArea, Table } from '@mantine/core';

export function ResponsiveTable({ children, minWidth = 820 }: { children: ReactNode; minWidth?: number }) {
  return (
    <ScrollArea>
      <Table withTableBorder withColumnBorders miw={minWidth}>
        {children}
      </Table>
    </ScrollArea>
  );
}

export default ResponsiveTable;

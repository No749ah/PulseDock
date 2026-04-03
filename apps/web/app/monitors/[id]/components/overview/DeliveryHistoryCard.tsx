"use client";

import React from "react";
import { Activity } from "lucide-react";
import { Card } from "../../../../components/Card";
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from "../../../../components/Table";
import { relativeTime } from "../../../../components/timeUtils";
import { CHANNEL_TYPE_BADGE_COLORS, triggerLabel } from "./deliveryHistoryHelpers";

interface Delivery {
  id: string;
  channelId: string;
  channelName: string;
  channelType: string;
  status: "success" | "failed";
  trigger: string | null;
  errorMessage: string | null;
  durationMs: number | null;
  createdAt: string;
}

interface DeliveryHistory {
  total: number;
  successCount: number;
  failedCount: number;
  deliveries: Delivery[];
}

interface Props {
  deliveryHistory: DeliveryHistory | null;
}

export function DeliveryHistoryCard({ deliveryHistory }: Props) {
  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-2">
          <Activity className="w-4 h-4" />
          Notifications
        </h2>
        {deliveryHistory && (
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <span className="text-success">{deliveryHistory.successCount} ok</span>
            {deliveryHistory.failedCount > 0 && (
              <span className="text-error">{deliveryHistory.failedCount} failed</span>
            )}
            <span>/ {deliveryHistory.total} total</span>
          </div>
        )}
      </div>
      {!deliveryHistory || deliveryHistory.deliveries.length === 0 ? (
        <p className="text-xs text-text-muted text-center py-4">No alert deliveries yet for this monitor.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>Timestamp</TableHeader>
                <TableHeader>Channel</TableHeader>
                <TableHeader>Type</TableHeader>
                <TableHeader>Trigger</TableHeader>
                <TableHeader>Status</TableHeader>
                <TableHeader>Duration</TableHeader>
                <TableHeader>Error</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {deliveryHistory.deliveries.map((d) => {
                const channelTypeCls = CHANNEL_TYPE_BADGE_COLORS[d.channelType] ?? "bg-surface-elevated text-text-muted border-border";
                return (
                  <TableRow key={d.id}>
                    <TableCell className="text-xs text-text-muted whitespace-nowrap">{relativeTime(d.createdAt)}</TableCell>
                    <TableCell className="text-sm text-text-primary">{d.channelName}</TableCell>
                    <TableCell>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium uppercase tracking-wider ${channelTypeCls}`}>
                        {d.channelType}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-text-secondary">{triggerLabel(d.trigger)}</TableCell>
                    <TableCell>
                      {d.status === "success" ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded border font-medium uppercase tracking-wider bg-success/15 text-success border-success/30">
                          Success
                        </span>
                      ) : (
                        <span className="text-[10px] px-1.5 py-0.5 rounded border font-medium uppercase tracking-wider bg-error/15 text-error border-error/30">
                          Failed
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-text-muted">
                      {d.durationMs != null ? `${d.durationMs}ms` : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-error max-w-[200px] truncate" title={d.errorMessage ?? undefined}>
                      {d.errorMessage ?? "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  );
}

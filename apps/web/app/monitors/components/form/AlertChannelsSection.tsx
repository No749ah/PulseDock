"use client";

import React from "react";

interface AlertChannelsSectionProps {
  className?: string;
}

export function AlertChannelsSection({ className }: AlertChannelsSectionProps) {
  return (
    <div className={className}>
      <label className="block text-sm font-semibold text-text-primary">Alert Channels</label>
      <p className="mt-1 text-xs text-text-secondary">
        Alert channel assignment and notifyOn preferences are currently managed outside this modal.
      </p>
    </div>
  );
}

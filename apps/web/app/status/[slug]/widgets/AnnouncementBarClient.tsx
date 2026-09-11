"use client";

import { useState } from "react";

interface AnnouncementBarClientProps {
  message: string;
  type: "info" | "warning" | "danger" | "success";
  dismissable: boolean;
}

const bgMap: Record<string, string> = {
  info: "bg-blue-500/20 border-blue-500/40 text-blue-200",
  warning: "bg-yellow-500/20 border-yellow-500/40 text-yellow-200",
  danger: "bg-red-500/20 border-red-500/40 text-red-200",
  success: "bg-green-500/20 border-green-500/40 text-green-200",
};

const iconMap: Record<string, string> = {
  info: "ℹ️",
  warning: "⚠️",
  danger: "🚨",
  success: "✅",
};

export function AnnouncementBarClient({ message, type, dismissable }: AnnouncementBarClientProps) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const cls = bgMap[type] ?? bgMap.info;
  const icon = iconMap[type] ?? "ℹ️";

  return (
    <div className={`rounded-xl border p-3 flex items-start gap-3 ${cls}`}>
      <span className="text-base flex-shrink-0 mt-0.5">{icon}</span>
      <span className="flex-1 text-sm font-medium leading-relaxed">{message}</span>
      {dismissable && (
        <button
          className="flex-shrink-0 text-current opacity-60 hover:opacity-100 transition-opacity ml-auto"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss"
        >
          ✕
        </button>
      )}
    </div>
  );
}

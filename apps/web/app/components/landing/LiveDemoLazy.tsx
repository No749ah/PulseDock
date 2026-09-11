"use client";

import dynamic from "next/dynamic";

const LiveDemoInner = dynamic(
  () => import("./LiveDemo").then((m) => ({ default: m.LiveDemo })),
  {
    loading: () => (
      <div className="h-64 flex items-center justify-center">
        <div className="text-white/30 text-sm">Loading demo...</div>
      </div>
    ),
    ssr: false,
  }
);

export function LiveDemoLazy() {
  return <LiveDemoInner />;
}

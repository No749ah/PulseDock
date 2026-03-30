"use client";

import React, { useState, useRef, useEffect } from "react";
import { ChevronDown } from "lucide-react";

export interface TabDef {
  id: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  /** Only show this tab when true (default: true) */
  visible?: boolean;
  /** Primary tabs are always visible; secondary tabs go into "More" dropdown */
  primary?: boolean;
  /** Badge count shown next to label */
  badge?: number;
  /** Called when this tab is selected */
  onSelect?: () => void;
}

interface MonitorTabBarProps {
  tabs: TabDef[];
  activeTab: string;
  onTabChange: (id: string) => void;
}

/**
 * Grouped tab bar: primary tabs always visible, secondary tabs in a "More" dropdown.
 * Replaces the 17-tab flat scrollbar with progressive disclosure.
 */
export function MonitorTabBar({ tabs, activeTab, onTabChange }: MonitorTabBarProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  const visibleTabs = tabs.filter((t) => t.visible !== false);
  const primaryTabs = visibleTabs.filter((t) => t.primary !== false);
  const secondaryTabs = visibleTabs.filter((t) => t.primary === false);
  const activeSecondary = secondaryTabs.find((t) => t.id === activeTab);

  // Close dropdown on outside click
  useEffect(() => {
    if (!moreOpen) return;
    function handleClick(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [moreOpen]);

  const tabClass = (isActive: boolean) =>
    [
      "px-4 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap flex items-center gap-1.5",
      isActive
        ? "bg-white/10 text-text-primary"
        : "text-text-muted hover:text-text-secondary",
    ].join(" ");

  return (
    <div className="flex items-center gap-1 p-1 bg-white/3 border border-white/8 rounded-xl max-w-full">
      <div className="flex gap-1 overflow-x-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
        {primaryTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => {
              onTabChange(tab.id);
              tab.onSelect?.();
            }}
            className={tabClass(activeTab === tab.id)}
          >
            {tab.icon && <tab.icon className="w-3.5 h-3.5" />}
            {tab.label}
            {tab.badge != null && tab.badge > 0 && (
              <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-accent/20 text-accent text-[10px] font-bold">
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {secondaryTabs.length > 0 && (
        <>
          {/* Divider */}
          <div className="w-px h-5 bg-white/10 shrink-0 mx-0.5" />

          {/* More dropdown */}
          <div className="relative shrink-0" ref={moreRef}>
            <button
              onClick={() => setMoreOpen((v) => !v)}
              className={[
                "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap flex items-center gap-1.5",
                activeSecondary
                  ? "bg-white/10 text-text-primary"
                  : "text-text-muted hover:text-text-secondary",
              ].join(" ")}
            >
              {activeSecondary ? (
                <>
                  {activeSecondary.icon && <activeSecondary.icon className="w-3.5 h-3.5" />}
                  {activeSecondary.label}
                </>
              ) : (
                "More"
              )}
              <ChevronDown
                className={[
                  "w-3 h-3 transition-transform duration-200",
                  moreOpen ? "rotate-180" : "",
                ].join(" ")}
              />
            </button>

            {moreOpen && (
              <div className="absolute left-0 top-full mt-2 w-52 bg-surface border border-border rounded-xl shadow-xl shadow-black/30 overflow-hidden z-50">
                <div className="py-1 max-h-72 overflow-y-auto">
                  {secondaryTabs.map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => {
                        onTabChange(tab.id);
                        tab.onSelect?.();
                        setMoreOpen(false);
                      }}
                      className={[
                        "w-full flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors text-left",
                        activeTab === tab.id
                          ? "bg-accent/10 text-accent font-medium"
                          : "text-text-secondary hover:text-text-primary hover:bg-surface-elevated",
                      ].join(" ")}
                    >
                      {tab.icon && (
                        <tab.icon
                          className={[
                            "w-4 h-4 shrink-0",
                            activeTab === tab.id ? "text-accent" : "text-text-muted",
                          ].join(" ")}
                        />
                      )}
                      <span className="truncate">{tab.label}</span>
                      {tab.badge != null && tab.badge > 0 && (
                        <span className="ml-auto inline-flex items-center justify-center w-4 h-4 rounded-full bg-accent/20 text-accent text-[10px] font-bold">
                          {tab.badge}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

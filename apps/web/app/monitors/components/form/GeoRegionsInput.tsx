"use client";

import React, { useRef, useState } from "react";
import { X } from "lucide-react";

interface GeoRegionsInputProps {
  regions: string[];
  onChange: (regions: string[]) => void;
}

export function GeoRegionsInput({ regions, onChange }: GeoRegionsInputProps) {
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const addRegion = (value: string) => {
    const trimmed = value.trim().slice(0, 50);
    if (!trimmed || regions.includes(trimmed) || regions.length >= 10) return;
    onChange([...regions, trimmed]);
  };

  const removeRegion = (region: string) => {
    onChange(regions.filter((r) => r !== region));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === "Enter" || e.key === ",") && inputValue.trim()) {
      e.preventDefault();
      addRegion(inputValue.replace(/,+$/, "").trim());
      setInputValue("");
    } else if (e.key === "Backspace" && !inputValue && regions.length > 0) {
      removeRegion(regions[regions.length - 1]);
    }
  };

  return (
    <div className="border-t border-border pt-4 mt-2">
      <label className="block text-sm font-semibold text-text-primary mb-2">Geo Regions</label>
      <div
        className="min-h-[42px] flex flex-wrap gap-1.5 items-center px-3 py-2 rounded-xl border border-border bg-surface focus-within:ring-1 focus-within:ring-accent cursor-text"
        onClick={() => inputRef.current?.focus()}
      >
        {regions.map((region) => (
          <span
            key={region}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-accent/15 text-accent border border-accent/30"
          >
            {region}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); removeRegion(region); }}
              className="hover:text-danger transition-colors ml-0.5"
              aria-label={`Remove region ${region}`}
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            if (inputValue.trim()) {
              addRegion(inputValue.trim());
              setInputValue("");
            }
          }}
          placeholder={regions.length === 0 ? "e.g. us-east-1 — press Enter or comma to add" : regions.length >= 10 ? "Max 10 regions" : "Add region…"}
          disabled={regions.length >= 10}
          className="flex-1 min-w-[140px] bg-transparent text-sm text-text-primary placeholder-text-muted outline-none"
        />
      </div>
      <p className="text-xs text-text-muted mt-1.5">
        Assign region labels to checks for multi-region analysis. Labels are applied round-robin to each check run.{" "}
        <span className="text-text-secondary">{regions.length}/10 regions · max 50 chars each</span>
      </p>
    </div>
  );
}

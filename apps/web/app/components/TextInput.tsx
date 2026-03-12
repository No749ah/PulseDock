"use client";

import type { ReactNode } from "react";

interface TextInputProps {
  label?: string;
  placeholder?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  disabled?: boolean;
  type?: string;
  className?: string;
}

export function TextInput({
  label,
  placeholder,
  value,
  onChange,
  disabled = false,
  type = "text",
  className = "",
}: TextInputProps) {
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {label && (
        <label className="text-sm font-medium text-text-secondary">
          {label}
        </label>
      )}
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        className="px-3 py-2 bg-surface border border-border rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:border-accent disabled:opacity-50 disabled:cursor-not-allowed"
      />
    </div>
  );
}

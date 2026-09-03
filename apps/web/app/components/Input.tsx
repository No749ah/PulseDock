"use client";

import type { InputHTMLAttributes } from "react";
import { INPUT_BASE } from "../design-tokens";

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "className"> {
  label?: string;
  error?: string;
  className?: string;
}

/** Consistent form input with accessible label and error messaging. */
export function Input({ label, error, id, className = "", ...props }: InputProps) {
  const inputId = id ?? (label ? `input-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}` : undefined);
  return (
    <div className={className}>
      {label && <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium text-text-secondary">{label}</label>}
      <input
        {...props}
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error && inputId ? `${inputId}-error` : undefined}
        className={`${INPUT_BASE} ${error ? "border-danger focus:border-danger focus:ring-danger/30" : ""}`}
      />
      {error && <p id={inputId ? `${inputId}-error` : undefined} className="mt-1.5 text-sm text-danger" role="alert">{error}</p>}
    </div>
  );
}

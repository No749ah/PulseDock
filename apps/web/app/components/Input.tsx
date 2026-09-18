"use client";

import { useId } from "react";
import type { InputHTMLAttributes } from "react";
import { INPUT_BASE } from "../design-tokens";

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "className"> {
  label?: string;
  error?: string;
  className?: string;
}

/** Consistent form input with accessible label and error messaging. */
export function Input({ label, error, id, className = "", ...props }: InputProps) {
  const generatedId = useId().replace(/:/g, "");
  const inputId = id ?? (label ? `input-${generatedId}` : undefined);
  const errorId = inputId && error ? `${inputId}-error` : undefined;
  const describedBy = [props["aria-describedby"], errorId].filter(Boolean).join(" ") || undefined;
  const ariaInvalid = error ? true : props["aria-invalid"];
  return (
    <div className={className}>
      {label && <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium text-text-secondary">{label}</label>}
      <input
        {...props}
        id={inputId}
        aria-invalid={ariaInvalid}
        aria-describedby={describedBy}
        className={`${INPUT_BASE} ${error ? "border-danger focus:border-danger focus:ring-danger/30" : ""}`}
      />
      {error && <p id={errorId} className="mt-1.5 text-sm text-danger" role="alert">{error}</p>}
    </div>
  );
}

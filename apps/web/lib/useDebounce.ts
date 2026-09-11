"use client";

import { useEffect, useState } from "react";

/**
 * Returns a debounced version of `value` that only updates after `delay` ms of no changes.
 * Use this on search inputs to avoid filtering on every keystroke.
 *
 * @param value - The value to debounce.
 * @param delay - Debounce delay in milliseconds (default: 250).
 * @returns The debounced value.
 *
 * @example
 * const [search, setSearch] = useState("");
 * const debouncedSearch = useDebounce(search, 300);
 * // Use debouncedSearch for filtering instead of search
 */
export function useDebounce<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { defaultLocale, messages, type Locale } from "../lib/i18n/messages";

type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

const STORAGE_KEY = "pulsedock_locale";

function getByKeyPath(source: unknown, key: string): string | undefined {
  if (!source || typeof source !== "object") return undefined;

  let current: unknown = source;
  for (const part of key.split(".")) {
    if (!current || typeof current !== "object" || !(part in current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return typeof current === "string" ? current : undefined;
}

function resolveLocale(raw?: string | null): Locale {
  if (raw === "de" || raw === "en") return raw;
  return defaultLocale;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(defaultLocale);

  useEffect(() => {
    const storedLocale = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    const browserLocale = typeof navigator !== "undefined" ? navigator.language?.slice(0, 2) : null;
    setLocaleState(resolveLocale(storedLocale ?? browserLocale));
  }, []);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = locale;
    }
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, locale);
    }
  }, [locale]);

  const t = useCallback(
    (key: string): string => {
      return (
        getByKeyPath(messages[locale], key) ??
        getByKeyPath(messages[defaultLocale], key) ??
        key
      );
    },
    [locale],
  );

  const setLocale = useCallback((nextLocale: Locale) => {
    setLocaleState(nextLocale);
  }, []);

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale,
      t,
    }),
    [locale, setLocale, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const value = useContext(I18nContext);
  if (!value) {
    throw new Error("useI18n must be used within I18nProvider");
  }
  return value;
}

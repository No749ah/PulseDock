"use client";

import { useI18n } from "../../components/i18n-provider";
import { type Locale } from "../../lib/i18n/messages";

const locales: Locale[] = ["en", "de"];

export function LocaleSwitcher({ compact = false }: { compact?: boolean }) {
  const { locale, setLocale, t } = useI18n();

  return (
    <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface-elevated p-1">
      {locales.map((item) => {
        const selected = item === locale;
        return (
          <button
            key={item}
            type="button"
            onClick={() => setLocale(item)}
            aria-label={`${t("common.locale")}: ${item.toUpperCase()}`}
            className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
              selected
                ? "bg-accent text-bg"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            {compact ? item.toUpperCase() : item === "en" ? t("common.english") : t("common.german")}
          </button>
        );
      })}
    </div>
  );
}

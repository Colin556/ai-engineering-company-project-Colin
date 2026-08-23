"use client";

import { useI18n } from "@/lib/i18n";

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n();

  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-amber-800/20 bg-amber-50 px-3 py-1 text-sm">
      <span className="font-semibold text-amber-900">{t.languageToggle}</span>
      <button
        type="button"
        onClick={() => setLocale("es")}
        className={`rounded-full px-3 py-1 transition ${
          locale === "es"
            ? "bg-amber-700 text-white"
            : "bg-white text-amber-800 hover:bg-amber-100"
        }`}
      >
        ES
      </button>
      <button
        type="button"
        onClick={() => setLocale("en")}
        className={`rounded-full px-3 py-1 transition ${
          locale === "en"
            ? "bg-amber-700 text-white"
            : "bg-white text-amber-800 hover:bg-amber-100"
        }`}
      >
        EN
      </button>
    </div>
  );
}

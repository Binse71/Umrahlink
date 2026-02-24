"use client";

import { useLanguage } from "@/components/LanguageProvider";

export default function LanguageSwitcher() {
  const { locale, setLocale } = useLanguage();

  return (
    <div className="language-switcher" role="group" aria-label="Language switcher">
      <button
        className={`lang-option ${locale === "en" ? "active" : ""}`}
        onClick={() => setLocale("en")}
        type="button"
      >
        EN
      </button>
      <button
        className={`lang-option ${locale === "ar" ? "active" : ""}`}
        onClick={() => setLocale("ar")}
        type="button"
      >
        AR
      </button>
    </div>
  );
}

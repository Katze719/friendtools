import { Globe } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from "../i18n";

const LABELS: Record<SupportedLanguage, string> = {
  en: "EN",
  de: "DE",
};

export default function LanguageSwitcher() {
  const { i18n, t } = useTranslation();
  const current = (i18n.resolvedLanguage ?? i18n.language ?? "en").split("-")[0] as SupportedLanguage;

  return (
    <div className="inline-flex items-center gap-1" role="group" aria-label={t("common.language")}>
      <Globe className="h-4 w-4 text-slate-400 dark:text-slate-500" aria-hidden />
      <div className="inline-flex overflow-hidden rounded-lg border border-slate-200 bg-white text-xs dark:border-slate-700 dark:bg-slate-900">
        {SUPPORTED_LANGUAGES.map((lng) => {
          const active = lng === current;
          return (
            <button
              key={lng}
              type="button"
              onClick={() => void i18n.changeLanguage(lng)}
              aria-pressed={active}
              className={`px-2 py-1 font-medium transition ${
                active
                  ? "bg-brand-600 text-white"
                  : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
            >
              {LABELS[lng]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

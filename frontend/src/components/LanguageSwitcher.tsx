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
      <div className="segmented">
        {SUPPORTED_LANGUAGES.map((lng) => {
          const active = lng === current;
          return (
            <button
              key={lng}
              type="button"
              onClick={() => void i18n.changeLanguage(lng)}
              aria-pressed={active}
              className={`segmented-item-compact font-medium ${
                active ? "segmented-item-active" : "segmented-item-idle"
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

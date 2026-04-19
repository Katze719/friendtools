import { Info, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

/**
 * Dismissible "what does this do?" banner, rendered above a tab/section.
 *
 * Dismissal is persisted in localStorage per `storageKey`, so returning users
 * who already understand the section don't see it twice.
 */
export default function HelpBanner({
  storageKey,
  title,
  children,
}: {
  storageKey: string;
  title: string;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem(storageKey) === "1";
    } catch {
      return false;
    }
  });

  if (dismissed) return null;

  function close() {
    setDismissed(true);
    try {
      localStorage.setItem(storageKey, "1");
    } catch {
      /* storage may be disabled */
    }
  }

  // NB: we use slate-800 for the dark background because our tailwind theme
  // only defines `brand` up to 900. Any `brand-950` utility would silently
  // fall through, leaving the light `bg-brand-50` in place and making the
  // banner near-unreadable in dark mode (light bg, light-gray text).
  return (
    <div
      role="note"
      className="flex gap-3 rounded-lg border border-brand-200/70 bg-brand-50/60 p-3 text-sm dark:border-brand-800/60 dark:bg-slate-800/80"
    >
      <Info
        className="mt-0.5 h-4 w-4 shrink-0 text-brand-600 dark:text-brand-300"
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="font-medium text-slate-800 dark:text-slate-50">{title}</p>
        <div className="text-slate-600 dark:text-slate-200">{children}</div>
      </div>
      <button
        type="button"
        className="-my-1 -mr-1 h-7 shrink-0 rounded-md px-2 text-slate-400 hover:bg-slate-200/60 hover:text-slate-700 dark:text-slate-300 dark:hover:bg-slate-700/70 dark:hover:text-slate-50"
        onClick={close}
        aria-label={t("common.dismiss")}
        title={t("common.dismiss")}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

import { MoreHorizontal, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import LanguageSwitcher from "./LanguageSwitcher";
import ThemeSwitcher from "./ThemeSwitcher";

/**
 * Compact menu for narrow viewports: bundles theme and language
 * switchers behind a single icon button so the header stays clean
 * on phones. On sm+ the switchers are rendered inline in the
 * header instead and this component hides itself.
 */
export default function HeaderMenu() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent | TouchEvent) {
      const target = e.target as Node;
      if (
        panelRef.current?.contains(target) ||
        buttonRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative sm:hidden">
      <button
        ref={buttonRef}
        type="button"
        className="btn-ghost"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={t("layout.menu")}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? (
          <X className="h-4 w-4" />
        ) : (
          <MoreHorizontal className="h-4 w-4" />
        )}
      </button>
      {open && (
        <div
          ref={panelRef}
          role="menu"
          className="absolute right-0 top-full z-30 mt-2 w-56 rounded-xl border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-700 dark:bg-slate-900"
        >
          <p className="label mb-1">{t("theme.aria")}</p>
          <ThemeSwitcher />
          <p className="label mb-1 mt-3">{t("common.language")}</p>
          <LanguageSwitcher />
        </div>
      )}
    </div>
  );
}

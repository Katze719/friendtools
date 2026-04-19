import { Download, Share, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

/**
 * Chrome's beforeinstallprompt event is not in lib.dom.ts but is widely
 * supported on Android / Chromium desktop. iOS Safari does NOT fire it;
 * there we fall back to a visual "Add to Home Screen" instruction sheet.
 */
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const iPadOs =
    navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return /iPad|iPhone|iPod/.test(ua) || iPadOs;
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true;
}

type Variant = "primary" | "secondary" | "ghost";

export default function InstallAppButton({
  variant = "secondary",
  className = "",
}: {
  variant?: Variant;
  className?: string;
}) {
  const { t } = useTranslation();
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState<boolean>(() => isStandalone());
  const [showIosHelp, setShowIosHelp] = useState(false);

  useEffect(() => {
    function onBeforeInstall(e: Event) {
      // Prevent Chrome's default mini-infobar so we can show the prompt
      // from our own button later.
      e.preventDefault();
      setPrompt(e as BeforeInstallPromptEvent);
    }
    function onInstalled() {
      setInstalled(true);
      setPrompt(null);
    }
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) return null;

  const ios = isIos();
  // Android/Chromium: only show once the browser has deemed the site installable.
  // iOS: show always (we provide manual instructions since there's no prompt API).
  if (!ios && !prompt) return null;

  async function onClick() {
    if (ios) {
      setShowIosHelp(true);
      return;
    }
    if (!prompt) return;
    await prompt.prompt();
    try {
      const choice = await prompt.userChoice;
      if (choice.outcome === "accepted") setInstalled(true);
    } catch {
      /* user dismissed */
    }
    // The event can only be used once; drop the reference either way.
    setPrompt(null);
  }

  const btnClass =
    variant === "primary"
      ? "btn-primary"
      : variant === "ghost"
        ? "btn-ghost"
        : "btn-secondary";

  return (
    <>
      <button
        type="button"
        className={`${btnClass} ${className}`}
        onClick={onClick}
        aria-label={t("install.cta")}
      >
        <Download className="h-4 w-4" />
        <span>{t("install.cta")}</span>
      </button>
      {showIosHelp && <IosInstallSheet onClose={() => setShowIosHelp(false)} />}
    </>
  );
}

function IosInstallSheet({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    // Lock body scroll while the sheet is open so the background doesn't
    // jiggle behind the backdrop.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  if (typeof document === "undefined") return null;

  // Render into document.body. Without the portal, the dialog would inherit
  // the header's containing block (the header uses `backdrop-blur`, which
  // creates a new containing block for fixed descendants). That's why the
  // dialog previously appeared confined to the header area.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-black/60 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="install-sheet-title"
      onClick={onClose}
    >
      <div
        className="card my-auto w-full max-w-md space-y-5 overflow-y-auto p-6 shadow-2xl sm:max-w-lg sm:p-7"
        style={{ maxHeight: "100%" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <img
              src="/favicon-192.png"
              alt=""
              width={56}
              height={56}
              className="h-14 w-14 rounded-2xl shadow-sm"
            />
            <div>
              <h3
                id="install-sheet-title"
                className="text-lg font-semibold leading-tight sm:text-xl"
              >
                {t("install.ios.title")}
              </h3>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {t("install.ios.subtitle")}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="btn-ghost -mr-2 -mt-2 shrink-0"
            onClick={onClose}
            aria-label={t("common.close")}
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <ol className="space-y-4 text-base text-slate-700 dark:text-slate-200">
          <li className="flex items-start gap-3">
            <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-semibold text-white">
              1
            </span>
            <span className="flex flex-wrap items-center gap-1 pt-0.5">
              {t("install.ios.step1")}
              <Share className="mx-1 inline h-5 w-5 text-brand-600 dark:text-brand-400" />
            </span>
          </li>
          <li className="flex items-start gap-3">
            <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-semibold text-white">
              2
            </span>
            <span className="pt-0.5">{t("install.ios.step2")}</span>
          </li>
          <li className="flex items-start gap-3">
            <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-semibold text-white">
              3
            </span>
            <span className="pt-0.5">{t("install.ios.step3")}</span>
          </li>
        </ol>
        <button
          type="button"
          className="btn-primary w-full justify-center py-2.5 text-base"
          onClick={onClose}
        >
          {t("common.close")}
        </button>
      </div>
    </div>,
    document.body,
  );
}

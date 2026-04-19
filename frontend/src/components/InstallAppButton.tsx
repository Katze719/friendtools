import { Download, Share, X } from "lucide-react";
import { useEffect, useState } from "react";
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
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-black/50 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="card my-auto max-h-full w-full max-w-sm space-y-4 overflow-y-auto p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <img
              src="/favicon-192.png"
              alt=""
              width={40}
              height={40}
              className="h-10 w-10 rounded-xl"
            />
            <div>
              <h3 className="font-semibold">{t("install.ios.title")}</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t("install.ios.subtitle")}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="btn-ghost -mr-2 -mt-2"
            onClick={onClose}
            aria-label={t("common.close")}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <ol className="space-y-3 text-sm text-slate-700 dark:text-slate-200">
          <li className="flex items-start gap-2">
            <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-semibold text-white">
              1
            </span>
            <span className="flex flex-wrap items-center gap-1">
              {t("install.ios.step1")}
              <Share className="mx-1 inline h-4 w-4 text-brand-600 dark:text-brand-400" />
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-semibold text-white">
              2
            </span>
            <span>{t("install.ios.step2")}</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-semibold text-white">
              3
            </span>
            <span>{t("install.ios.step3")}</span>
          </li>
        </ol>
        <button type="button" className="btn-primary w-full" onClick={onClose}>
          {t("common.close")}
        </button>
      </div>
    </div>
  );
}

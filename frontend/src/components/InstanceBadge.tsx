import { Globe, Lock } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";

interface AuthConfig {
  registration_mode: "approval" | "open";
  password_reset_enabled?: boolean;
}

/**
 * Small pill shown on the login & register screens that tells the visitor
 * up front whether this is a private (admin-approved) or public
 * (open sign-up) instance. Fails silently if the backend is unreachable -
 * the auth flow still works, users just don't get the hint.
 */
export default function InstanceBadge() {
  const { t } = useTranslation();
  const [mode, setMode] = useState<"approval" | "open" | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    api<AuthConfig>("/api/auth/config", { auth: false, signal: controller.signal })
      .then((cfg) => setMode(cfg.registration_mode))
      .catch(() => {
        /* offline or very old backend - render nothing. */
      });
    return () => controller.abort();
  }, []);

  if (!mode) return null;

  const isOpen = mode === "open";
  const Icon = isOpen ? Globe : Lock;
  const containerClass = isOpen
    ? "inline-flex items-center gap-2 rounded-full border border-emerald-200/70 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-900/30 dark:text-emerald-200"
    : "inline-flex items-center gap-2 rounded-full border border-amber-200/70 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800 dark:border-amber-800/60 dark:bg-amber-900/30 dark:text-amber-200";

  return (
    <div className={containerClass} role="status" aria-live="polite">
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      <span>
        {isOpen ? t("instance.public.label") : t("instance.private.label")}
      </span>
      <span className="hidden text-current/70 sm:inline">·</span>
      <span className="hidden text-current/80 sm:inline">
        {isOpen ? t("instance.public.hint") : t("instance.private.hint")}
      </span>
    </div>
  );
}

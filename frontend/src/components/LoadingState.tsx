import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";

type LoadingStateProps = {
  /** Override the label shown under the spinner. Defaults to `common.loading`. */
  label?: string;
  /**
   * Use for route-level spinners that should visually claim the whole
   * content area (e.g. auth bootstrap, initial invite resolution).
   */
  fullHeight?: boolean;
  /**
   * Compact variant for inline use inside a card / section where a tall
   * vertical block would push the rest of the layout around.
   */
  compact?: boolean;
  className?: string;
};

/**
 * Shared loading indicator: a soft pulsing halo around a spinning icon with
 * the localized label underneath. Always horizontally + vertically centered
 * inside its parent so it doesn't end up stranded in the top-left corner
 * like the plain `<p>Lade...</p>` it replaces.
 *
 * Exposes `role="status"` + `aria-live="polite"` so screen readers announce
 * the change without interrupting the user.
 */
export default function LoadingState({
  label,
  fullHeight = false,
  compact = false,
  className = "",
}: LoadingStateProps) {
  const { t } = useTranslation();
  const text = label ?? t("common.loading");

  const sizing = fullHeight
    ? "min-h-[60vh] py-12"
    : compact
      ? "py-6"
      : "py-16";

  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex flex-col items-center justify-center gap-3 text-slate-500 dark:text-slate-400 ${sizing} ${className}`}
    >
      <span
        aria-hidden="true"
        className="relative flex h-10 w-10 items-center justify-center"
      >
        <span className="absolute inset-0 rounded-full bg-brand-500/10 motion-safe:animate-ping" />
        <span className="absolute inset-1 rounded-full bg-brand-500/10" />
        <Loader2 className="relative h-5 w-5 text-brand-600 motion-safe:animate-spin dark:text-brand-400" />
      </span>
      <span className="text-sm font-medium">{text}</span>
    </div>
  );
}

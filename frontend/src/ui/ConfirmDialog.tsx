import { useEffect, useId, useRef } from "react";
import { useTranslation } from "react-i18next";

export type ConfirmVariant = "default" | "danger";

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmVariant;
}

interface Props extends ConfirmOptions {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  variant = "default",
  onConfirm,
  onCancel,
}: Props) {
  const { t } = useTranslation();
  const titleId = useId();
  const descId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    // For danger variants we focus Cancel so the user cannot accidentally
    // confirm a destructive action with Enter.
    const target = variant === "danger" ? cancelRef.current : confirmRef.current;
    target?.focus();
    return () => {
      previouslyFocused?.focus?.();
    };
  }, [open, variant]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
        return;
      }
      if (e.key === "Enter") {
        const active = document.activeElement;
        if (active && active instanceof HTMLButtonElement) return;
        e.preventDefault();
        onConfirm();
        return;
      }
      if (e.key === "Tab") {
        const root = dialogRef.current;
        if (!root) return;
        const focusables = root.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement as HTMLElement | null;
        if (e.shiftKey && active === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onCancel, onConfirm]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center px-4 pb-safe sm:items-center sm:pb-0"
      data-testid="confirm-dialog"
    >
      <button
        type="button"
        aria-label={t("common.cancel")}
        tabIndex={-1}
        onClick={onCancel}
        className="absolute inset-0 cursor-default bg-slate-950/50 backdrop-blur-sm"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={message ? descId : undefined}
        className="relative w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700 sm:rounded-2xl"
      >
        <div className="p-5 sm:p-6">
          <h2
            id={titleId}
            className="text-base font-semibold text-slate-900 dark:text-slate-100"
          >
            {title}
          </h2>
          {message && (
            <p
              id={descId}
              className="mt-2 text-sm text-slate-600 dark:text-slate-300"
            >
              {message}
            </p>
          )}
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              ref={cancelRef}
              type="button"
              className="btn-secondary"
              onClick={onCancel}
            >
              {cancelLabel ?? t("common.cancel")}
            </button>
            <button
              ref={confirmRef}
              type="button"
              className={variant === "danger" ? "btn-danger" : "btn-primary"}
              onClick={onConfirm}
            >
              {confirmLabel ?? t("common.confirm")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

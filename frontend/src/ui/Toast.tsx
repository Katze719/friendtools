import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

export type ToastVariant = "success" | "error" | "info";

export interface ToastData {
  id: number;
  variant: ToastVariant;
  message: string;
  duration?: number;
}

interface ItemProps {
  toast: ToastData;
  onDismiss: (id: number) => void;
}

function ToastItem({ toast, onDismiss }: ItemProps) {
  const { t } = useTranslation();
  const duration = toast.duration ?? (toast.variant === "error" ? 7000 : 4500);

  useEffect(() => {
    if (duration <= 0) return;
    const handle = window.setTimeout(() => onDismiss(toast.id), duration);
    return () => window.clearTimeout(handle);
  }, [toast.id, duration, onDismiss]);

  const Icon =
    toast.variant === "success"
      ? CheckCircle2
      : toast.variant === "error"
        ? AlertCircle
        : Info;

  const tone =
    toast.variant === "success"
      ? "text-emerald-600 dark:text-emerald-400"
      : toast.variant === "error"
        ? "text-rose-600 dark:text-rose-400"
        : "text-sky-600 dark:text-sky-400";

  return (
    <div
      role={toast.variant === "error" ? "alert" : "status"}
      className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl bg-white p-3 shadow-lg ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700"
    >
      <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${tone}`} aria-hidden="true" />
      <p className="min-w-0 flex-1 break-words text-sm text-slate-700 dark:text-slate-200">
        {toast.message}
      </p>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label={t("common.dismiss")}
        title={t("common.dismiss")}
        className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-300"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

interface ContainerProps {
  toasts: ToastData[];
  onDismiss: (id: number) => void;
}

export default function ToastContainer({ toasts, onDismiss }: ContainerProps) {
  if (toasts.length === 0) return null;
  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      data-testid="toast-container"
      className="pointer-events-none fixed inset-x-0 top-2 z-[60] flex flex-col items-center gap-2 px-4 pt-safe sm:inset-x-auto sm:right-4 sm:top-auto sm:bottom-4 sm:items-end sm:pt-0"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

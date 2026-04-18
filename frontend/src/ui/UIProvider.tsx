import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import ConfirmDialog, { type ConfirmOptions } from "./ConfirmDialog";
import ToastContainer, { type ToastData, type ToastVariant } from "./Toast";

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

interface ShowToast {
  (message: string, variant?: ToastVariant, duration?: number): void;
}

interface ToastApi {
  show: ShowToast;
  success: (message: string, duration?: number) => void;
  error: (message: string, duration?: number) => void;
  info: (message: string, duration?: number) => void;
  dismiss: (id: number) => void;
}

interface UIContextValue {
  confirm: ConfirmFn;
  toast: ToastApi;
}

const UIContext = createContext<UIContextValue | null>(null);

interface PendingConfirm extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

export function UIProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const nextIdRef = useRef(1);

  const confirm = useCallback<ConfirmFn>((opts) => {
    return new Promise<boolean>((resolve) => {
      setPending({ ...opts, resolve });
    });
  }, []);

  const handleConfirm = useCallback(() => {
    setPending((current) => {
      current?.resolve(true);
      return null;
    });
  }, []);

  const handleCancel = useCallback(() => {
    setPending((current) => {
      current?.resolve(false);
      return null;
    });
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback<ShowToast>((message, variant = "info", duration) => {
    const id = nextIdRef.current++;
    setToasts((current) => [...current, { id, message, variant, duration }]);
  }, []);

  const toast = useMemo<ToastApi>(
    () => ({
      show,
      success: (message, duration) => show(message, "success", duration),
      error: (message, duration) => show(message, "error", duration),
      info: (message, duration) => show(message, "info", duration),
      dismiss,
    }),
    [show, dismiss],
  );

  const value = useMemo<UIContextValue>(
    () => ({ confirm, toast }),
    [confirm, toast],
  );

  const portalTarget = typeof document !== "undefined" ? document.body : null;

  return (
    <UIContext.Provider value={value}>
      {children}
      {portalTarget &&
        createPortal(
          <>
            <ConfirmDialog
              open={pending !== null}
              title={pending?.title ?? ""}
              message={pending?.message}
              confirmLabel={pending?.confirmLabel}
              cancelLabel={pending?.cancelLabel}
              variant={pending?.variant ?? "default"}
              onConfirm={handleConfirm}
              onCancel={handleCancel}
            />
            <ToastContainer toasts={toasts} onDismiss={dismiss} />
          </>,
          portalTarget,
        )}
    </UIContext.Provider>
  );
}

function useUI(): UIContextValue {
  const ctx = useContext(UIContext);
  if (!ctx) {
    throw new Error("useUI must be used within a UIProvider");
  }
  return ctx;
}

export function useConfirm(): ConfirmFn {
  return useUI().confirm;
}

export function useToast(): ToastApi {
  return useUI().toast;
}

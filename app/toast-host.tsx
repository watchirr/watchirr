"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useState,
  type ReactNode,
} from "react";
import {
  dismissToast,
  pushToast,
  toastAutoDismisses,
  type ToastEntry,
  type ToastType,
} from "@/lib/toast";

const AUTO_MS = 4500;

type ToastPush = { type: ToastType; message: string };

const ToastContext = createContext<{ push: (toast: ToastPush) => void } | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast requires ToastProvider");
  return ctx;
}

export function ToastProvider({
  children,
  regionLabel,
  dismissLabel,
}: {
  children: ReactNode;
  regionLabel: string;
  dismissLabel: string;
}) {
  const [stack, setStack] = useState<ToastEntry[]>([]);

  const push = useCallback((toast: ToastPush) => {
    const entry: ToastEntry = {
      id: crypto.randomUUID(),
      type: toast.type,
      message: toast.message,
    };
    setStack((prev) => pushToast(prev, entry));
  }, []);

  const dismiss = useCallback((id: string) => {
    setStack((prev) => dismissToast(prev, id));
  }, []);

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <ToastRegion
        stack={stack}
        dismiss={dismiss}
        regionLabel={regionLabel}
        dismissLabel={dismissLabel}
      />
    </ToastContext.Provider>
  );
}

function ToastRegion({
  stack,
  dismiss,
  regionLabel,
  dismissLabel,
}: {
  stack: ToastEntry[];
  dismiss: (id: string) => void;
  regionLabel: string;
  dismissLabel: string;
}) {
  const labelId = useId();
  if (stack.length === 0) return null;

  return (
    <div className="toast-host" role="region" aria-labelledby={labelId} aria-live="polite">
      <span id={labelId} className="sr-only">
        {regionLabel}
      </span>
      {stack.map((toast) => (
        <ToastItem key={toast.id} toast={toast} dismiss={dismiss} dismissLabel={dismissLabel} />
      ))}
    </div>
  );
}

function ToastItem({
  toast,
  dismiss,
  dismissLabel,
}: {
  toast: ToastEntry;
  dismiss: (id: string) => void;
  dismissLabel: string;
}) {
  useEffect(() => {
    if (!toastAutoDismisses(toast.type)) return;
    const timer = setTimeout(() => dismiss(toast.id), AUTO_MS);
    return () => clearTimeout(timer);
  }, [toast.id, toast.type, dismiss]);

  return (
    <div className={`toast glass toast-${toast.type}`} role="status">
      <p className="toast-message">{toast.message}</p>
      <button
        type="button"
        className="toast-dismiss"
        aria-label={dismissLabel}
        onClick={() => dismiss(toast.id)}
      >
        ×
      </button>
    </div>
  );
}

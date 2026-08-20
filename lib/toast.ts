export type ToastType = "success" | "info" | "warning" | "error";

export type ToastEntry = {
  id: string;
  type: ToastType;
  message: string;
};

export const TOAST_STACK_MAX = 2;

/** Success / info clear themselves; warning / error wait for dismiss. */
export function toastAutoDismisses(type: ToastType): boolean {
  return type === "success" || type === "info";
}

/** Push onto the stack; when full, drop the oldest. */
export function pushToast(stack: readonly ToastEntry[], entry: ToastEntry): ToastEntry[] {
  const next = [...stack, entry];
  if (next.length <= TOAST_STACK_MAX) return next;
  return next.slice(next.length - TOAST_STACK_MAX);
}

export function dismissToast(stack: readonly ToastEntry[], id: string): ToastEntry[] {
  return stack.filter((toast) => toast.id !== id);
}

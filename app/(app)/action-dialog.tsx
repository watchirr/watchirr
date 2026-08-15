"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";

export function ActionDialog({
  triggerLabel,
  triggerClassName = "season-open",
  title,
  detail,
  cancelLabel,
  confirmLabel,
  action,
  wide = false,
  lazy = false,
  children,
}: {
  triggerLabel: string;
  triggerClassName?: string;
  title: string;
  detail?: string;
  cancelLabel: string;
  confirmLabel: string;
  action: (formData: FormData) => void | Promise<void>;
  wide?: boolean;
  /** Defer mounting children until first open (season pickers, etc.). */
  lazy?: boolean;
  children?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [body, setBody] = useState(!lazy);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onClick = (e: MouseEvent) => {
      if (e.target === el) el.close();
    };
    el.addEventListener("click", onClick);
    return () => el.removeEventListener("click", onClick);
  }, []);

  function open() {
    if (!body) flushSync(() => setBody(true));
    ref.current?.showModal();
  }

  return (
    <>
      <button type="button" className={triggerClassName} onClick={open}>
        {triggerLabel}
      </button>
      <dialog ref={ref} className={wide ? "action-dialog is-wide" : "action-dialog"}>
        <form action={action} className="action-dialog-form">
          <h2 className="action-dialog-title">{title}</h2>
          {detail ? <p className="action-dialog-detail">{detail}</p> : null}
          {body ? children : null}
          <div className="action-dialog-actions">
            <button type="button" className="season-chip" onClick={() => ref.current?.close()}>
              {cancelLabel}
            </button>
            <button type="submit" className="add-btn">
              {confirmLabel}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}

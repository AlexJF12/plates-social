"use client";

import { useEffect, useRef } from "react";

// Asks before a delete (§6.6). A native <dialog> (focus trap, Esc to
// cancel) rather than window.confirm, which iOS standalone apps render
// poorly. The caller shows progress and errors inside it via `children`.
export function ConfirmDialog({
  open,
  title,
  confirmLabel,
  busy,
  onConfirm,
  onCancel,
  children,
}: {
  open: boolean;
  title: string;
  confirmLabel: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onCancel();
      }}
      className="m-auto w-[min(20rem,calc(100vw-2rem))] rounded-xl bg-surface p-5 text-foreground backdrop:bg-black/40"
    >
      <h2 className="text-base font-semibold">{title}</h2>
      <div className="mt-1 text-sm text-muted">{children}</div>
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onCancel} disabled={busy} className="h-11 rounded-lg px-4 text-sm font-medium disabled:opacity-60">
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className="h-11 rounded-lg bg-red-600 px-4 text-sm font-semibold text-white disabled:opacity-60"
        >
          {busy ? "Deleting…" : confirmLabel}
        </button>
      </div>
    </dialog>
  );
}

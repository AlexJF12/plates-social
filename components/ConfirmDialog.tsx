"use client";

import { useEffect, useRef } from "react";
import { button } from "./ui";

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
      className="m-auto w-[min(21rem,calc(100vw-2rem))] rounded-sheet bg-surface p-6 text-foreground backdrop:bg-black/50 backdrop:backdrop-blur-[2px]"
    >
      <h2 className="font-display text-dish">{title}</h2>
      <div className="mt-2 text-body text-muted">{children}</div>
      <div className="mt-6 grid grid-cols-2 gap-2">
        <button type="button" onClick={onCancel} disabled={busy} className={button({ variant: "secondary" })}>
          Cancel
        </button>
        <button type="button" onClick={onConfirm} disabled={busy} className={button({ variant: "destructive" })}>
          {busy ? "Deleting…" : confirmLabel}
        </button>
      </div>
    </dialog>
  );
}

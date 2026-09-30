"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ConfirmDialog } from "./ConfirmDialog";
import { ErrorText } from "./ui";

// Delete your own cook, after confirmation (§6.6): a quiet icon in the page
// header. On success, go to your profile; the cook's page no longer exists.
export function DeleteCookButton({ rkey, afterPath }: { rkey: string; afterPath: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/cook", { method: "DELETE", body: JSON.stringify({ rkey }) });
      if (!res.ok) throw new Error(String(res.status));
      router.replace(afterPath);
      router.refresh();
    } catch {
      setError("Couldn't delete it. Try again.");
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        aria-label="Delete cook"
        className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted active:bg-sunken"
      >
        <Trash2 size={21} strokeWidth={1.8} aria-hidden />
      </button>
      <ConfirmDialog
        open={open}
        title="Delete this cook?"
        confirmLabel="Delete"
        busy={busy}
        onConfirm={confirm}
        onCancel={() => setOpen(false)}
      >
        Its photos, kudos and comments will no longer be shown. This can&apos;t be undone.
        {error && <ErrorText className="mt-2">{error}</ErrorText>}
      </ConfirmDialog>
    </>
  );
}

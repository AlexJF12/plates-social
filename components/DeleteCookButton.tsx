"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ConfirmDialog } from "./ConfirmDialog";

// Delete your own cook, after confirmation (§6.6). On success, go to your
// profile; the cook's page no longer exists.
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
        className="h-11 rounded-lg border border-border px-4 text-sm font-medium text-red-600"
      >
        Delete cook
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
        {error && (
          <span role="alert" className="mt-2 block text-red-600">
            {error}
          </span>
        )}
      </ConfirmDialog>
    </>
  );
}

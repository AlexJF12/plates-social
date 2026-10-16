"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ConfirmDialog } from "./ConfirmDialog";
import { startReauth } from "./reauth";
import { ErrorText, button } from "./ui";

// Delete your own cook or visit, after confirmation (§6.6): a quiet icon in
// the page header. On success, go to your profile; the page no longer
// exists. A session from before visits can't delete one: it's offered
// "Sign in again" instead, and comes back here.
export function DeletePostButton({ kind, rkey, afterPath, viewerDid, herePath }: {
  kind: "cook" | "visit";
  rkey: string;
  afterPath: string;
  viewerDid: string;
  herePath: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reauth, setReauth] = useState(false);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/${kind}`, { method: "DELETE", body: JSON.stringify({ rkey }) });
      if (res.status === 403 && (await res.json().catch(() => ({}))).reauth) {
        setReauth(true);
        setBusy(false);
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      router.replace(afterPath);
      router.refresh();
    } catch {
      setError("Couldn't delete it. Try again.");
      setBusy(false);
    }
  }

  async function signInAgain() {
    setBusy(true);
    try {
      await startReauth(viewerDid, herePath);
    } catch {
      setError("Couldn't start sign-in. Try again.");
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
        aria-label={`Delete ${kind}`}
        className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted active:bg-sunken"
      >
        <Trash2 size={21} strokeWidth={1.8} aria-hidden />
      </button>
      <ConfirmDialog
        open={open}
        title={`Delete this ${kind}?`}
        confirmLabel="Delete"
        busy={busy}
        onConfirm={confirm}
        onCancel={() => setOpen(false)}
      >
        Its photos, kudos and comments will no longer be shown. This can&apos;t be undone.
        {reauth && (
          <div className="mt-3 flex flex-col gap-2">
            <span className="text-small text-muted">
              Deleting visits needs a new permission. Sign in again to allow it; you&apos;ll come back here.
            </span>
            <button type="button" onClick={signInAgain} disabled={busy} className={button({ variant: "secondary", full: true })}>
              {busy ? "Opening sign-in…" : "Sign in again"}
            </button>
          </div>
        )}
        {error && <ErrorText className="mt-2">{error}</ErrorText>}
      </ConfirmDialog>
    </>
  );
}

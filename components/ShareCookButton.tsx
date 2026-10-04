"use client";

import { TID } from "@atproto/common-web";
import { Link2, Share, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { CookImage } from "@/lib/db/schema";
import { imageUrl } from "@/lib/image/url";
import { cookPath } from "@/lib/links";
import { blueskyPostText, cookShareUrl, messageText } from "@/lib/share";
import { ErrorText, button } from "./ui";

type ShareCook = {
  uri: string;
  rkey: string;
  authorDid: string;
  dishName: string;
  note: string | null;
  images: CookImage[];
};

type BskyState =
  | { kind: "idle" }
  | { kind: "posting" }
  | { kind: "done"; url: string }
  | { kind: "error"; message: string }
  | { kind: "reauth" }
  | { kind: "redirecting" };

// Photos as JPEG files for the share sheet. The proxy serves WebP, which
// some SMS/MMS recipients can't open, so re-encode in the browser.
async function photoFiles(cook: ShareCook, signal: AbortSignal): Promise<File[]> {
  return Promise.all(
    cook.images.map(async (img, i) => {
      const res = await fetch(imageUrl(cook.authorDid, img.cid, "full"), { signal });
      if (!res.ok) throw new Error(`image ${res.status}`);
      const bitmap = await createImageBitmap(await res.blob());
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
      bitmap.close();
      const jpeg = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode failed"))), "image/jpeg", 0.9),
      );
      return new File([jpeg], `cook-${i + 1}.jpg`, { type: "image/jpeg" });
    }),
  );
}

// Share a cook (header icon → sheet): post it to Bluesky (the author only;
// the post reuses the photos already in their repo), or
// open the phone's native share sheet (iOS/Android) with the photos, text
// and link, to send it anywhere.
export function ShareCookButton({ cook, canPostToBluesky, viewerDid }: {
  cook: ShareCook;
  canPostToBluesky: boolean;
  viewerDid: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [origin, setOrigin] = useState("");
  const [bsky, setBsky] = useState<BskyState>({ kind: "idle" });
  // TID for the post, reused on retry so a lost response can't double-post.
  const rkey = useRef<string | null>(null);
  // Photos are prepared when the sheet opens: iOS only allows
  // navigator.share straight from a tap, not after awaiting downloads.
  const [files, setFiles] = useState<File[] | "loading" | "failed">("loading");
  const [messageError, setMessageError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  useEffect(() => {
    if (!open || files !== "loading") return;
    const ctrl = new AbortController();
    photoFiles(cook, ctrl.signal).then(setFiles, () => {
      if (!ctrl.signal.aborted) setFiles("failed");
    });
    return () => ctrl.abort();
  }, [open, files, cook]);

  const url = origin ? cookShareUrl(origin, cook.authorDid, cook.rkey) : "";
  const preview = url ? blueskyPostText(cook, url).text : "";

  function show() {
    setOrigin(window.location.origin);
    setMessageError(null);
    setCopied(false);
    if (bsky.kind === "error") setBsky({ kind: "idle" });
    setOpen(true);
  }

  async function postToBluesky() {
    setBsky({ kind: "posting" });
    try {
      const res = await fetch("/api/share/bluesky", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cook: cook.uri, rkey: (rkey.current ??= TID.nextStr()) }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 403 && data.reauth) return setBsky({ kind: "reauth" });
      if (!res.ok || typeof data.url !== "string") throw new Error(data.error || "Posting failed");
      setBsky({ kind: "done", url: data.url });
    } catch {
      setBsky({ kind: "error", message: "Couldn't post it to Bluesky. Try again." });
    }
  }

  // Sign in again (same account) to grant the Bluesky post scope, then come
  // back to this cook.
  async function signInAgain() {
    setBsky({ kind: "redirecting" });
    try {
      const res = await fetch("/oauth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle: viewerDid, next: cookPath(cook.authorDid, cook.rkey) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error();
      window.location.href = data.redirectUrl;
    } catch {
      setBsky({ kind: "error", message: "Couldn't start sign-in. Try again." });
    }
  }

  async function shareNative() {
    setMessageError(null);
    const text = messageText(cook, url);
    const withFiles = Array.isArray(files) && files.length > 0 ? { files, text } : null;
    try {
      if (navigator.share) {
        // The link goes in the text: some share targets drop `url` when
        // files are attached.
        if (withFiles && navigator.canShare?.(withFiles)) await navigator.share(withFiles);
        else await navigator.share({ text });
        return;
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return; // closed the sheet
      setMessageError("Couldn't open sharing. Try again.");
      return;
    }
    // No Web Share (most desktop browsers): a text message without photos.
    window.location.href = `sms:?&body=${encodeURIComponent(text)}`;
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setMessageError("Couldn't copy the link.");
    }
  }

  const first = cook.images[0];

  return (
    <>
      <button
        type="button"
        onClick={show}
        aria-label="Share cook"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted active:bg-sunken"
      >
        <Share size={21} strokeWidth={1.8} aria-hidden />
      </button>
      <dialog
        ref={ref}
        aria-labelledby="share-h"
        onCancel={(e) => {
          e.preventDefault();
          setOpen(false);
        }}
        onClick={(e) => {
          if (e.target === ref.current) setOpen(false); // tap on the backdrop
        }}
        className="m-auto mb-[calc(env(safe-area-inset-bottom)+0.5rem)] w-[min(28rem,calc(100vw-1rem))] rounded-sheet bg-surface p-5 text-foreground backdrop:bg-black/50 backdrop:backdrop-blur-[2px]"
      >
        <div className="flex items-center justify-between">
          <h2 id="share-h" className="font-display text-dish">Share this cook</h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="-mr-2 flex h-11 w-11 items-center justify-center rounded-full text-muted active:bg-sunken"
          >
            <X size={22} strokeWidth={1.8} aria-hidden />
          </button>
        </div>

        <div className="mt-3 flex gap-3 rounded-control bg-sunken p-3" data-testid="share-preview">
          {first && (
            // eslint-disable-next-line @next/next/no-img-element -- already resized by our image proxy
            <img
              src={imageUrl(cook.authorDid, first.cid, "thumb")}
              alt=""
              className="h-16 w-16 shrink-0 rounded-control bg-background object-cover"
            />
          )}
          <div className="min-w-0 flex-1">
            <p className="line-clamp-4 text-small break-words whitespace-pre-line">{preview}</p>
            {cook.images.length > 1 && (
              <p className="mt-1 text-caption text-muted">{cook.images.length} photos</p>
            )}
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-2">
          {canPostToBluesky && <BlueskyAction state={bsky} onPost={postToBluesky} onReauth={signInAgain} />}

          <button
            type="button"
            onClick={shareNative}
            disabled={!url || files === "loading"}
            className={button({ variant: canPostToBluesky ? "secondary" : "primary", full: true })}
          >
            <Share size={19} strokeWidth={1.9} aria-hidden />
            {files === "loading" ? "Preparing photos…" : "Share…"}
          </button>
          {files === "failed" && (
            <p className="text-small text-muted">The photos couldn&apos;t be prepared; only the text and link will be shared.</p>
          )}

          <button type="button" onClick={copyLink} disabled={!url} className={button({ variant: "quiet", full: true })}>
            <Link2 size={19} strokeWidth={1.9} aria-hidden />
            {copied ? "Link copied" : "Copy link"}
          </button>
          {messageError && <ErrorText>{messageError}</ErrorText>}
        </div>
      </dialog>
    </>
  );
}

function BlueskyAction({ state, onPost, onReauth }: {
  state: BskyState;
  onPost: () => void;
  onReauth: () => void;
}) {
  if (state.kind === "done") {
    return (
      <div className="flex flex-col gap-2">
        <p role="status" className="text-small text-accent">Posted to Bluesky.</p>
        <a href={state.url} target="_blank" rel="noopener noreferrer" className={button({ variant: "selected", full: true })}>
          <ButterflyIcon />
          View on Bluesky
        </a>
      </div>
    );
  }
  if (state.kind === "reauth" || state.kind === "redirecting") {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-small text-muted">
          Posting to Bluesky needs a new permission. Sign in again to allow it; you&apos;ll come back here.
        </p>
        <button type="button" onClick={onReauth} disabled={state.kind === "redirecting"} className={button({ full: true })}>
          {state.kind === "redirecting" ? "Opening sign-in…" : "Sign in again"}
        </button>
      </div>
    );
  }
  return (
    <>
      <button type="button" onClick={onPost} disabled={state.kind === "posting"} className={button({ full: true })}>
        <ButterflyIcon />
        {state.kind === "posting" ? "Posting…" : "Post to Bluesky"}
      </button>
      {state.kind === "error" && <ErrorText>{state.message}</ErrorText>}
    </>
  );
}

// Bluesky's butterfly, in the current text color (lucide has no brand icons).
function ButterflyIcon() {
  return (
    <svg viewBox="0 0 600 530" width={19} height={17} aria-hidden fill="currentColor">
      <path d="m135.72 44.03c66.496 49.921 138.02 151.14 164.28 205.46 26.262-54.316 97.782-155.54 164.28-205.46 47.98-36.021 125.72-63.892 125.72 24.795 0 17.712-10.155 148.79-16.111 170.07-20.703 73.984-96.144 92.854-163.25 81.433 117.3 19.964 147.14 86.092 82.697 152.22-122.39 125.59-175.91-31.511-189.63-71.766-2.514-7.3797-3.6904-10.832-3.7077-7.8964-0.0174-2.9357-1.1937 0.51669-3.7077 7.8964-13.714 40.255-67.233 197.36-189.63 71.766-64.444-66.128-34.605-132.26 82.697-152.22-67.108 11.421-142.55-7.4491-163.25-81.433-5.9562-21.282-16.111-152.36-16.111-170.07 0-88.687 77.742-60.816 125.72-24.795z" />
    </svg>
  );
}

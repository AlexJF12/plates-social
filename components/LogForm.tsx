"use client";

import { Camera, ImagePlus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { TID } from "@atproto/common-web";
import { datetimeLocalInputToCookedAt, toDatetimeLocalInput } from "@/lib/cook/datetime";
import { MEAL_TYPES } from "@/lib/cook/mealTypes";
import { processImage } from "@/lib/image/process";
import { cookPath, visitPath } from "@/lib/links";
import { startReauth } from "./reauth";
import { StarRating } from "./StarRating";
import { ErrorText, FieldLabel, button, chip, input } from "./ui";

const MAX_PHOTOS = 4;
const DISH_MAX = 100;
const NOTE_MAX = 1000;
// Visits (§4): restaurant name and area ≤ 100 graphemes, review ≤ 1000.
const PLACE_MAX = 100;
const REVIEW_MAX = 1000;

// What's being logged: a cook, or a meal eaten out (Phase 6.8).
type Mode = "cook" | "visit";
const MODES: { value: Mode; label: string }[] = [
  { value: "cook", label: "Cooked it" },
  { value: "visit", label: "Ate out" },
];
// The last mode, for the rest of this session (sessionStorage).
const MODE_KEY = "logMode";
// Unreferenced blobs are garbage-collected by the PDS, so don't reuse an
// uploaded blob on retry after this long; upload it again instead.
const BLOB_REUSE_MS = 10 * 60 * 1000;

type Uploaded = { blob: unknown; width: number; height: number; at: number };
type Photo = {
  id: string;
  blob: Blob;
  previewUrl: string;
  uploaded?: Uploaded;
};
type Phase =
  | { kind: "idle" }
  | { kind: "uploading"; index: number; total: number; percent: number }
  | { kind: "posting" }
  | { kind: "error"; message: string }
  // An old session without the visit scope (Phase 6.8).
  | { kind: "reauth" };

const segmenter =
  typeof Intl !== "undefined" && "Segmenter" in Intl
    ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
    : null;
const graphemes = (s: string) =>
  segmenter ? [...segmenter.segment(s)].length : [...s].length;

// XHR rather than fetch: fetch has no upload progress events.
function uploadPhoto(blob: Blob, onProgress: (loaded: number) => void) {
  return new Promise<Omit<Uploaded, "at">>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/blob");
    xhr.setRequestHeader("Content-Type", blob.type);
    xhr.responseType = "json";
    xhr.timeout = 60_000;
    xhr.upload.onprogress = (e) => onProgress(e.loaded);
    xhr.onload = () =>
      xhr.status === 200
        ? resolve(xhr.response)
        : reject(new Error(xhr.response?.error || `Upload failed (${xhr.status})`));
    xhr.onerror = () => reject(new Error("Network error while uploading"));
    xhr.ontimeout = () => reject(new Error("Upload timed out"));
    xhr.send(blob);
  });
}

// The Log screen: a cook, or (switch at the top) a meal eaten out. Both
// share the photos, meal type and date, which survive switching modes.
export function LogForm({ viewerDid }: { viewerDid: string }) {
  const router = useRouter();
  const [mode, setModeState] = useState<Mode>("cook");
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = sessionStorage.getItem(MODE_KEY);
    } catch {}
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sessionStorage is only readable after hydration
    if (saved === "visit") setModeState("visit");
  }, []);
  const fileInput = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [processing, setProcessing] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [dishName, setDishName] = useState("");
  const [mealType, setMealType] = useState("");
  const [note, setNote] = useState("");
  const [restaurantName, setRestaurantName] = useState("");
  const [restaurantArea, setRestaurantArea] = useState("");
  const [rating, setRating] = useState(0);
  const [review, setReview] = useState("");
  // Filled in on mount: "now" must be the phone's local time, not the
  // server's (the server renders this form in its own time zone).
  const [cookedAtInput, setCookedAtInput] = useState("");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- client-only initial value
    setCookedAtInput((v) => v || toDatetimeLocalInput(new Date()));
  }, []);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  // One rkey per post (per mode), kept across retries so a retry can't
  // duplicate it.
  const rkeys = useRef<Partial<Record<Mode, string>>>({});

  // Switching keeps the photos, meal type and date.
  function setMode(m: Mode) {
    setModeState(m);
    try {
      sessionStorage.setItem(MODE_KEY, m);
    } catch {}
    if (phase.kind === "error" || phase.kind === "reauth") setPhase({ kind: "idle" });
  }

  // Revoke preview URLs when the form goes away.
  const photosRef = useRef(photos);
  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);
  useEffect(() => () => photosRef.current.forEach((p) => URL.revokeObjectURL(p.previewUrl)), []);

  const busy = phase.kind === "uploading" || phase.kind === "posting";
  const cookedAt = datetimeLocalInputToCookedAt(cookedAtInput);
  const dishLen = graphemes(dishName.trim());
  const noteLen = graphemes(note.trim());
  const nameLen = graphemes(restaurantName.trim());
  const areaLen = graphemes(restaurantArea.trim());
  const reviewLen = graphemes(review.trim());
  const fieldsOk =
    mode === "cook"
      ? dishLen > 0 && dishLen <= DISH_MAX && noteLen <= NOTE_MAX
      : nameLen > 0 && nameLen <= PLACE_MAX && areaLen <= PLACE_MAX && rating >= 1 && reviewLen <= REVIEW_MAX;
  const canSubmit =
    !busy && !processing && photos.length > 0 && fieldsOk && mealType !== "" && cookedAt !== null;

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setPhotoError(null);
    const room = MAX_PHOTOS - photos.length;
    const picked = Array.from(files).slice(0, room);
    if (files.length > room) setPhotoError(`Up to ${MAX_PHOTOS} photos. Extra photos were skipped.`);
    setProcessing(true);
    const added: Photo[] = [];
    for (const file of picked) {
      try {
        const { blob } = await processImage(file);
        added.push({ id: crypto.randomUUID(), blob, previewUrl: URL.createObjectURL(blob) });
      } catch (err) {
        setPhotoError(err instanceof Error ? err.message : "Couldn't read that photo");
      }
    }
    setPhotos((prev) => [...prev, ...added]);
    setProcessing(false);
    if (fileInput.current) fileInput.current.value = "";
  }

  function removePhoto(id: string) {
    setPhotos((prev) => {
      const gone = prev.find((p) => p.id === id);
      if (gone) URL.revokeObjectURL(gone.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    const rkey = (rkeys.current[mode] ??= TID.nextStr());

    // Upload photos not yet uploaded (or uploaded too long ago). Results are
    // kept on each photo so a retry picks up where this attempt stopped.
    const current = photos.map((p) => ({ ...p }));
    const todo = current.filter((p) => !p.uploaded || Date.now() - p.uploaded.at > BLOB_REUSE_MS);
    const totalBytes = todo.reduce((n, p) => n + p.blob.size, 0);
    let doneBytes = 0;
    try {
      for (const [i, photo] of todo.entries()) {
        setPhase({ kind: "uploading", index: i + 1, total: todo.length, percent: Math.round((doneBytes / totalBytes) * 100) });
        const res = await uploadPhoto(photo.blob, (loaded) =>
          setPhase({
            kind: "uploading",
            index: i + 1,
            total: todo.length,
            percent: Math.round(((doneBytes + loaded) / totalBytes) * 100),
          }),
        );
        photo.uploaded = { ...res, at: Date.now() };
        doneBytes += photo.blob.size;
        setPhotos((prev) => prev.map((p) => (p.id === photo.id ? { ...p, uploaded: photo.uploaded } : p)));
      }

      setPhase({ kind: "posting" });
      const images = current.map((p) => ({
        blob: p.uploaded!.blob,
        width: p.uploaded!.width,
        height: p.uploaded!.height,
      }));
      const fields =
        mode === "cook"
          ? { dishName, note, cookedAt }
          : { restaurantName, restaurantArea, rating, review, visitedAt: cookedAt };
      const res = await fetch(`/api/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rkey, mealType, ...fields, images }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 403 && data.reauth) {
        setPhase({ kind: "reauth" });
        return;
      }
      if (!res.ok) throw new Error(data.error || `Posting failed (${res.status})`);

      // at://did/collection/rkey -> the new post's page.
      const [, , did, , rk] = String(data.uri).split("/");
      router.push((mode === "cook" ? cookPath : visitPath)(did, rk));
      router.refresh();
    } catch (err) {
      const message =
        err instanceof TypeError
          ? `Network error. Your ${mode} wasn't posted.`
          : err instanceof Error
            ? err.message
            : "Something went wrong";
      setPhase({ kind: "error", message });
    }
  }

  const label =
    phase.kind === "uploading"
      ? `Uploading photo ${phase.index} of ${phase.total}… ${phase.percent}%`
      : phase.kind === "posting"
        ? "Posting…"
        : phase.kind === "error"
          ? "Retry"
          : mode === "cook"
            ? "Post cook"
            : "Post visit";

  async function signInAgain() {
    setPhase({ kind: "posting" });
    try {
      await startReauth(viewerDid, "/log");
    } catch {
      setPhase({ kind: "error", message: "Couldn't start sign-in. Try again." });
    }
  }

  return (
    <form onSubmit={submit} className="space-y-7">
      <div role="group" aria-label="What to log" className="grid grid-cols-2 rounded-full bg-sunken p-0.5">
        {MODES.map((m) => (
          <button
            key={m.value}
            type="button"
            aria-pressed={mode === m.value}
            onClick={() => setMode(m.value)}
            disabled={busy}
            className={`flex h-11 items-center justify-center rounded-full text-body font-semibold transition-colors duration-150 ${
              mode === m.value ? "bg-surface text-foreground" : "text-muted active:text-foreground"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      <section aria-label="Photos">
        {photos.length === 0 ? (
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={busy || processing}
            className="flex aspect-[3/2] w-full flex-col items-center justify-center rounded-sheet bg-sunken text-center transition-transform duration-100 active:scale-[0.99] disabled:opacity-50"
          >
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-accent text-accent-foreground">
              <Camera size={26} strokeWidth={2} aria-hidden />
            </span>
            <span className="mt-3 text-lead font-semibold">{processing ? "Preparing…" : "Add photos"}</span>
            <span className="mt-0.5 text-small text-muted">Take one or choose up to {MAX_PHOTOS}</span>
          </button>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {photos.map((p, i) => (
              <div key={p.id} className="relative aspect-square overflow-hidden rounded-control bg-sunken">
                {/* eslint-disable-next-line @next/next/no-img-element -- local object URL */}
                <img src={p.previewUrl} alt={`Photo ${i + 1}`} className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => removePhoto(p.id)}
                  disabled={busy}
                  aria-label={`Remove photo ${i + 1}`}
                  className="absolute top-0 right-0 flex h-11 w-11 items-center justify-center disabled:opacity-50"
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm">
                    <X size={16} strokeWidth={2.5} aria-hidden />
                  </span>
                </button>
              </div>
            ))}
            {photos.length < MAX_PHOTOS && (
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                disabled={busy || processing}
                className="flex aspect-square flex-col items-center justify-center rounded-control border-2 border-dashed border-border text-small font-semibold text-muted active:bg-sunken disabled:opacity-50"
              >
                <ImagePlus size={26} strokeWidth={1.8} aria-hidden />
                <span className="mt-2">{processing ? "Preparing…" : "Add more"}</span>
                <span className="mt-0.5 font-normal tabular-nums">
                  {photos.length} of {MAX_PHOTOS}
                </span>
              </button>
            )}
          </div>
        )}
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          multiple
          hidden
          data-testid="photo-input"
          onChange={(e) => onFiles(e.target.files)}
        />
        {photoError && <ErrorText className="mt-2">{photoError}</ErrorText>}
      </section>

      {mode === "cook" ? (
        <label className="block">
          <FieldLabel>Dish</FieldLabel>
          <input
            type="text"
            name="dishName"
            value={dishName}
            onChange={(e) => setDishName(e.target.value)}
            placeholder="What did you cook?"
            disabled={busy}
            className={`${input} h-12`}
          />
          {dishLen > DISH_MAX && (
            <span className="mt-1 block text-caption text-danger">
              {dishLen}/{DISH_MAX} characters
            </span>
          )}
        </label>
      ) : (
        <>
          <label className="block">
            <FieldLabel>Restaurant</FieldLabel>
            <input
              type="text"
              name="restaurantName"
              value={restaurantName}
              onChange={(e) => setRestaurantName(e.target.value)}
              placeholder="Where did you eat?"
              disabled={busy}
              className={`${input} h-12`}
            />
            {nameLen > PLACE_MAX && (
              <span className="mt-1 block text-caption text-danger">
                {nameLen}/{PLACE_MAX} characters
              </span>
            )}
          </label>
          <label className="block">
            <FieldLabel optional>Area</FieldLabel>
            <input
              type="text"
              name="restaurantArea"
              value={restaurantArea}
              onChange={(e) => setRestaurantArea(e.target.value)}
              placeholder="Neighbourhood or city"
              disabled={busy}
              className={`${input} h-12`}
            />
            {areaLen > PLACE_MAX && (
              <span className="mt-1 block text-caption text-danger">
                {areaLen}/{PLACE_MAX} characters
              </span>
            )}
          </label>
          <fieldset>
            <legend className="p-0">
              <FieldLabel>Rating</FieldLabel>
            </legend>
            <StarRating value={rating} onChange={setRating} disabled={busy} />
          </fieldset>
        </>
      )}

      <fieldset>
        <legend className="p-0">
          <FieldLabel>Meal</FieldLabel>
        </legend>
        <div className="flex flex-wrap gap-2">
          {MEAL_TYPES.map((m) => (
            <button
              key={m.value}
              type="button"
              aria-pressed={mealType === m.value}
              onClick={() => setMealType(m.value)}
              disabled={busy}
              className={chip(mealType === m.value)}
            >
              {m.label}
            </button>
          ))}
        </div>
      </fieldset>

      {mode === "cook" ? (
        <label className="block">
          <FieldLabel optional>Note</FieldLabel>
          <textarea
            name="note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={4}
            disabled={busy}
            placeholder="How did it turn out? What would you change?"
            className={`${input} block resize-none py-3`}
          />
          {noteLen > NOTE_MAX * 0.9 && (
            <span className={`mt-1 block text-caption tabular-nums ${noteLen > NOTE_MAX ? "text-danger" : "text-muted"}`}>
              {noteLen}/{NOTE_MAX}
            </span>
          )}
        </label>
      ) : (
        <label className="block">
          <FieldLabel optional>Review</FieldLabel>
          <textarea
            name="review"
            value={review}
            onChange={(e) => setReview(e.target.value)}
            rows={4}
            disabled={busy}
            placeholder="What did you have? Would you go back?"
            className={`${input} block resize-none py-3`}
          />
          {reviewLen > REVIEW_MAX * 0.9 && (
            <span className={`mt-1 block text-caption tabular-nums ${reviewLen > REVIEW_MAX ? "text-danger" : "text-muted"}`}>
              {reviewLen}/{REVIEW_MAX}
            </span>
          )}
        </label>
      )}

      <label className="block">
        <FieldLabel>{mode === "cook" ? "Cooked" : "When"}</FieldLabel>
        <input
          type="datetime-local"
          name="cookedAt"
          value={cookedAtInput}
          onChange={(e) => setCookedAtInput(e.target.value)}
          disabled={busy}
          className={`${input} h-12`}
        />
      </label>

      {phase.kind === "error" && <ErrorText>{phase.message}</ErrorText>}
      {phase.kind === "reauth" && (
        <div className="space-y-2 rounded-control bg-sunken p-4" role="alert">
          <p className="text-small">
            Posting visits needs a new permission. Sign in again to allow it, then post this again (the photos
            will need adding again).
          </p>
          <button type="button" onClick={signInAgain} className={button({ variant: "secondary", full: true })}>
            Sign in again
          </button>
        </div>
      )}

      <button type="submit" disabled={!canSubmit} className={`${button({ size: "lg", full: true })} relative overflow-hidden`}>
        {phase.kind === "uploading" && (
          <span
            aria-hidden
            className="absolute inset-y-0 left-0 bg-black/20 transition-[width]"
            style={{ width: `${phase.percent}%` }}
          />
        )}
        <span className="relative">{label}</span>
      </button>
    </form>
  );
}

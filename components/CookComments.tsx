"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { TID } from "@atproto/common-web";
import type { CommentPage, CommentView } from "@/lib/db/queries";
import { displayName, profilePath } from "@/lib/links";
import { Avatar } from "./Avatar";
import { ConfirmDialog } from "./ConfirmDialog";
import { TimeAgo } from "./TimeAgo";

const MAX_GRAPHEMES = 500; // §4
const MAX_BYTES = 5000; // Lexicon maxLength (UTF-8 bytes)
const segmenter = typeof Intl !== "undefined" && "Segmenter" in Intl ? new Intl.Segmenter() : null;
const graphemes = (s: string) => (segmenter ? [...segmenter.segment(s)].length : [...s].length);

// A cook's comments, oldest first, with infinite scroll (§6.2), a composer,
// and delete for your own (§6.6). Nothing looks posted or deleted until
// the server confirms (§7).
export function CookComments({
  cookUri,
  viewerDid,
  initial,
  initialCount,
}: {
  cookUri: string;
  viewerDid: string;
  initial: CommentPage;
  initialCount: number;
}) {
  const [items, setItems] = useState<CommentView[]>(initial.items);
  const [cursor, setCursor] = useState(initial.cursor);
  const [count, setCount] = useState(initialCount);
  const [loadState, setLoadState] = useState<"idle" | "loading" | "error">("idle");
  const sentinel = useRef<HTMLDivElement>(null);

  const loadMore = useCallback(async () => {
    if (!cursor || loadState === "loading") return;
    setLoadState("loading");
    try {
      const res = await fetch(`/api/comment?${new URLSearchParams({ cook: cookUri, cursor })}`);
      if (!res.ok) throw new Error(String(res.status));
      const page: CommentPage = await res.json();
      setItems((prev) => {
        const seen = new Set(prev.map((c) => c.uri));
        return [...prev, ...page.items.filter((c) => !seen.has(c.uri))];
      });
      setCursor(page.cursor);
      setLoadState("idle");
    } catch {
      setLoadState("error");
    }
  }, [cookUri, cursor, loadState]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || !cursor || loadState !== "idle") return;
    const io = new IntersectionObserver((entries) => entries[0].isIntersecting && loadMore(), {
      rootMargin: "400px 0px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, [cursor, loadState, loadMore]);

  // Composer. The rkey is kept across retries of the same text, so a lost
  // response can't post the comment twice (see /api/comment).
  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const rkey = useRef<string | null>(null);
  const length = graphemes(text.trim());
  const tooLong = length > MAX_GRAPHEMES || new TextEncoder().encode(text.trim()).length > MAX_BYTES;

  async function post(e: React.FormEvent) {
    e.preventDefault();
    if (length === 0 || tooLong || posting) return;
    setPosting(true);
    setPostError(null);
    try {
      const res = await fetch("/api/comment", {
        method: "POST",
        body: JSON.stringify({ cook: cookUri, text, rkey: (rkey.current ??= TID.nextStr()) }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const comment: CommentView = await res.json();
      rkey.current = null;
      setText("");
      // Only append if the list is fully loaded; otherwise it arrives with
      // the last page, in order.
      if (!cursor) setItems((prev) => (prev.some((c) => c.uri === comment.uri) ? prev : [...prev, comment]));
      setCount((n) => n + 1);
    } catch {
      setPostError("Couldn't post your comment. Try again.");
    } finally {
      setPosting(false);
    }
  }

  // Delete, after confirmation.
  const [confirming, setConfirming] = useState<CommentView | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function confirmDelete() {
    if (!confirming) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch("/api/comment", { method: "DELETE", body: JSON.stringify({ uri: confirming.uri }) });
      if (!res.ok) throw new Error(String(res.status));
      setItems((prev) => prev.filter((c) => c.uri !== confirming.uri));
      setCount((n) => Math.max(0, n - 1));
      setConfirming(null);
    } catch {
      setDeleteError("Couldn't delete it. Try again.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section className="mt-6 border-t border-border px-4 pt-4" aria-labelledby="comments-h">
      <h3 id="comments-h" className="text-sm font-semibold" data-testid="comment-count">
        {count} {count === 1 ? "comment" : "comments"}
      </h3>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-muted">No comments yet.</p>
      ) : (
        <ul className="mt-3 space-y-4">
          {items.map((c) => (
            <li key={c.uri} className="flex gap-3" data-testid="comment">
              <Link href={profilePath(c.author)} className="shrink-0">
                <Avatar author={c.author} size={32} />
              </Link>
              <div className="min-w-0 flex-1">
                <p className="text-sm">
                  <Link href={profilePath(c.author)} className="font-semibold">
                    {displayName(c.author)}
                  </Link>{" "}
                  <span className="text-muted">
                    <TimeAgo iso={c.sortAt} />
                  </span>
                </p>
                <p className="text-[15px] break-words whitespace-pre-line">{c.text}</p>
              </div>
              {c.author.did === viewerDid && (
                <button
                  type="button"
                  onClick={() => {
                    setDeleteError(null);
                    setConfirming(c);
                  }}
                  className="-mt-2 -mr-2 h-11 shrink-0 px-2 text-xs text-muted"
                  aria-label="Delete comment"
                >
                  Delete
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {cursor && (
        <div ref={sentinel} className="flex min-h-12 items-center justify-center text-sm text-muted">
          {loadState === "loading" && "Loading…"}
          {loadState === "error" && (
            <button type="button" onClick={loadMore} className="h-11 px-4 text-accent">
              Couldn&apos;t load more. Retry
            </button>
          )}
        </div>
      )}

      <form onSubmit={post} className="mt-5" aria-label="Add a comment">
        <label htmlFor="comment-text" className="sr-only">
          Add a comment
        </label>
        <textarea
          id="comment-text"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            rkey.current = null; // new text = a new comment
          }}
          rows={2}
          placeholder="Add a comment"
          className="block w-full resize-y rounded-lg border border-border bg-surface px-3 py-2 text-base"
        />
        <div className="mt-2 flex items-center justify-between gap-3">
          <span className={`text-xs ${tooLong ? "text-red-600" : "text-muted"}`}>
            {length > MAX_GRAPHEMES - 100 ? `${length}/${MAX_GRAPHEMES}` : ""}
          </span>
          <button
            type="submit"
            disabled={length === 0 || tooLong || posting}
            className="h-11 rounded-lg bg-accent px-5 text-sm font-semibold text-accent-foreground disabled:opacity-50"
          >
            {posting ? "Posting…" : postError ? "Retry" : "Post"}
          </button>
        </div>
        {postError && (
          <p role="alert" className="mt-1 text-xs text-red-600">
            {postError}
          </p>
        )}
      </form>

      <ConfirmDialog
        open={confirming !== null}
        title="Delete this comment?"
        confirmLabel="Delete"
        busy={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setConfirming(null)}
      >
        It will be removed from your repository.
        {deleteError && (
          <span role="alert" className="mt-2 block text-red-600">
            {deleteError}
          </span>
        )}
      </ConfirmDialog>
    </section>
  );
}
